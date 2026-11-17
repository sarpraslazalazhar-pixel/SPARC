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
        Schema::create('ai_analyses', function (Blueprint $table) {
            $table->id();
            $table->nullableMorphs('analyzable');
            $table->string('type');
            $table->json('input_snapshot');
            $table->json('result')->nullable();
            $table->string('status')->default('queued');
            $table->string('model');
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index(['analyzable_type', 'analyzable_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_analyses');
    }
};
