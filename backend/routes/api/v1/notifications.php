<?php

use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PushNotificationController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'active'])->group(function (): void {
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('/notifications/read-all', [NotificationController::class, 'readAll'])->name('notifications.read-all');
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'read'])->name('notifications.read');

    Route::get('/notification-preferences', [PushNotificationController::class, 'preferences'])->name('notification-preferences.show');
    Route::patch('/notification-preferences', [PushNotificationController::class, 'updatePreferences'])->name('notification-preferences.update');
    Route::post('/push-devices', [PushNotificationController::class, 'register'])->name('push-devices.register');
    Route::get('/push-devices/{pushDevice}/diagnostics', [PushNotificationController::class, 'diagnostics']);
    Route::post('/push-devices/{pushDevice}/test', [PushNotificationController::class, 'test'])->middleware('throttle:1,1');
    Route::delete('/push-devices/{pushDevice}', [PushNotificationController::class, 'destroy'])->name('push-devices.destroy');
});
