<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class ContentItem extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'content_id',
        'ticket_id',
        'title',
        'status',
        'priority',
        'platform',
        'format',
        'pillar',
        'pic_name',
        'pic_role',
        'pic_avatar',
        'production_deadline',
        'publish_date',
        'publish_time',
        'activity_title',
        'campaign_title',
        'brief',
        'caption',
        'published_url',
        'ig_media_id',
        'ig_media_url',
        'ig_thumbnail_url',
        'ref_design_url',
        'result_design_url',
        'revision_note',
        'performance_notes',
        'reach',
        'views',
        'likes',
        'comments_count',
        'shares',
        'saves',
        'reels_watch_time',
        'reels_avg_watch_time',
        'is_ad_boosted',
        'ad_spend',
        'metrics_synced_at',
        'grid_position',
        'created_by',
    ];

    protected $casts = [
        'production_deadline' => 'date',
        'publish_date' => 'date',
        'metrics_synced_at' => 'datetime',
        'reach' => 'integer',
        'saves' => 'integer',
        'reels_watch_time' => 'integer',
        'reels_avg_watch_time' => 'float',
        'is_ad_boosted' => 'boolean',
        'ad_spend' => 'float',
        'grid_position' => 'integer',
    ];

    public function tasks(): HasMany
    {
        return $this->hasMany(ContentTask::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ContentComment::class);
    }

    public function history(): HasMany
    {
        return $this->hasMany(ContentWorkflowHistory::class)->orderBy('created_at', 'asc');
    }

    public function igComments(): HasMany
    {
        return $this->hasMany(InstagramComment::class, 'content_item_id')
            ->whereNull('parent_ig_comment_id')
            ->orderByDesc('commented_at');
    }

    public function igSchedules(): HasMany
    {
        return $this->hasMany(InstagramSchedule::class, 'content_item_id')
            ->orderByDesc('created_at');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function haloApuTicket(): HasOne
    {
        return $this->hasOne(HaloApuTicket::class);
    }

    protected static function booted(): void
    {
        static::creating(function (ContentItem $item): void {
            if (empty($item->content_id)) {
                $year = now()->year;
                $prefix = sprintf('SPARC-%d-', $year);
                $maxCode = static::withTrashed()
                    ->where('content_id', 'like', $prefix.'%')
                    ->max('content_id');
                $next = (is_string($maxCode) ? (int) substr($maxCode, strlen($prefix)) : 0) + 1;
                $item->content_id = sprintf('SPARC-%d-%04d', $year, $next);
            }
        });
    }
}
