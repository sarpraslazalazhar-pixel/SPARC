<?php

namespace App\Models;

use Database\Factories\InstagramGridSlotFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstagramGridSlot extends Model
{
    /** @use HasFactory<InstagramGridSlotFactory> */
    use HasFactory;

    protected $fillable = [
        'content_item_id',
        'position',
        'title',
        'format',
        'status',
        'image_url',
        'canva_url',
        'figma_url',
        'notes',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
        ];
    }

    /**
     * Optional linked SPARC content item.
     */
    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class, 'content_item_id');
    }
}
