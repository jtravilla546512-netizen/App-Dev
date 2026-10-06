<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Exceptions\DomainConflictException;
use App\Models\User;

class BorrowingEligibilityService
{
    public function check(User $user): array
    {
        // Dates, not the scheduler's cached status, are authoritative.
        $overdue = $user->loans()->whereNull('returned_at')->where('due_at', '<', now())->count();
        $active = $user->loans()->whereNull('returned_at')->count();
        $reason = ! $user->isActive() || $user->role !== UserRole::User
            ? 'Only active members can borrow books.'
            : ($overdue > 0
                ? 'Borrowing is suspended until all overdue books are returned. Contact the librarian to record your return. No monetary fine is applied.'
                : ($active >= (int) config('library.max_active_loans') ? 'Maximum active loans reached. Return a book before borrowing again.' : null));

        return ['can_borrow' => $reason === null, 'reason' => $reason, 'overdue_count' => $overdue, 'active_loans_count' => $active];
    }

    public function enforce(User $user): void
    {
        $result = $this->check($user);
        if (! $result['can_borrow']) {
            throw new DomainConflictException($result['reason']);
        }
    }
}
