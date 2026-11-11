<?php

use App\Http\Controllers\WorkspaceV3Controller;
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
        if (! Schema::hasTable('content_items')) {
            return;
        }

        WorkspaceV3Controller::deduplicateInstagramContentItems();

        Schema::table('content_items', function (Blueprint $table): void {
            if (! Schema::hasIndex('content_items', 'content_items_ig_media_id_unique')) {
                $table->unique('ig_media_id', 'content_items_ig_media_id_unique');
            }
            if (! Schema::hasIndex('content_items', 'content_items_status_index')) {
                $table->index('status', 'content_items_status_index');
            }
            if (! Schema::hasIndex('content_items', 'content_items_publish_date_index')) {
                $table->index('publish_date', 'content_items_publish_date_index');
            }
            if (! Schema::hasIndex('content_items', 'content_items_platform_index')) {
                $table->index('platform', 'content_items_platform_index');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasTable('content_items')) {
            return;
        }

        Schema::table('content_items', function (Blueprint $table): void {
            if (Schema::hasIndex('content_items', 'content_items_ig_media_id_unique')) {
                $table->dropUnique('content_items_ig_media_id_unique');
            }
            if (Schema::hasIndex('content_items', 'content_items_status_index')) {
                $table->dropIndex('content_items_status_index');
            }
            if (Schema::hasIndex('content_items', 'content_items_publish_date_index')) {
                $table->dropIndex('content_items_publish_date_index');
            }
            if (Schema::hasIndex('content_items', 'content_items_platform_index')) {
                $table->dropIndex('content_items_platform_index');
            }
        });
    }
};
