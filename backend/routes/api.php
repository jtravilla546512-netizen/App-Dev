<?php

use Illuminate\Support\Facades\Route;

Route::prefix('v1')
    ->name('api.v1.')
    ->middleware('throttle:api')
    ->group(function (): void {
        require __DIR__.'/api/v1/system.php';
        require __DIR__.'/api/v1/auth.php';
        require __DIR__.'/api/v1/catalog.php';
        require __DIR__.'/api/v1/users.php';
        require __DIR__.'/api/v1/borrow-requests.php';
        require __DIR__.'/api/v1/loans.php';
        require __DIR__.'/api/v1/circulation.php';
        require __DIR__.'/api/v1/notifications.php';
        require __DIR__.'/api/v1/operations.php';
    });
