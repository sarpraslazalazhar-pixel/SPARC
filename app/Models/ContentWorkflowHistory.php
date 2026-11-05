<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentWorkflowHistory extends Model
{
    use HasFactory;

    protected $table = 'content_workflow_history';

    protected $fillable = [
        'content_item_id',
        'from_status',
        'to_status',
        'actor',
        'note',
    ];

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }
}
