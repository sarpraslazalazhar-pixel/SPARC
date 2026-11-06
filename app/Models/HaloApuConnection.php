<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HaloApuConnection extends Model
{
    use HasFactory;

    protected $table = 'haloapu_connections';

    protected $fillable = [
        'is_enabled',
        'base_url',
        'api_token',
        'webhook_secret',
        'auto_solve_on_publish',
        'filter_rules',
        'last_synced_at',
        'last_webhook_at',
        'last_status',
        'last_error',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'api_token' => 'encrypted',
            'webhook_secret' => 'encrypted',
            'auto_solve_on_publish' => 'boolean',
            'filter_rules' => 'array',
            'last_synced_at' => 'datetime',
            'last_webhook_at' => 'datetime',
        ];
    }

    /**
     * Return the singleton active HaloApuConnection configuration record.
     */
    public static function current(): self
    {
        /** @var self $conn */
        $conn = static::query()->firstOrCreate(['id' => 1]);

        return $conn;
    }
}
