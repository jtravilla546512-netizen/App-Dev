<?php

namespace App\Services;

use App\Enums\BookCopyStatus;
use App\Enums\BorrowRequestStatus;
use App\Enums\LoanStatus;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Exceptions\DomainConflictException;
use App\Models\Book;
use App\Models\BookCopy;
use App\Models\BorrowRequest;
use App\Models\Loan;
use App\Models\User;
use App\Notifications\BorrowRequestReviewedNotification;
use App\Notifications\BorrowRequestSubmittedNotification;
use App\Notifications\LoanCreatedNotification;
use App\Repositories\Contracts\BorrowRequestRepositoryContract;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class BorrowRequestService
{
    public function __construct(
        private readonly BorrowRequestRepositoryContract $requests,
        private readonly AuditService $audit,
    ) {}

    public function paginateForUser(array $filters, User $user): LengthAwarePaginator
    {
        unset($filters['user_id']);

        return $this->requests->paginate($filters, $user);
    }

    public function paginateForAdmin(array $filters): LengthAwarePaginator
    {
        return $this->requests->paginate($filters);
    }

    public function show(BorrowRequest $borrowRequest): BorrowRequest
    {
        return $this->requests->loadForView($borrowRequest);
    }

    public function create(int $bookId, User $user): BorrowRequest
    {
        return DB::transaction(function () use ($bookId, $user): BorrowRequest {
            $user = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            app(BorrowingEligibilityService::class)->enforce($user);
            $book = Book::query()->with('category')->lockForUpdate()->findOrFail($bookId);

            if (! $book->is_active || ! $book->category?->is_active) {
                throw new DomainConflictException('Borrow requests are only allowed for active catalog books.');
            }

            $hasAvailableCopy = $book->copies()
                ->where('status', BookCopyStatus::Available->value)
                ->exists();

            if (! $hasAvailableCopy) {
                throw new DomainConflictException('This book currently has no available copies.');
            }

            if ($this->requests->hasActiveRequest($user, $book)) {
                throw new DomainConflictException('You already have an active request for this book.');
            }

            $hasActiveLoanForTitle = Loan::query()
                ->where('user_id', $user->id)
                ->whereIn('status', [LoanStatus::Borrowed->value, LoanStatus::Overdue->value])
                ->whereHas('bookCopy', fn ($copy) => $copy->where('book_id', $book->id))
                ->exists();

            if ($hasActiveLoanForTitle) {
                throw new DomainConflictException('You already have an active loan for this book.');
            }

            $borrowRequest = $this->requests->create($user, $book);
            $this->audit->record($user, 'borrow_request.created', $borrowRequest, after: $borrowRequest->toArray());
            $borrowRequest->load('user', 'book');
            User::query()
                ->where('role', UserRole::Admin->value)
                ->where('status', UserStatus::Active->value)
                ->each(fn (User $admin) => $admin->notify(new BorrowRequestSubmittedNotification($borrowRequest)));

            return $this->requests->loadForView($borrowRequest);
        });
    }

    public function cancel(BorrowRequest $borrowRequest, User $user): BorrowRequest
    {
        return DB::transaction(function () use ($borrowRequest, $user): BorrowRequest {
            $borrowRequest = $this->requests->lockForUpdate($borrowRequest);

            if ($borrowRequest->status !== BorrowRequestStatus::Pending) {
                throw new DomainConflictException('Only pending borrow requests can be cancelled.');
            }

            $before = $borrowRequest->toArray();
            $borrowRequest = $this->requests->update($borrowRequest, [
                'status' => BorrowRequestStatus::Cancelled,
            ]);
            $this->audit->record($user, 'borrow_request.cancelled', $borrowRequest, $before, $borrowRequest->toArray());

            return $this->requests->loadForView($borrowRequest);
        });
    }

    public function approve(BorrowRequest $borrowRequest, array $attributes, User $admin): BorrowRequest
    {
        return $this->review($borrowRequest, BorrowRequestStatus::Approved, $attributes, $admin);
    }

    public function reject(BorrowRequest $borrowRequest, array $attributes, User $admin): BorrowRequest
    {
        return $this->review($borrowRequest, BorrowRequestStatus::Rejected, $attributes, $admin);
    }

    private function review(
        BorrowRequest $borrowRequest,
        BorrowRequestStatus $status,
        array $attributes,
        User $admin,
    ): BorrowRequest {
        return DB::transaction(function () use ($borrowRequest, $status, $attributes, $admin): BorrowRequest {
            // Serialize all issuance for a member, even across different titles.
            $member = User::query()->whereKey($borrowRequest->user_id)->lockForUpdate()->firstOrFail();
            $borrowRequest = $this->requests->lockForUpdate($borrowRequest);

            if ($borrowRequest->status !== BorrowRequestStatus::Pending) {
                throw new DomainConflictException('Only pending borrow requests can be reviewed.');
            }

            $copy = null;
            if ($status === BorrowRequestStatus::Approved) {
                app(BorrowingEligibilityService::class)->enforce($member);
                $book = Book::query()->with('category')->lockForUpdate()->findOrFail($borrowRequest->book_id);
                if (! $book->is_active || ! $book->category?->is_active) {
                    throw new DomainConflictException('This request cannot be approved because the catalog item is inactive.');
                }

                $activeLoans = Loan::query()
                    ->where('user_id', $borrowRequest->user_id)
                    ->whereIn('status', [LoanStatus::Borrowed->value, LoanStatus::Overdue->value])
                    ->count();
                if ($activeLoans >= (int) config('library.max_active_loans')) {
                    throw new DomainConflictException('This member has reached the maximum number of active loans.');
                }

                $copyQuery = BookCopy::query()
                    ->where('book_id', $borrowRequest->book_id)
                    ->where('status', BookCopyStatus::Available->value);
                if (isset($attributes['book_copy_id'])) {
                    $copyQuery->whereKey($attributes['book_copy_id']);
                }
                $copy = $copyQuery->orderBy('id')->lockForUpdate()->first();

                if ($copy === null) {
                    throw new DomainConflictException('This request cannot be approved because no active copy is available.');
                }
            }

            $before = $borrowRequest->toArray();
            $borrowRequest = $this->requests->update($borrowRequest, [
                'status' => $status,
                'reviewed_at' => now(),
                'reviewed_by' => $admin->id,
                'rejection_reason' => $status === BorrowRequestStatus::Rejected
                    ? $attributes['rejection_reason']
                    : null,
                'admin_notes' => $attributes['admin_notes'] ?? null,
            ]);

            $action = $status === BorrowRequestStatus::Approved
                ? 'borrow_request.approved'
                : 'borrow_request.rejected';
            $this->audit->record($admin, $action, $borrowRequest, $before, $borrowRequest->toArray());

            $borrowRequest = $this->requests->loadForView($borrowRequest);
            if ($status === BorrowRequestStatus::Approved) {
                $borrowedAt = now();
                $dueAt = isset($attributes['due_at'])
                    ? Carbon::parse($attributes['due_at'])
                    : $borrowedAt->copy()->addDays((int) config('library.default_loan_days'));
                $loan = Loan::query()->create([
                    'borrow_request_id' => $borrowRequest->id,
                    'user_id' => $borrowRequest->user_id,
                    'book_copy_id' => $copy->id,
                    'issued_by' => $admin->id,
                    'borrowed_at' => $borrowedAt,
                    'due_at' => $dueAt,
                    'status' => LoanStatus::Borrowed,
                    'notes' => $attributes['admin_notes'] ?? null,
                ]);
                $copy->update(['status' => BookCopyStatus::Borrowed]);
                $this->audit->record($admin, 'loan.created', $loan, after: $loan->toArray());
                $loan->load('bookCopy.book');
                $borrowRequest->user->notify(new LoanCreatedNotification($loan));
                $borrowRequest->load('loan.bookCopy.book');
            } else {
                $borrowRequest->user->notify(new BorrowRequestReviewedNotification($borrowRequest));
            }

            return $borrowRequest;
        });
    }
}
