<?php

namespace Database\Factories;

use App\Models\TrendInsight;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TrendInsight>
 */
class TrendInsightFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $title = $this->faker->sentence(4);

        return [
            'title' => $title,
            'title_hash' => md5(mb_strtolower(trim($title))),
            'summary' => $this->faker->paragraph(),
            'category' => $this->faker->randomElement([
                TrendInsight::CATEGORY_FORMAT,
                TrendInsight::CATEGORY_TOPIC,
                TrendInsight::CATEGORY_HASHTAG,
                TrendInsight::CATEGORY_AUDIO,
                TrendInsight::CATEGORY_NEWS,
            ]),
            'momentum' => $this->faker->randomElement([
                TrendInsight::MOMENTUM_RISING,
                TrendInsight::MOMENTUM_STEADY,
                TrendInsight::MOMENTUM_DECLINING,
            ]),
            'relevance_score' => $this->faker->numberBetween(50, 100),
            'hook_ideas' => [
                ['hook' => $this->faker->sentence(), 'rationale' => $this->faker->sentence()],
            ],
            'content_ideas' => [$this->faker->sentence()],
            'sources' => [
                ['title' => $this->faker->domainName(), 'url' => $this->faker->url()],
            ],
            'raw' => null,
            'refreshed_at' => now(),
            'expires_at' => now()->addDays(7),
        ];
    }

    public function withTitle(string $title): static
    {
        return $this->state(fn (): array => [
            'title' => $title,
            'title_hash' => md5(mb_strtolower(trim($title))),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (): array => [
            'expires_at' => now()->subHour(),
        ]);
    }
}
