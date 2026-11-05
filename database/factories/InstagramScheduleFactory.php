<?php

namespace Database\Factories;

use App\Models\InstagramSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InstagramSchedule>
 */
class InstagramScheduleFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'publication_slot_id' => 'pub-'.fake()->lexify('?????'),
            'media_type' => fake()->randomElement(['IMAGE', 'REELS', 'CAROUSEL']),
            'media_sources' => [
                ['type' => 'url', 'url' => 'https://example.com/media/sample.jpg'],
            ],
            'caption' => fake()->paragraph(),
            'share_to_feed' => true,
            'publish_mode' => 'scheduled',
            'status' => 'queued',
            'scheduled_at' => now()->addHour(),
        ];
    }
}
