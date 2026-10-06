<?php

namespace App\Services;

use App\Models\PushDevice;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExpoPushService
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function send(User $user, string $preference, string $title, string $body, array $data = [], ?int $deviceId = null): void
    {
        if (! config('services.expo.push_notifications_enabled') || ! $user->wantsPushNotification($preference)) {
            return;
        }

        $devices = $user->pushDevices()->enabled()->when($deviceId !== null, fn ($query) => $query->whereKey($deviceId))->get();
        if ($devices->isEmpty()) {
            return;
        }

        $messages = $devices->map(fn (PushDevice $device): array => [
            'to' => $device->expo_push_token,
            'title' => $title,
            'body' => $body,
            'sound' => 'default',
            'priority' => 'high',
            'channelId' => 'library-reminders',
            'data' => $data,
        ])->all();

        foreach (array_chunk($messages, 100) as $chunk) {
            try {
                $response = Http::acceptJson()
                    ->timeout(10)
                    ->post(config('services.expo.push_url'), $chunk);
            } catch (ConnectionException $exception) {
                Log::warning('Expo push service could not be reached.');
                throw $exception;
            }

            if (! $response->successful()) {
                Log::warning('Expo push service rejected a request.', ['status' => $response->status()]);
                foreach ($chunk as $message) {
                    $device = $devices->firstWhere('expo_push_token', $message['to']);
                    DB::table('push_delivery_attempts')->insert([
                        'push_device_id' => $device->id, 'status' => 'rejected',
                        'error_code' => 'HTTP_'.$response->status(), 'created_at' => now(),
                    ]);
                }
                if ($response->status() === 429 || $response->serverError()) {
                    $response->throw();
                }

                continue;
            }

            $tickets = $response->json('data', []);
            foreach ($chunk as $index => $message) {
                $ticket = $tickets[$index] ?? [];
                $device = $devices->firstWhere('expo_push_token', $message['to']);
                DB::table('push_delivery_attempts')->insert([
                    'push_device_id' => $device->id,
                    'ticket_id' => $ticket['id'] ?? null,
                    'status' => ($ticket['status'] ?? null) === 'ok' && isset($ticket['id']) ? 'accepted' : 'rejected',
                    'error_code' => ($ticket['status'] ?? null) === 'ok' && isset($ticket['id']) ? null : substr($ticket['details']['error'] ?? 'InvalidTicket', 0, 100),
                    'created_at' => now(),
                ]);
                if (($ticket['details']['error'] ?? null) !== 'DeviceNotRegistered') {
                    continue;
                }

                $token = $chunk[$index]['to'] ?? null;
                if ($token !== null) {
                    PushDevice::query()->where('expo_push_token', $token)->update(['is_enabled' => false]);
                }
            }
        }
    }

    public function checkReceipts(): int
    {
        $attempts = DB::table('push_delivery_attempts')->where('status', 'accepted')
            ->where('created_at', '<=', now()->subMinutes(15))->orderBy('id')->limit(1000)->get();
        if ($attempts->isEmpty()) {
            return 0;
        }
        $response = Http::acceptJson()->timeout(15)->post(
            'https://exp.host/--/api/v2/push/getReceipts', ['ids' => $attempts->pluck('ticket_id')->all()],
        )->throw();
        $receipts = $response->json('data', []);
        $checked = 0;
        foreach ($attempts as $attempt) {
            $receipt = $receipts[$attempt->ticket_id] ?? null;
            if ($receipt === null && Carbon::parse($attempt->created_at)->greaterThan(now()->subHours(23))) {
                continue;
            }
            $error = $receipt['details']['error'] ?? ($receipt === null ? 'ReceiptUnavailable' : null);
            DB::table('push_delivery_attempts')->where('id', $attempt->id)->update([
                // Provider acceptance is not proof that Android displayed it.
                'status' => ($receipt['status'] ?? null) === 'ok' ? 'provider_accepted' : 'failed',
                'error_code' => $error === null ? null : substr($error, 0, 100),
                'checked_at' => now(),
            ]);
            if ($error === 'DeviceNotRegistered') {
                PushDevice::query()->whereKey($attempt->push_device_id)->update(['is_enabled' => false]);
            }
            $checked++;
        }

        return $checked;
    }
}
