<?php

namespace App\Models;

use Database\Factories\InstagramCommentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InstagramComment extends Model
{
    /** @use HasFactory<InstagramCommentFactory> */
    use HasFactory;

    protected $fillable = [
        'ig_comment_id',
        'ig_media_id',
        'media_permalink',
        'media_caption_excerpt',
        'media_thumbnail_url',
        'content_item_id',
        'parent_ig_comment_id',
        'username',
        'text',
        'like_count',
        'is_hidden',
        'is_replied',
        'replied_by',
        'reply_text',
        'replied_at',
        'converted_content_item_id',
        'commented_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'like_count' => 'integer',
            'is_hidden' => 'boolean',
            'is_replied' => 'boolean',
            'replied_at' => 'datetime',
            'commented_at' => 'datetime',
        ];
    }

    /**
     * Linked SPARC content item for this Instagram post.
     */
    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class, 'content_item_id');
    }

    /**
     * Content idea created from this public comment, if converted.
     */
    public function convertedContentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class, 'converted_content_item_id');
    }

    /**
     * Child replies fetched from Instagram Graph API.
     */
    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_ig_comment_id', 'ig_comment_id')
            ->orderBy('commented_at', 'asc');
    }
}
