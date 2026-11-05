<?php

namespace Database\Factories;

use App\Models\InstagramComment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InstagramComment>
 */
class InstagramCommentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'ig_comment_id' => (string) fake()->unique()->numerify('179##############'),
            'ig_media_id' => (string) fake()->numerify('180##############'),
            'media_permalink' => 'https://www.instagram.com/p/SPARC'.fake()->lexify('????').'/',
            'media_caption_excerpt' => fake()->sentence(6),
            'username' => fake()->userName(),
            'text' => fake()->sentence(10),
            'like_count' => fake()->numberBetween(0, 25),
            'is_hidden' => false,
            'is_replied' => false,
            'commented_at' => now()->subMinutes(fake()->numberBetween(5, 300)),
        ];
    }
}
