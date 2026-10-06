<?php

use App\Http\Controllers\Api\V1\Admin\CirculationController;
use App\Services\BorrowingEligibilityService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::get('/borrowing-eligibility', fn (Request $request, BorrowingEligibilityService $service) => ApiResponse::success($service->check($request->user())));
    Route::prefix('admin/circulation')->middleware('role:admin')->group(function () {
        Route::get('/member', [CirculationController::class, 'member']);
        Route::get('/copy', [CirculationController::class, 'copy']);
        Route::post('/borrow', [CirculationController::class, 'borrow']);
        Route::post('/return', [CirculationController::class, 'recordReturn']);
    });
});
