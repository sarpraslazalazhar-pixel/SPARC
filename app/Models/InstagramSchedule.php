<?php

namespace App\Models;

use Database\Factories\InstagramScheduleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstagramSchedule extends Model
{
    /** @use HasFactory<InstagramScheduleFactory> */
    use HasFactory;

    protected $fillable = [
        'publication_slot_id',
        'content_item_id',
        'media_type',
        'media_sources',
        'cover_url',
        'caption',
        'share_to_feed',
        'publish_mode',
        'status',
        'scheduled_at',
        'published_at',
        'ig_container_id',
        'ig_media_id',
        'permalink',
        'error_message',
        'created_by',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'media_sources' => 'array',
            'share_to_feed' => 'boolean',
            'scheduled_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    /**
     * Linked SPARC content item.
     */
    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class, 'content_item_id');
    }

    /**
     * User who initiated the publish/schedule request.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
