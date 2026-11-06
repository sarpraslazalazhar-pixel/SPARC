<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('instagram_connections', function (Blueprint $table): void {
            $table->json('ads_data')->nullable()->after('sync_logs');
            $table->json('demographics_data')->nullable()->after('ads_data');
            $table->json('stories_data')->nullable()->after('demographics_data');
            $table->json('mentions_data')->nullable()->after('stories_data');
        });

        Schema::table('content_items', function (Blueprint $table): void {
            $table->unsignedBigInteger('reels_watch_time')->nullable()->after('saves');
            $table->float('reels_avg_watch_time')->nullable()->after('reels_watch_time');
            $table->boolean('is_ad_boosted')->default(false)->after('reels_avg_watch_time');
            $table->decimal('ad_spend', 12, 2)->nullable()->after('is_ad_boosted');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('content_items', function (Blueprint $table): void {
            $table->dropColumn([
                'reels_watch_time',
                'reels_avg_watch_time',
                'is_ad_boosted',
                'ad_spend',
            ]);
        });

        Schema::table('instagram_connections', function (Blueprint $table): void {
            $table->dropColumn([
                'ads_data',
                'demographics_data',
                'stories_data',
                'mentions_data',
            ]);
        });
    }
};
