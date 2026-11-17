<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('content_pillars', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('label');
            $table->string('accent')->default('slate');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $now = now();
        $pillars = [
            ['edukasi', 'Edukasi', 'blue'],
            ['program', 'Program', 'indigo'],
            ['fundraising', 'Fundraising', 'emerald'],
            ['inspirasi', 'Inspirasi', 'violet'],
            ['kelembagaan', 'Kelembagaan', 'slate'],
            ['promosi', 'Promosi', 'indigo'],
            ['event', 'Event & Liputan', 'violet'],
            ['pengumuman', 'Pengumuman', 'slate'],
            ['hiburan', 'Hiburan', 'teal'],
        ];
        foreach ($pillars as $i => [$key, $label, $accent]) {
            DB::table('content_pillars')->insert([
                'key' => $key,
                'label' => $label,
                'accent' => $accent,
                'sort_order' => $i * 10,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('content_pillars');
    }
};
