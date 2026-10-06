<?php

use App\Enums\UserRole;
use App\Http\Controllers\Api\V1\AuthController;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\PersonalAccessToken;

Route::prefix('auth')->name('auth.')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])->name('register');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
        ->withoutMiddleware('throttle:api')
        ->middleware('throttle:password-reset')
        ->name('password.email');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])
        ->withoutMiddleware('throttle:api')
        ->middleware('throttle:password-reset')
        ->name('password.reset');
    Route::post('/login', [AuthController::class, 'login'])
        ->withoutMiddleware('throttle:api')
        ->middleware('throttle:login')
        ->name('login');

    Route::middleware(['auth:sanctum', 'active'])->group(function (): void {
        Route::post('/activity', function (Request $request) {
            $token = $request->user()->currentAccessToken();
            if ($request->user()->role === UserRole::User && $token instanceof PersonalAccessToken) {
                $token->forceFill(['expires_at' => now()->addMinutes(10)])->save();
            }

            return ApiResponse::success(message: 'Activity recorded.');
        })->name('activity');
        Route::get('/me', [AuthController::class, 'me'])->name('me');
        Route::patch('/me', [AuthController::class, 'updateProfile'])->name('me.update');
        Route::put('/password', [AuthController::class, 'changePassword'])->name('password.update');
        Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    });
});
