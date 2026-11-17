<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Pilar komunikasi (taksonomi konten) yang dikelola administrator.
 *
 * `key` dipakai sebagai nilai `content_items.pillar` sehingga tidak boleh
 * diubah setelah dipakai; label dan warna aman diubah kapan saja.
 */
class ContentPillar extends Model
{
    /** Cache row `contentPillars` (prop Inertia bersama) — dibersihkan setiap mutasi taksonomi. */
    public const CACHE_KEY = 'sparc:content_pillars';

    public const ACCENTS = ['blue', 'indigo', 'violet', 'emerald', 'teal', 'amber', 'rose', 'slate'];

    protected $fillable = [
        'key',
        'label',
        'accent',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /**
     * Pilar aktif terurut untuk select, filter, dan tag.
     *
     * @return array<int, array{id: int, key: string, label: string, accent: string}>
     */
    public static function flushCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    public static function options(): array
    {
        return static::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['id', 'key', 'label', 'accent'])
            ->map(fn (self $pillar): array => [
                'id' => (int) $pillar->id,
                'key' => (string) $pillar->key,
                'label' => (string) $pillar->label,
                'accent' => (string) $pillar->accent,
            ])
            ->all();
    }
}
