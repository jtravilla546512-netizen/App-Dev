<?php

namespace App\Providers;

use App\Enums\UserRole;
use App\Models\User;
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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

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
        Sanctum::authenticateAccessTokensUsing(function ($token, bool $valid): bool {
            if ($token->tokenable instanceof User && $token->tokenable->role === UserRole::User) {
                // Legacy member tokens must not retain an unlimited session.
                // Polling must not extend expiry: only the activity endpoint does.
                $expiry = $token->expires_at ?? $token->created_at->copy()->addMinutes(10);
                if ($expiry->lessThanOrEqualTo(now())) {
                    $token->delete();

                    return false;
                }
            }

            return $valid;
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
