<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HaloApuSyncLog extends Model
{
    use HasFactory;

    protected $table = 'haloapu_sync_logs';

    protected $fillable = [
        'direction',
        'event_type',
        'status',
        'fetched_count',
        'latency_ms',
        'http_status',
        'note',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'fetched_count' => 'integer',
            'latency_ms' => 'integer',
            'http_status' => 'integer',
        ];
    }
}
