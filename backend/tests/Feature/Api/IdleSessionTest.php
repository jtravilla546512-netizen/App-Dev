<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IdleSessionTest extends TestCase
{
    use RefreshDatabase;

    private function callWithToken(string $token, string $path, string $method = 'GET')
    {
        // Real bearer authentication on every request, not Sanctum::actingAs.
        $this->app['auth']->forgetGuards();

        return $this->withToken($token)->json($method, '/api/v1'.$path);
    }

    public function test_background_reads_do_not_keep_a_member_session_alive(): void
    {
        $member = User::factory()->create();
        $token = $member->createToken('android-app', ['*'], now()->addMinutes(10))->plainTextToken;
        $this->travel(9)->minutes();
        $this->callWithToken($token, '/auth/me')->assertOk();
        $this->travel(1)->minutes();
        $this->callWithToken($token, '/auth/me')->assertUnauthorized();
        $this->assertSame(0, $member->tokens()->count());
    }

    public function test_activity_extends_session_but_cannot_revive_an_expired_token(): void
    {
        $member = User::factory()->create();
        $token = $member->createToken('android-app', ['*'], now()->addMinutes(10))->plainTextToken;
        $this->travel(9)->minutes();
        $this->callWithToken($token, '/auth/activity', 'POST')->assertOk();
        $this->travel(9)->minutes();
        $this->callWithToken($token, '/auth/me')->assertOk();
        $this->travel(1)->minutes();
        $this->callWithToken($token, '/auth/activity', 'POST')->assertUnauthorized();
    }

    public function test_legacy_member_tokens_expire_but_web_admin_sessions_are_unchanged(): void
    {
        $member = User::factory()->create();
        $admin = User::factory()->admin()->create();
        $token = $member->createToken('android-app')->plainTextToken;
        $adminToken = $admin->createToken('web')->plainTextToken;
        $this->travel(11)->minutes();
        $this->callWithToken($token, '/auth/me')->assertUnauthorized();
        $this->callWithToken($adminToken, '/auth/me')->assertOk();
    }
}
