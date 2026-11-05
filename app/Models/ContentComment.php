<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentComment extends Model
{
    use HasFactory;

    protected $fillable = [
        'content_item_id',
        'author',
        'role_label',
        'comment',
        'is_revision_note',
    ];

    protected $casts = [
        'is_revision_note' => 'boolean',
    ];

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }
}
