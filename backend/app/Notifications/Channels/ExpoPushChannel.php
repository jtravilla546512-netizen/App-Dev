<?php

namespace App\Notifications\Channels;

use App\Jobs\SendExpoPushNotification;
use Illuminate\Notifications\Notification;

class ExpoPushChannel
{
    public function send(object $notifiable, Notification $notification): void
    {
        if (! config('services.expo.push_notifications_enabled') || ! method_exists($notification, 'toExpoPush')) {
            return;
        }

        /** @var array{preference: string, title: string, body: string, data?: array<string, mixed>} $message */
        $message = $notification->toExpoPush($notifiable);

        SendExpoPushNotification::dispatch(
            $notifiable->id,
            $message['preference'],
            $message['title'],
            $message['body'],
            $message['data'] ?? [],
        )->afterCommit();
    }
}
