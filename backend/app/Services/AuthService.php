<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use App\Repositories\Contracts\UserRepositoryContract;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(
        private readonly UserRepositoryContract $users,
        private readonly AuditService $audit,
    ) {}

    /**
     * @return array{user: User, token: string}
     */
    public function register(array $attributes): array
    {
        $status = config('library.require_member_approval')
            ? UserStatus::Pending
            : UserStatus::Active;

        $user = $this->users->create([
            'name' => $attributes['name'],
            'member_id' => $attributes['member_id'],
            'email' => $attributes['email'],
            'password' => Hash::make($attributes['password']),
            'role' => UserRole::User,
            'status' => $status,
        ]);

        $token = $user->createToken($attributes['device_name'] ?? 'api-client', ['*'], now()->addMinutes(10))->plainTextToken;

        return compact('user', 'token');
    }

    /**
     * @return array{user: User, token: string}
     */
    public function login(string $email, string $password, string $deviceName): array
    {
        $user = $this->users->findByEmail($email);

        if ($user === null || ! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->isActive()) {
            $user->tokens()->delete();

            throw new AuthorizationException('This account is not active.');
        }

        $user = $this->users->recordLogin($user);
        $token = $user->createToken($deviceName, ['*'], $user->role === UserRole::User ? now()->addMinutes(10) : null)->plainTextToken;

        return compact('user', 'token');
    }

    public function logout(User $user): void
    {
        $accessToken = $user->currentAccessToken();

        if ($accessToken !== null) {
            $accessToken->delete();
        }
    }

    public function updateProfile(User $user, array $attributes): User
    {
        return DB::transaction(function () use ($user, $attributes): User {
            $before = $user->toArray();
            $updated = $this->users->update($user, [
                'name' => $attributes['name'],
            ]);

            // Keep an auditable record while not exposing profile changes as
            // an admin operation.
            $this->audit->record($updated, 'user.profile.updated', $updated, $before, $updated->toArray());

            return $updated;
        });
    }

    public function sendPasswordResetLink(string $email): void
    {
        // Deliberately ignore the broker status so callers cannot discover
        // whether an account exists for an email address.
        Password::sendResetLink([
            'email' => mb_strtolower(trim($email)),
        ]);
    }

    public function resetPassword(array $attributes): void
    {
        $status = Password::reset(
            [
                'email' => mb_strtolower(trim($attributes['email'])),
                'password' => $attributes['password'],
                'token' => $attributes['token'],
            ],
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                    'must_change_password' => false,
                ])->save();

                $user->tokens()->delete();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }
    }

    public function changePassword(User $user, string $currentPassword, string $newPassword): void
    {
        if (! Hash::check($currentPassword, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->forceFill([
            'password' => Hash::make($newPassword),
            'must_change_password' => false,
        ])->save();

        $user->tokens()->delete();
    }
}
