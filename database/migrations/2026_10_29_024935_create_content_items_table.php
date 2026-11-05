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
        Schema::create('content_items', function (Blueprint $table) {
            $table->id();
            $table->string('content_id')->unique();
            $table->string('ticket_id')->nullable();
            $table->string('title');
            $table->string('status')->default('inbox');
            $table->string('priority')->default('normal');
            $table->string('platform');
            $table->string('format');
            $table->string('pillar');
            $table->string('pic_name');
            $table->string('pic_role')->nullable();
            $table->string('pic_avatar')->nullable();
            $table->date('production_deadline');
            $table->date('publish_date');
            $table->time('publish_time')->nullable();
            $table->string('activity_title')->nullable();
            $table->string('campaign_title')->nullable();
            $table->text('brief')->nullable();
            $table->text('caption')->nullable();
            $table->string('published_url')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->softDeletes();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('content_items');
    }
};
