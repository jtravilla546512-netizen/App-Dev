<?php

namespace App\Services;

use App\Enums\BorrowRequestStatus;
use App\Exceptions\DomainConflictException;
use App\Models\BookCopy;
use App\Models\BorrowRequest;
use App\Models\Loan;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CirculationService
{
    public function borrow(User $member, BookCopy $copy, array $data, User $admin): BorrowRequest
    {
        return DB::transaction(function () use ($member, $copy, $data, $admin) {
            $member = User::query()->whereKey($member->id)->lockForUpdate()->firstOrFail();
            app(BorrowingEligibilityService::class)->enforce($member);
            $requests = app(BorrowRequestService::class);
            $pending = $member->borrowRequests()->where('book_id', $copy->book_id)
                ->where('status', BorrowRequestStatus::Pending)->first();
            $pending ??= $requests->create($copy->book_id, $member);
            // Reuse the same transactional availability checks as online approval.
            $result = $requests->approve($pending, [
                'book_copy_id' => $copy->id, 'due_at' => $data['due_at'],
                'admin_notes' => $data['notes'] ?? null,
            ], $admin);
            app(AuditService::class)->record($admin, 'circulation.borrow_confirmed', $result);

            return $result;
        });
    }

    public function returnCopy(User $member, BookCopy $copy, array $data, User $admin): Loan
    {
        return DB::transaction(function () use ($member, $copy, $data, $admin) {
            User::query()->whereKey($member->id)->lockForUpdate()->firstOrFail();
            $loan = Loan::query()->where('book_copy_id', $copy->id)->whereNull('returned_at')->lockForUpdate()->first();
            if (! $loan || $loan->user_id !== $member->id || $loan->id !== (int) $data['loan_id']) {
                throw new DomainConflictException('This copy is not on the selected member’s confirmed loan. Look up the member and copy again.');
            }
            $result = app(LoanService::class)->recordReturn($loan, $data, $admin);
            app(AuditService::class)->record($admin, 'circulation.return_confirmed', $result);

            return $result;
        });
    }
}
