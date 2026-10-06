<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Services\BrevoTransactionalEmailService;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Send password-reset tokens through Brevo's HTTPS API. Railway's
     * non-Pro plans cannot establish outbound SMTP connections.
     */
    public function sendPasswordResetNotification($token): void
    {
        app(BrevoTransactionalEmailService::class)->sendPasswordReset($this, $token);
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'member_id',
        'email',
        'password',
        'role',
        'status',
        'must_change_password',
        'last_login_at',
        'created_by',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'status' => UserStatus::class,
            'must_change_password' => 'boolean',
            'last_login_at' => 'datetime',
            'notification_preferences' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $user): void {
            $user->library_card_code ??= 'RCJK-MEMBER-'.Str::upper((string) Str::ulid());
        });
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(self::class, 'created_by');
    }

    public function createdAccounts(): HasMany
    {
        return $this->hasMany(self::class, 'created_by');
    }

    public function borrowRequests(): HasMany
    {
        return $this->hasMany(BorrowRequest::class);
    }

    public function loans(): HasMany
    {
        return $this->hasMany(Loan::class);
    }

    public function pushDevices(): HasMany
    {
        return $this->hasMany(PushDevice::class);
    }

    /**
     * The defaults keep current members opted in to non-marketing library
     * alerts. They can change them at any time from the Android app.
     *
     * @return array<string, bool>
     */
    public function notificationPreferences(): array
    {
        return array_replace([
            'push_enabled' => true,
            'due_soon_enabled' => true,
            'overdue_enabled' => true,
            'activity_enabled' => true,
        ], $this->notification_preferences ?? []);
    }

    public function wantsPushNotification(string $preference): bool
    {
        $preferences = $this->notificationPreferences();

        return $preferences['push_enabled'] && ($preferences[$preference] ?? true);
    }

    public function reviewedBorrowRequests(): HasMany
    {
        return $this->hasMany(BorrowRequest::class, 'reviewed_by');
    }

    public function issuedLoans(): HasMany
    {
        return $this->hasMany(Loan::class, 'issued_by');
    }

    public function receivedLoans(): HasMany
    {
        return $this->hasMany(Loan::class, 'received_by');
    }

    public function isAdmin(): bool
    {
        return $this->role === UserRole::Admin;
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::Active;
    }
}
