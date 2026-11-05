<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstagramConnection extends Model
{
    use HasFactory;

    protected $fillable = [
        'app_id',
        'app_secret',
        'account_id',
        'username',
        'name',
        'page_id',
        'page_name',
        'biography',
        'website',
        'profile_picture_url',
        'followers_count',
        'follows_count',
        'media_count',
        'account_insights',
        'granted_scopes',
        'requested_scopes',
        'rate_limit_usage',
        'sync_logs',
        'access_token',
        'user_access_token',
        'candidate_accounts',
        'token_expires_at',
        'token_refreshed_at',
        'connected',
        'last_tested_at',
        'last_synced_at',
        'comments_synced_at',
        'connected_by',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'app_secret' => 'encrypted',
            'access_token' => 'encrypted',
            'user_access_token' => 'encrypted',
            'candidate_accounts' => 'encrypted:array',
            'account_insights' => 'array',
            'granted_scopes' => 'array',
            'requested_scopes' => 'array',
            'rate_limit_usage' => 'array',
            'sync_logs' => 'array',
            'connected' => 'boolean',
            'followers_count' => 'integer',
            'follows_count' => 'integer',
            'media_count' => 'integer',
            'token_expires_at' => 'datetime',
            'token_refreshed_at' => 'datetime',
            'last_tested_at' => 'datetime',
            'last_synced_at' => 'datetime',
            'comments_synced_at' => 'datetime',
        ];
    }

    /**
     * User who authorized this connection.
     */
    public function connectedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'connected_by');
    }

    /**
     * Get the active singleton Instagram connection for the workspace.
     */
    public static function current(): self
    {
        /** @var self|null $connection */
        $connection = static::query()->first();

        if (! $connection) {
            $connection = static::query()->forceCreate(['id' => 1]);
        }

        if ($connection->wasRecentlyCreated && empty($connection->account_id) && ! empty(config('services.instagram.account_id'))) {
            $cfgAcc = (string) config('services.instagram.account_id');
            $cfgToken = (string) config('services.instagram.access_token');
            $connection->update([
                'account_id' => $cfgAcc,
                'access_token' => $cfgToken,
                'connected' => ! empty($cfgAcc) && ! empty($cfgToken),
                'username' => 'gbrnmewing',
                'last_tested_at' => now(),
            ]);
        }

        return $connection;
    }
}
