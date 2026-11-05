<?php

namespace Database\Factories;

use App\Models\InstagramGridSlot;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InstagramGridSlot>
 */
class InstagramGridSlotFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'position' => fake()->numberBetween(1, 9),
            'title' => fake()->sentence(4),
            'format' => fake()->randomElement(['feed_single', 'feed_carousel', 'reels_cover']),
            'status' => fake()->randomElement(['planned', 'in_design', 'empty']),
            'image_url' => 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500',
            'notes' => fake()->sentence(),
        ];
    }
}
