<?php

namespace Tests\Feature\Api;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_always_creates_a_user_role(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Library Member',
            'member_id' => 'MEM-10001',
            'email' => 'MEMBER@EXAMPLE.COM',
            'password' => 'password',
            'password_confirmation' => 'password',
            'role' => 'admin',
            'status' => 'inactive',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', 'member@example.com')
            ->assertJsonPath('data.user.role', UserRole::User->value)
            ->assertJsonPath('data.user.status', UserStatus::Active->value)
            ->assertJsonStructure(['data' => ['token']]);

        $this->assertDatabaseHas('users', [
            'email' => 'member@example.com',
            'role' => UserRole::User->value,
            'status' => UserStatus::Active->value,
        ]);
    }

    public function test_active_admin_can_login_and_access_admin_route(): void
    {
        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
            'password' => 'password',
        ]);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => $admin->email,
            'password' => 'password',
            'device_name' => 'test-suite',
        ]);

        $login
            ->assertOk()
            ->assertJsonPath('data.user.role', UserRole::Admin->value)
            ->assertJsonStructure(['data' => ['token']]);

        $token = $login->json('data.token');

        $this->withToken($token)
            ->getJson('/api/v1/admin/health')
            ->assertOk();
    }

    public function test_user_is_forbidden_from_admin_route(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/admin/health')
            ->assertForbidden()
            ->assertJsonPath('success', false);
    }

    public function test_inactive_account_cannot_login(): void
    {
        $user = User::factory()->inactive()->create([
            'email' => 'inactive@example.com',
            'password' => 'password',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])
            ->assertForbidden()
            ->assertJsonPath('message', 'This account is not active.');
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $user = User::factory()->create(['password' => 'password']);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->withToken($login->json('data.token'))
            ->postJson('/api/v1/auth/logout')
            ->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_user_can_change_password_and_all_tokens_are_revoked(): void
    {
        $user = User::factory()->create([
            'password' => 'password',
            'must_change_password' => true,
        ]);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->withToken($login->json('data.token'))
            ->putJson('/api/v1/auth/password', [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertOk();

        $user->refresh();

        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('new-password', $user->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_user_can_update_only_their_display_name(): void
    {
        $user = User::factory()->create([
            'name' => 'Old Name',
            'member_id' => 'MEM-20001',
            'email' => 'member@example.com',
        ]);

        Sanctum::actingAs($user);

        $this->withServerVariables([
            'REMOTE_ADDR' => '203.0.113.25',
            'HTTP_USER_AGENT' => 'LibraryManagementPhase7Test/1.0',
        ])->patchJson('/api/v1/auth/me', [
            'name' => 'New Name',
            'member_id' => 'ADMIN-EDIT',
            'role' => 'admin',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'New Name')
            ->assertJsonPath('data.member_id', 'MEM-20001')
            ->assertJsonPath('data.role', UserRole::User->value);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'New Name',
            'member_id' => 'MEM-20001',
            'role' => UserRole::User->value,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $user->id,
            'action' => 'user.profile.updated',
            'ip_address' => '203.0.113.25',
            'user_agent' => 'LibraryManagementPhase7Test/1.0',
        ]);
    }

    public function test_password_reset_request_does_not_reveal_if_an_account_exists(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'missing@example.com',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath(
                'message',
                'If an account exists for that email, a password reset token has been sent.'
            );
    }

    public function test_user_can_reset_password_with_a_valid_token(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member@example.com',
            'password' => 'old-password',
            'must_change_password' => true,
        ]);
        $user->createToken('existing-device');

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => $user->email,
        ])->assertOk();

        $token = null;

        Notification::assertSentTo(
            $user,
            ResetPassword::class,
            function (ResetPassword $notification) use (&$token): bool {
                $token = $notification->token;

                return true;
            }
        );

        $this->postJson('/api/v1/auth/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Password reset successfully. You can now log in.');

        $user->refresh();

        $this->assertTrue(Hash::check('new-password', $user->password));
        $this->assertFalse($user->must_change_password);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
