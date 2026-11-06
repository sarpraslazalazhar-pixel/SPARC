<?php

namespace App\Http\Resources;

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

        return [
            'id' => (string) $this->id,
            'contentId' => $this->content_id,
            'ticketId' => $this->ticket_id,
            'haloapuTicketId' => $this->haloApuTicket?->haloapu_ticket_id,
            'haloapuStatus' => $this->haloApuTicket?->haloapu_status,
            'isResultAccepted' => $this->haloApuTicket ? (bool) $this->haloApuTicket->is_result_accepted : null,
            'revisionCount' => $this->haloApuTicket?->revision_count,
            'deliverableUrl' => $this->haloApuTicket?->deliverable_url,
            'haloApuDbId' => $this->haloApuTicket ? (string) $this->haloApuTicket->id : null,
            'title' => $this->title,
            'status' => $this->status,
            'priority' => $this->priority,
            'platform' => $this->platform,
            'format' => $this->format,
            'pillar' => $this->pillar,
            'picName' => $this->pic_name,
            'picRole' => $this->pic_role,
            'picAvatar' => $this->pic_avatar ?? '',
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
