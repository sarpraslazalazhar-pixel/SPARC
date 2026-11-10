<?php

namespace App\Http\Resources;

use App\Models\HaloApuConnection;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Schema;

class ContentItemResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $igComments = [];
        if ($this->relationLoaded('igComments')) {
            $igComments = $this->igComments->map(fn ($c): array => [
                'id' => (string) $c->id,
                'igCommentId' => (string) $c->ig_comment_id,
                'username' => (string) $c->username,
                'text' => (string) $c->text,
                'likeCount' => (int) $c->like_count,
                'isHidden' => (bool) $c->is_hidden,
                'isReplied' => (bool) $c->is_replied,
                'replyText' => $c->reply_text,
                'repliedBy' => $c->replied_by,
                'commentedAt' => $c->commented_at?->format('d M Y, H:i') ?? '',
                'convertedContentItemId' => $c->converted_content_item_id ? (string) $c->converted_content_item_id : null,
            ])->values()->all();
        } elseif ($this->ig_media_id && Schema::hasTable('instagram_comments')) {
            $igComments = $this->igComments()->limit(20)->get()->map(fn ($c): array => [
                'id' => (string) $c->id,
                'igCommentId' => (string) $c->ig_comment_id,
                'username' => (string) $c->username,
                'text' => (string) $c->text,
                'likeCount' => (int) $c->like_count,
                'isHidden' => (bool) $c->is_hidden,
                'isReplied' => (bool) $c->is_replied,
                'replyText' => $c->reply_text,
                'repliedBy' => $c->replied_by,
                'commentedAt' => $c->commented_at?->format('d M Y, H:i') ?? '',
                'convertedContentItemId' => $c->converted_content_item_id ? (string) $c->converted_content_item_id : null,
            ])->values()->all();
        }

        $ticket = $this->haloApuTicket;
        $requesterName = $ticket?->requester_name ? trim((string) $ticket->requester_name) : null;
        $requesterUnit = $ticket?->requester_unit ? trim((string) $ticket->requester_unit) : null;
        $requesterAvatar = null;
        if ($ticket && $requesterName) {
            $rawAvatar = trim((string) ($ticket->requester_avatar ?? ''));
            if ($rawAvatar !== '') {
                if (! str_starts_with($rawAvatar, 'http')) {
                    $haloBase = Schema::hasTable('haloapu_connections')
                        ? rtrim((string) (HaloApuConnection::current()->base_url ?: 'http://127.0.0.1:8001'), '/')
                        : 'http://127.0.0.1:8001';
                    $requesterAvatar = $haloBase.'/'.ltrim($rawAvatar, '/');
                } elseif (str_contains($rawAvatar, ':8000/storage/avatars/')) {
                    $requesterAvatar = str_replace(':8000/storage/avatars/', ':8001/storage/avatars/', $rawAvatar);
                } else {
                    $requesterAvatar = $rawAvatar;
                }
            } else {
                $requesterAvatar = 'https://ui-avatars.com/api/?name='.urlencode($requesterName).'&background=1546D8&color=fff&size=96&bold=true';
            }
        }

        $picAvatar = trim((string) ($this->pic_avatar ?? ''));
        if ($picAvatar === '' && ! empty($this->pic_name) && $this->pic_name !== 'Belum Ditugaskan') {
            $picAvatar = 'https://ui-avatars.com/api/?name='.urlencode((string) $this->pic_name).'&background=0F172A&color=fff&size=96&bold=true';
        }

        return [
            'id' => (string) $this->id,
            'contentId' => $this->content_id,
            'ticketId' => $this->ticket_id,
            'haloapuTicketId' => $ticket?->haloapu_ticket_id,
            'haloapuStatus' => $ticket?->haloapu_status,
            'isResultAccepted' => $ticket ? (bool) $ticket->is_result_accepted : null,
            'revisionCount' => $ticket?->revision_count,
            'deliverableUrl' => $ticket?->deliverable_url,
            'haloApuDbId' => $ticket ? (string) $ticket->id : null,
            'requesterName' => $requesterName,
            'requesterUnit' => $requesterUnit,
            'requesterAvatar' => $requesterAvatar,
            'assignedOperatorName' => $ticket?->assigned_operator_name ? trim((string) $ticket->assigned_operator_name) : null,
            'title' => $this->title,
            'status' => $this->status,
            'priority' => $this->priority,
            'platform' => $this->platform,
            'format' => $this->format,
            'pillar' => $this->pillar,
            'picName' => $this->pic_name,
            'picRole' => $this->pic_role,
            'picAvatar' => $picAvatar,
            'productionDeadline' => $this->production_deadline?->toDateString(),
            'publishDate' => $this->publish_date?->toDateString(),
            'publishTime' => $this->publish_time,
            'activityTitle' => $this->activity_title,
            'campaignTitle' => $this->campaign_title,
            'brief' => $this->brief,
            'caption' => $this->caption,
            'publishedUrl' => $this->published_url,
            'igMediaId' => $this->ig_media_id,
            'igMediaUrl' => $this->ig_media_url,
            'igThumbnailUrl' => $this->ig_thumbnail_url,
            'refDesignUrl' => $this->ref_design_url,
            'resultDesignUrl' => $this->result_design_url,
            'revisionNote' => $this->revision_note,
            'performanceNotes' => $this->performance_notes,
            'reach' => $this->reach !== null ? (int) $this->reach : null,
            'views' => (int) $this->views,
            'likes' => (int) $this->likes,
            'commentsCount' => (int) $this->comments_count,
            'shares' => (int) $this->shares,
            'saves' => $this->saves !== null ? (int) $this->saves : null,
            'reelsWatchTime' => $this->reels_watch_time !== null ? (int) $this->reels_watch_time : null,
            'reelsAvgWatchTime' => $this->reels_avg_watch_time !== null ? (float) $this->reels_avg_watch_time : null,
            'isAdBoosted' => (bool) $this->is_ad_boosted,
            'adSpend' => $this->ad_spend !== null ? (float) $this->ad_spend : null,
            'gridPosition' => $this->grid_position !== null ? (int) $this->grid_position : null,
            'igComments' => $igComments,
            'tasks' => ($this->relationLoaded('tasks') ? $this->tasks : $this->tasks()->get())->map(fn ($t) => [
                'id' => (string) $t->id,
                'title' => $t->title,
                'taskType' => $t->task_type,
                'status' => $t->status,
                'assignedTo' => $t->assigned_to,
                'dueDate' => $t->due_date?->toDateString() ?? '',
            ])->values()->all(),
            'comments' => ($this->relationLoaded('comments') ? $this->comments : $this->comments()->get())->map(fn ($c) => [
                'id' => (string) $c->id,
                'author' => $c->author,
                'roleLabel' => $c->role_label,
                'comment' => $c->comment,
                'isRevisionNote' => (bool) $c->is_revision_note,
                'createdAt' => $c->created_at?->toDateTimeString() ?? '',
            ])->values()->all(),
            'history' => ($this->relationLoaded('history') ? $this->history : $this->history()->get())->map(fn ($h) => [
                'id' => (string) $h->id,
                'fromStatus' => $h->from_status,
                'toStatus' => $h->to_status,
                'actor' => $h->actor,
                'timestamp' => $h->created_at?->toDateTimeString() ?? '',
                'note' => $h->note ?? '',
            ])->values()->all(),
        ];
    }
}
