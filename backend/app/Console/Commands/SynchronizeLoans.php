<?php

namespace App\Console\Commands;

use App\Services\LoanService;
use Illuminate\Console\Command;

class SynchronizeLoans extends Command
{
    protected $signature = 'library:sync-loans';

    protected $description = 'Synchronize overdue loan statuses and send member notifications';

    public function handle(LoanService $loans): int
    {
        $overdue = $loans->synchronizeOverdue();
        $dueSoon = $loans->sendDueSoonNotifications();
        $dueToday = $loans->sendDueTodayNotifications();
        $this->info("Synchronized {$overdue} overdue loan(s), sent {$dueSoon} due-soon and {$dueToday} due-today notification(s).");

        return self::SUCCESS;
    }
}
