<?php

namespace Database\Factories;

use App\Models\ContentItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ContentItem>
 */
class ContentItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        static $seq = 1;
        $year = now()->year;

        return [
            'content_id' => sprintf('SPARC-%d-%04d', $year, $seq++),
            'title' => fake()->sentence(4),
            'priority' => fake()->randomElement(['critical', 'tinggi', 'normal', 'rendah']),
            'platform' => fake()->randomElement(['instagram', 'tiktok', 'youtube', 'website', 'whatsapp']),
            'format' => fake()->randomElement(['Reels', 'Feed IG', 'Carousel', 'YouTube Short', 'Artikel']),
            'pillar' => fake()->randomElement(['edukasi', 'program', 'fundraising', 'inspirasi', 'kelembagaan']),
            'pic_name' => fake()->name(),
            'pic_role' => 'creator',
            'pic_avatar' => '',
            'production_deadline' => fake()->dateTimeBetween('now', '+2 weeks')->format('Y-m-d'),
            'publish_date' => fake()->dateTimeBetween('+1 week', '+1 month')->format('Y-m-d'),
        ];
    }
}
