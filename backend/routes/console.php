<?php

use App\Services\ExpoPushService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Keeps overdue status and due-date reminders timely without sending repeated
// alerts; LoanService records each reminder only once per loan.
Schedule::command('library:sync-loans')->everyFifteenMinutes()->withoutOverlapping();

// Worker/scheduler deployments may start before the API pre-deploy migration.
// Wait without running concurrent migrations or consuming queued jobs early.
Artisan::command('library:wait-for-push-schema', function () {
    for ($attempt = 0; $attempt < 60; $attempt++) {
        try {
            if (Schema::hasTable('push_delivery_attempts')) {
                $this->info('Push delivery schema ready.');
                return 0;
            }
        } catch (\Throwable $exception) {
            // Connection may still be starting; never print credentials.
        }
        sleep(2);
    }
    $this->error('Push delivery schema unavailable; run API migrations before starting this service.');
    return 1;
})->purpose('Wait for the API migration before starting background services');

Artisan::command('library:push-receipts', function (ExpoPushService $push) {
    $this->info('Checked '.$push->checkReceipts().' push receipt(s).');
})->purpose('Check Expo delivery receipts without exposing device tokens');
Schedule::command('library:push-receipts')->everyFiveMinutes()->withoutOverlapping();
Schedule::call(fn () => DB::table('push_delivery_attempts')->where('created_at', '<', now()->subDays(30))->delete())->daily();
