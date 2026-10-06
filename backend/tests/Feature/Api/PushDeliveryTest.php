<?php

namespace Tests\Feature\Api;

use App\Jobs\SendExpoPushNotification;
use App\Models\User;
use App\Services\ExpoPushService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PushDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private function device(User $member)
    {
        return $member->pushDevices()->create(['expo_push_token' => 'ExponentPushToken[test-'.$member->id.']', 'platform' => 'android', 'is_enabled' => true]);
    }

    public function test_tickets_and_receipts_are_recorded_without_claiming_phone_delivery(): void
    {
        config()->set('services.expo.push_notifications_enabled', true);
        $user = User::factory()->create();
        $device = $this->device($user);
        Http::fake([
            '*/push/send' => Http::response(['data' => [['status' => 'ok', 'id' => 'ticket-1']]]),
            '*/push/getReceipts' => Http::response(['data' => ['ticket-1' => ['status' => 'ok']]]),
        ]);
        $service = app(ExpoPushService::class);
        $service->send($user, 'activity_enabled', 'Test', 'Test');
        $this->assertDatabaseHas('push_delivery_attempts', ['push_device_id' => $device->id, 'status' => 'accepted', 'ticket_id' => 'ticket-1']);
        $this->assertSame(0, $service->checkReceipts());
        $this->travel(16)->minutes();
        $this->assertSame(1, $service->checkReceipts());
        $this->assertDatabaseHas('push_delivery_attempts', ['status' => 'provider_accepted']);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/send') && $request->data()[0]['channelId'] === 'library-reminders');
    }

    public function test_invalid_device_receipt_disables_phone_and_retains_error(): void
    {
        $device = $this->device(User::factory()->create());
        DB::table('push_delivery_attempts')->insert(['push_device_id' => $device->id, 'ticket_id' => 'bad-ticket', 'status' => 'accepted', 'created_at' => now()->subMinutes(16)]);
        Http::fake(['*/getReceipts' => Http::response(['data' => ['bad-ticket' => ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]]])]);
        app(ExpoPushService::class)->checkReceipts();
        $this->assertDatabaseHas('push_delivery_attempts', ['status' => 'failed', 'error_code' => 'DeviceNotRegistered']);
        $this->assertFalse($device->fresh()->is_enabled);
    }

    public function test_test_notification_is_owned_rate_limited_and_reports_queued_not_delivered(): void
    {
        Queue::fake();
        config()->set('services.expo.push_notifications_enabled', true);
        $user = User::factory()->create();
        $device = $this->device($user);
        $other = $this->device(User::factory()->create());
        Sanctum::actingAs($user);
        $this->getJson("/api/v1/push-devices/{$other->id}/diagnostics")->assertNotFound();
        $this->getJson("/api/v1/push-devices/{$device->id}/diagnostics")->assertOk()->assertJsonPath('data.server_enabled', true);
        $this->postJson("/api/v1/push-devices/{$device->id}/test")->assertStatus(202);
        $this->postJson("/api/v1/push-devices/{$device->id}/test")->assertStatus(429);
        Queue::assertPushed(SendExpoPushNotification::class, fn ($job) => $job->deviceId === $device->id && $job->userId === $user->id);
    }

    public function test_server_disabled_is_reported_and_does_not_queue_tests(): void
    {
        Queue::fake();
        config()->set('services.expo.push_notifications_enabled', false);
        $user = User::factory()->create();
        $device = $this->device($user);
        Sanctum::actingAs($user);
        $this->postJson("/api/v1/push-devices/{$device->id}/test")->assertConflict();
        Queue::assertNothingPushed();
    }
}
