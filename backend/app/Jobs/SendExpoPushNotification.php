<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\ExpoPushService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendExpoPushNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 30;

    /**
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        public readonly int $userId,
        public readonly string $preference,
        public readonly string $title,
        public readonly string $body,
        public readonly array $data = [],
        public readonly ?int $deviceId = null,
    ) {}

    public function handle(ExpoPushService $push): void
    {
        $user = User::query()->find($this->userId);

        if ($user !== null) {
            $push->send($user, $this->preference, $this->title, $this->body, $this->data, $this->deviceId);
        }
    }
}
