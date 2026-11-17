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
        Schema::create('trend_insights', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('title_hash')->unique();
            $table->text('summary');
            $table->string('category');
            $table->string('momentum');
            $table->integer('relevance_score');
            $table->json('hook_ideas');
            $table->json('content_ideas');
            $table->json('sources');
            $table->text('raw')->nullable();
            $table->timestamp('refreshed_at');
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index(['category', 'momentum']);
            $table->index('expires_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('trend_insights');
    }
};
