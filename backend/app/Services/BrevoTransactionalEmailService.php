<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use LogicException;

class BrevoTransactionalEmailService
{
    public function sendPasswordReset(User $user, string $token): void
    {
        $apiKey = (string) config('services.brevo.api_key');

        if ($apiKey === '') {
            throw new LogicException('The Brevo API key is not configured.');
        }

        $name = e($user->name);
        $escapedToken = e($token);
        $senderEmail = (string) config('services.brevo.sender_email');
        $senderName = (string) config('services.brevo.sender_name', config('mail.from.name'));

        if ($senderEmail === '') {
            throw new LogicException('The Brevo sender email is not configured.');
        }

        Http::acceptJson()
            ->asJson()
            ->withHeaders(['api-key' => $apiKey])
            ->connectTimeout(5)
            ->timeout(15)
            ->post('https://api.brevo.com/v3/smtp/email', [
                'sender' => [
                    'name' => $senderName,
                    'email' => $senderEmail,
                ],
                'to' => [[
                    'email' => $user->email,
                    'name' => $user->name,
                ]],
                'subject' => 'Your RCJK Library password reset token',
                'textContent' => implode("\n\n", [
                    'Hello '.$user->name.',',
                    'A password reset was requested for your RCJK Library account.',
                    'Your reset token is: '.$token,
                    'Open the RCJK Library app, choose “I already have a reset token”, then enter this token with your new password.',
                    'This token expires in 60 minutes. If you did not request a password reset, you can safely ignore this email.',
                ]),
                'htmlContent' => '<p>Hello '.$name.',</p>'
                    .'<p>A password reset was requested for your RCJK Library account.</p>'
                    .'<p>Your reset token is:</p><p><strong>'.$escapedToken.'</strong></p>'
                    .'<p>Open the RCJK Library app, choose “I already have a reset token”, then enter this token with your new password.</p>'
                    .'<p>This token expires in 60 minutes. If you did not request a password reset, you can safely ignore this email.</p>',
            ])
            ->throw();
    }
}
