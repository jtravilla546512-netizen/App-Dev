<?php

namespace App\Providers;

use App\Repositories\BookCopyRepository;
use App\Repositories\BookRepository;
use App\Repositories\BorrowRequestRepository;
use App\Repositories\CategoryRepository;
use App\Repositories\Contracts\BookCopyRepositoryContract;
use App\Repositories\Contracts\BookRepositoryContract;
use App\Repositories\Contracts\BorrowRequestRepositoryContract;
use App\Repositories\Contracts\CategoryRepositoryContract;
use App\Repositories\Contracts\LoanRepositoryContract;
use App\Repositories\Contracts\UserRepositoryContract;
use App\Repositories\LoanRepository;
use App\Repositories\UserRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(UserRepositoryContract::class, UserRepository::class);
        $this->app->bind(CategoryRepositoryContract::class, CategoryRepository::class);
        $this->app->bind(BookRepositoryContract::class, BookRepository::class);
        $this->app->bind(BookCopyRepositoryContract::class, BookCopyRepository::class);
        $this->app->bind(BorrowRequestRepositoryContract::class, BorrowRequestRepository::class);
        $this->app->bind(LoanRepositoryContract::class, LoanRepository::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // The Android client resets passwords with the token entry form, not a
        // browser reset page. Laravel's default notification only exposes the
        // token inside a web URL, so send the token visibly and give members
        // the exact in-app steps needed to use it.
        ResetPassword::toMailUsing(function (object $notifiable, string $token): MailMessage {
            return (new MailMessage)
                ->subject('Your RCJK Library password reset token')
                ->greeting('Hello '.$notifiable->name.',')
                ->line('A password reset was requested for your RCJK Library account.')
                ->line('Your reset token is:')
                ->line('**'.$token.'**')
                ->line('Open the RCJK Library app, choose “I already have a reset token”, then enter this token with your new password.')
                ->line('This token expires in 60 minutes. If you did not request a password reset, you can safely ignore this email.');
        });

        RateLimiter::for('api', function (Request $request): Limit {
            return Limit::perMinute(60)->by(
                $request->user()?->getAuthIdentifier() ?? $request->ip()
            );
        });

        RateLimiter::for('login', function (Request $request): Limit {
            return Limit::perMinute(5)->by(
                mb_strtolower((string) $request->input('email')).'|'.$request->ip()
            );
        });

        RateLimiter::for('password-reset', function (Request $request): Limit {
            return Limit::perMinute(3)->by(
                mb_strtolower((string) $request->input('email')).'|'.$request->ip()
            );
        });
    }
}
