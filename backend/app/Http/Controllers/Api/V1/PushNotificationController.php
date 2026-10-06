<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notification\RegisterPushDeviceRequest;
use App\Http\Requests\Notification\UpdateNotificationPreferencesRequest;
use App\Http\Resources\PushDeviceResource;
use App\Jobs\SendExpoPushNotification;
use App\Models\PushDevice;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PushNotificationController extends Controller
{
    public function diagnostics(Request $request, PushDevice $pushDevice): JsonResponse
    {
        abort_unless($pushDevice->user_id === $request->user()->id, 404);
        $attempt = DB::table('push_delivery_attempts')->where('push_device_id', $pushDevice->id)->latest('id')->first(['status', 'error_code', 'created_at', 'checked_at']);

        return ApiResponse::success([
            'server_enabled' => (bool) config('services.expo.push_notifications_enabled'),
            'device_enabled' => $pushDevice->is_enabled,
            'latest_attempt' => $attempt,
        ]);
    }

    public function test(Request $request, PushDevice $pushDevice): JsonResponse
    {
        abort_unless($pushDevice->user_id === $request->user()->id, 404);
        if (! config('services.expo.push_notifications_enabled') || ! $pushDevice->is_enabled || ! $request->user()->wantsPushNotification('activity_enabled')) {
            return ApiResponse::error('Enable server push delivery, this device, and library activity notifications before testing.', status: 409);
        }
        SendExpoPushNotification::dispatch($request->user()->id, 'activity_enabled', 'RCJK Library test', 'Your library push notifications are connected.', [], $pushDevice->id);

        return ApiResponse::success(message: 'Test queued for this phone. Check delivery status shortly; the queue worker must be running.', status: 202);
    }

    public function preferences(Request $request): JsonResponse
    {
        return ApiResponse::success($request->user()->notificationPreferences());
    }

    public function updatePreferences(UpdateNotificationPreferencesRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->forceFill([
            'notification_preferences' => array_replace(
                $user->notificationPreferences(),
                $request->validated(),
            ),
        ])->save();

        return ApiResponse::success(
            $user->fresh()->notificationPreferences(),
            'Notification preferences updated.',
        );
    }

    public function register(RegisterPushDeviceRequest $request): JsonResponse
    {
        $attributes = $request->validated();
        $device = DB::transaction(function () use ($request, $attributes): PushDevice {
            $device = PushDevice::query()
                ->where('expo_push_token', $attributes['expo_push_token'])
                ->lockForUpdate()
                ->first();

            if ($device === null) {
                return $request->user()->pushDevices()->create([
                    'expo_push_token' => $attributes['expo_push_token'],
                    'platform' => $attributes['platform'],
                    'is_enabled' => true,
                    'last_seen_at' => now(),
                ]);
            }

            // A phone can be deliberately signed out and then used by another
            // member. Reassign its one Expo token instead of leaking alerts.
            $device->forceFill([
                'user_id' => $request->user()->id,
                'platform' => $attributes['platform'],
                'is_enabled' => true,
                'last_seen_at' => now(),
            ])->save();

            return $device;
        });

        return ApiResponse::success(
            PushDeviceResource::make($device)->resolve($request),
            'This device is ready for push notifications.',
            201,
        );
    }

    public function destroy(Request $request, PushDevice $pushDevice): JsonResponse
    {
        abort_unless($pushDevice->user_id === $request->user()->id, 404);
        $pushDevice->delete();

        return ApiResponse::success(message: 'This device has been unregistered from push notifications.');
    }
}
