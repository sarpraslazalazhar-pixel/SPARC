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
        Schema::create('instagram_connections', function (Blueprint $table) {
            $table->id();
            $table->string('app_id', 100)->nullable();
            $table->text('app_secret')->nullable();
            $table->string('account_id', 100)->nullable();
            $table->string('username', 150)->nullable();
            $table->string('name', 150)->nullable();
            $table->string('page_id', 100)->nullable();
            $table->string('page_name', 150)->nullable();
            $table->text('access_token')->nullable();
            $table->text('user_access_token')->nullable();
            $table->longText('candidate_accounts')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->boolean('connected')->default(false);
            $table->timestamp('last_tested_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->foreignId('connected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('instagram_connections');
    }
};
