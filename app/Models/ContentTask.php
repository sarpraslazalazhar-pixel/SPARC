<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'content_item_id',
        'title',
        'task_type',
        'status',
        'assigned_to',
        'due_date',
    ];

    protected $casts = [
        'due_date' => 'date',
    ];

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }
}
