<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One AI review of a content item: a pre-publish draft check or a post-publish
 * performance read. Reused instead of a dedicated table so the review history
 * stays queryable per analyzable model.
 */
class AiAnalysis extends Model
{
    public const PRE_PUBLISH = 'pre_publish';

    public const POST_PUBLISH = 'post_publish';

    public const PERIODIC_DIGEST = 'periodic_digest';

    public const STATUS_QUEUED = 'queued';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'analyzable_type',
        'analyzable_id',
        'type',
        'input_snapshot',
        'result',
        'status',
        'model',
        'error',
    ];

    protected $casts = [
        'input_snapshot' => 'array',
        'result' => 'array',
    ];

    public function analyzable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * Newest successful review of one model for one analysis type.
     */
    public static function latestCompletedFor(Model $analyzable, string $type): ?self
    {
        return static::query()
            ->where('analyzable_type', $analyzable->getMorphClass())
            ->where('analyzable_id', $analyzable->getKey())
            ->where('type', $type)
            ->where('status', self::STATUS_COMPLETED)
            ->latest('id')
            ->first();
    }
}
