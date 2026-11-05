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
            $table->text('biography')->nullable()->after('page_name');
            $table->string('website', 500)->nullable()->after('biography');
            $table->text('profile_picture_url')->nullable()->after('website');
            $table->unsignedBigInteger('followers_count')->nullable()->after('profile_picture_url');
            $table->unsignedBigInteger('follows_count')->nullable()->after('followers_count');
            $table->unsignedBigInteger('media_count')->nullable()->after('follows_count');
            $table->json('account_insights')->nullable()->after('media_count');
            $table->json('granted_scopes')->nullable()->after('account_insights');
            $table->json('requested_scopes')->nullable()->after('granted_scopes');
            $table->json('rate_limit_usage')->nullable()->after('requested_scopes');
            $table->json('sync_logs')->nullable()->after('rate_limit_usage');
            $table->timestamp('token_refreshed_at')->nullable()->after('token_expires_at');
            $table->timestamp('comments_synced_at')->nullable()->after('last_synced_at');
        });

        Schema::table('content_items', function (Blueprint $table): void {
            $table->string('ig_media_id', 100)->nullable()->index()->after('published_url');
            $table->text('ig_media_url')->nullable()->after('ig_media_id');
            $table->text('ig_thumbnail_url')->nullable()->after('ig_media_url');
            $table->unsignedBigInteger('reach')->nullable()->after('performance_notes');
            $table->unsignedBigInteger('saves')->nullable()->after('shares');
            $table->timestamp('metrics_synced_at')->nullable()->after('saves');
            $table->integer('grid_position')->nullable()->index()->after('metrics_synced_at');
        });

        Schema::create('instagram_schedules', function (Blueprint $table): void {
            $table->id();
            $table->string('publication_slot_id', 100)->nullable()->index();
            $table->foreignId('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->string('media_type', 30)->default('IMAGE');
            $table->json('media_sources');
            $table->string('cover_url', 500)->nullable();
            $table->text('caption')->nullable();
            $table->boolean('share_to_feed')->default(true);
            $table->string('publish_mode', 30)->default('immediate');
            $table->string('status', 30)->default('queued')->index();
            $table->timestamp('scheduled_at')->nullable()->index();
            $table->timestamp('published_at')->nullable();
            $table->string('ig_container_id', 100)->nullable();
            $table->string('ig_media_id', 100)->nullable();
            $table->string('permalink', 500)->nullable();
            $table->text('error_message')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('instagram_comments', function (Blueprint $table): void {
            $table->id();
            $table->string('ig_comment_id', 100)->unique();
            $table->string('ig_media_id', 100)->index();
            $table->string('media_permalink', 500)->nullable();
            $table->string('media_caption_excerpt', 255)->nullable();
            $table->text('media_thumbnail_url')->nullable();
            $table->foreignId('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->string('parent_ig_comment_id', 100)->nullable()->index();
            $table->string('username', 150);
            $table->text('text');
            $table->unsignedInteger('like_count')->default(0);
            $table->boolean('is_hidden')->default(false);
            $table->boolean('is_replied')->default(false);
            $table->string('replied_by', 150)->nullable();
            $table->text('reply_text')->nullable();
            $table->timestamp('replied_at')->nullable();
            $table->foreignId('converted_content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->timestamp('commented_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('instagram_grid_slots', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->unsignedInteger('position')->default(1)->index();
            $table->string('title', 255);
            $table->string('format', 40)->default('feed_single');
            $table->string('status', 30)->default('planned');
            $table->text('image_url')->nullable();
            $table->string('canva_url', 500)->nullable();
            $table->string('figma_url', 500)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('instagram_grid_slots');
        Schema::dropIfExists('instagram_comments');
        Schema::dropIfExists('instagram_schedules');

        Schema::table('content_items', function (Blueprint $table): void {
            $table->dropColumn([
                'ig_media_id',
                'ig_media_url',
                'ig_thumbnail_url',
                'reach',
                'saves',
                'metrics_synced_at',
                'grid_position',
            ]);
        });

        Schema::table('instagram_connections', function (Blueprint $table): void {
            $table->dropColumn([
                'biography',
                'website',
                'profile_picture_url',
                'followers_count',
                'follows_count',
                'media_count',
                'account_insights',
                'granted_scopes',
                'requested_scopes',
                'rate_limit_usage',
                'sync_logs',
                'token_refreshed_at',
                'comments_synced_at',
            ]);
        });
    }
};
