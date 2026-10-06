<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Requests\Auth\UpdateOwnProfileRequest;
use App\Http\Resources\UserResource;
use App\Services\AuthService;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $auth,
    ) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        $result = $this->auth->register($request->validated());

        return ApiResponse::success([
            'user' => UserResource::make($result['user'])->resolve($request),
            'token' => $result['token'],
            'token_type' => 'Bearer',
        ], 'Account created successfully.', 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $result = $this->auth->login(
            $request->string('email')->toString(),
            $request->string('password')->toString(),
            $request->string('device_name', 'web-admin')->toString(),
        );

        return ApiResponse::success([
            'user' => UserResource::make($result['user'])->resolve($request),
            'token' => $result['token'],
            'token_type' => 'Bearer',
        ], 'Login successful.');
    }

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $this->auth->sendPasswordResetLink(
            $request->string('email')->toString(),
        );

        return ApiResponse::success(
            message: 'If an account exists for that email, a password reset token has been sent.'
        );
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $this->auth->resetPassword($request->validated());

        return ApiResponse::success(
            message: 'Password reset successfully. You can now log in.'
        );
    }

    public function me(Request $request): JsonResponse
    {
        return ApiResponse::success(
            UserResource::make($request->user())->resolve($request),
        );
    }

    public function updateProfile(UpdateOwnProfileRequest $request): JsonResponse
    {
        $user = $this->auth->updateProfile($request->user(), $request->validated());

        return ApiResponse::success(
            UserResource::make($user)->resolve($request),
            'Profile updated successfully.',
        );
    }

    public function logout(Request $request): JsonResponse
    {
        $this->auth->logout($request->user());

        return ApiResponse::success(message: 'Logout successful.');
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $this->auth->changePassword(
            $request->user(),
            $request->string('current_password')->toString(),
            $request->string('password')->toString(),
        );

        return ApiResponse::success(
            message: 'Password changed successfully. Please log in again.'
        );
    }
}
