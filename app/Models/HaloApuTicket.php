<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class HaloApuTicket extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'haloapu_tickets';

    protected $fillable = [
        'haloapu_ticket_id',
        'raw_ticket_id',
        'source_type',
        'sub_unit_name',
        'title',
        'brief',
        'requester_name',
        'requester_unit',
        'requester_whatsapp',
        'requester_avatar',
        'assigned_operator_name',
        'priority',
        'target_date',
        'haloapu_status',
        'sync_status',
        'is_result_accepted',
        'revision_count',
        'sla_response_deadline',
        'sla_resolution_deadline',
        'is_sla_breached',
        'form_snapshot',
        'attachments_payload',
        'logs_payload',
        'content_item_id',
        'deliverable_url',
        'haloapu_created_at',
        'last_synced_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'target_date' => 'date',
            'is_result_accepted' => 'boolean',
            'revision_count' => 'integer',
            'sla_response_deadline' => 'datetime',
            'sla_resolution_deadline' => 'datetime',
            'is_sla_breached' => 'boolean',
            'form_snapshot' => 'array',
            'attachments_payload' => 'array',
            'logs_payload' => 'array',
            'haloapu_created_at' => 'datetime',
            'last_synced_at' => 'datetime',
        ];
    }

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }
}
