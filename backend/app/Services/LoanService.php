<?php

namespace App\Services;

use App\Enums\BookCopyStatus;
use App\Enums\LoanStatus;
use App\Exceptions\DomainConflictException;
use App\Models\BookCopy;
use App\Models\Loan;
use App\Models\User;
use App\Notifications\LoanDueSoonNotification;
use App\Notifications\LoanOverdueNotification;
use App\Notifications\LoanReturnedNotification;
use App\Repositories\Contracts\LoanRepositoryContract;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class LoanService
{
    public function __construct(
        private readonly LoanRepositoryContract $loans,
        private readonly AuditService $audit,
    ) {}

    public function paginateForUser(array $filters, User $user): LengthAwarePaginator
    {
        $this->synchronizeOverdue();
        unset($filters['user_id']);

        return $this->loans->paginate($filters, $user);
    }

    public function paginateForAdmin(array $filters): LengthAwarePaginator
    {
        $this->synchronizeOverdue();

        return $this->loans->paginate($filters);
    }

    public function show(Loan $loan): Loan
    {
        $this->synchronizeOverdue();

        return $this->loans->loadForView($loan->refresh());
    }

    public function recordReturn(Loan $loan, array $attributes, User $admin): Loan
    {
        return DB::transaction(function () use ($loan, $attributes, $admin): Loan {
            $loan = $this->loans->lockForUpdate($loan);

            if ($loan->status === LoanStatus::Returned || $loan->returned_at !== null) {
                throw new DomainConflictException('This loan has already been returned.');
            }

            $copy = BookCopy::query()->lockForUpdate()->findOrFail($loan->book_copy_id);

            if (! in_array($copy->status, [BookCopyStatus::Borrowed], true)) {
                throw new DomainConflictException('The assigned copy is not currently marked as borrowed.');
            }

            $before = $loan->toArray();
            $returnedAt = $attributes['returned_at'] ?? now();
            $returnCondition = $attributes['return_condition'] ?? 'good';

            $loan->update([
                'returned_at' => $returnedAt,
                'received_by' => $admin->id,
                'status' => LoanStatus::Returned,
                'return_condition' => $returnCondition,
                'notes' => $attributes['notes'] ?? null,
            ]);
            $copy->update([
                'status' => $returnCondition === 'damaged'
                    ? BookCopyStatus::Damaged
                    : BookCopyStatus::Available,
                'condition_notes' => $attributes['notes'] ?? $copy->condition_notes,
            ]);

            $this->audit->record($admin, 'loan.returned', $loan, $before, $loan->fresh()->toArray());
            $loan = $this->loans->loadForView($loan->refresh());
            $loan->user->notify(new LoanReturnedNotification($loan));

            return $loan;
        });
    }

    public function synchronizeOverdue(): int
    {
        return DB::transaction(function (): int {
            $overdueLoans = Loan::query()
                ->where('status', LoanStatus::Borrowed->value)
                ->whereNull('returned_at')
                ->where('due_at', '<', now())
                ->lockForUpdate()
                ->get();

            foreach ($overdueLoans as $loan) {
                $before = $loan->toArray();
                $loan->update(['status' => LoanStatus::Overdue]);
                $this->audit->record(null, 'loan.overdue', $loan, $before, $loan->fresh()->toArray());
                $loan->load('user', 'bookCopy.book');
                $loan->user->notify(new LoanOverdueNotification($loan));
            }

            return $overdueLoans->count();
        });
    }

    public function sendDueSoonNotifications(): int
    {
        return $this->sendReminders(false);
    }

    public function sendDueTodayNotifications(): int
    {
        return $this->sendReminders(true);
    }

    private function sendReminders(bool $dueToday): int
    {
        $loans = Loan::query()
            ->with('user', 'bookCopy.book')
            ->where('status', LoanStatus::Borrowed->value)
            ->whereNull('returned_at')
            ->whereBetween('due_at', [now(), now()->addDays((int) config('library.due_soon_days'))])
            ->when($dueToday, fn ($query) => $query->whereDate('due_at', today()), fn ($query) => $query->whereDate('due_at', '>', today()))
            ->get();
        $sent = 0;

        foreach ($loans as $loan) {
            $sent += DB::transaction(function () use ($loan, $dueToday): int {
                $loan = Loan::query()->with('user', 'bookCopy.book')->lockForUpdate()->findOrFail($loan->id);
                if ($loan->returned_at !== null || $loan->due_at->isPast()) {
                    return 0;
                }
                $alreadySent = $loan->user->notifications()
                    ->where('type', LoanDueSoonNotification::class)
                    ->where('data->loan_id', $loan->id)
                    ->when($dueToday, fn ($query) => $query->where('data->type', 'loan_due_today'), fn ($query) => $query->where('data->type', 'loan_due_soon'))
                    ->exists();
                if (! $alreadySent) {
                    $loan->user->notify(new LoanDueSoonNotification($loan, $dueToday));

                    return 1;
                }

                return 0;
            });
        }

        return $sent;
    }
}
