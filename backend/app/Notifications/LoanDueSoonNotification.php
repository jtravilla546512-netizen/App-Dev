<?php

namespace App\Notifications;

use App\Models\Loan;
use App\Notifications\Channels\ExpoPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class LoanDueSoonNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly Loan $loan, private readonly bool $dueToday = false) {}

    public function via(object $notifiable): array
    {
        return ['database', ExpoPushChannel::class];
    }

    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => $this->dueToday ? 'loan_due_today' : 'loan_due_soon',
            'loan_id' => $this->loan->id,
            'book_title' => $this->loan->bookCopy->book->title,
            'title' => $this->dueToday ? 'Book due today' : 'Book due soon',
            'message' => sprintf(
                '"%s" is due on %s.',
                $this->loan->bookCopy->book->title,
                $this->loan->due_at->format('M j, Y'),
            ),
        ];
    }

    /** @return array{preference: string, title: string, body: string, data: array<string, int>} */
    public function toExpoPush(object $notifiable): array
    {
        return [
            'preference' => 'due_soon_enabled',
            'title' => $this->dueToday ? 'Book due today' : 'Book due soon',
            'body' => sprintf('"%s" is due on %s.', $this->loan->bookCopy->book->title, $this->loan->due_at->format('M j, Y')),
            'data' => ['loan_id' => $this->loan->id],
        ];
    }
}
