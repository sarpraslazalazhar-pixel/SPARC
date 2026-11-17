<?php

namespace App\Models;

use Database\Factories\TrendInsightFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** @use HasFactory<TrendInsightFactory> */
class TrendInsight extends Model
{
    use HasFactory;

    public const CATEGORY_FORMAT = 'format';

    public const CATEGORY_TOPIC = 'topic';

    public const CATEGORY_HASHTAG = 'hashtag';

    public const CATEGORY_AUDIO = 'audio';

    public const CATEGORY_NEWS = 'news';

    public const MOMENTUM_RISING = 'rising';

    public const MOMENTUM_STEADY = 'steady';

    public const MOMENTUM_DECLINING = 'declining';

    protected $fillable = [
        'title',
        'title_hash',
        'summary',
        'category',
        'momentum',
        'relevance_score',
        'hook_ideas',
        'content_ideas',
        'sources',
        'embedding',
        'raw',
        'usage',
        'refreshed_at',
        'expires_at',
    ];

    public function casts(): array
    {
        return [
            'hook_ideas' => 'array',
            'content_ideas' => 'array',
            'sources' => 'array',
            'embedding' => 'array',
            'usage' => 'array',
            'relevance_score' => 'integer',
            'refreshed_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('expires_at', '>', now());
    }
}
