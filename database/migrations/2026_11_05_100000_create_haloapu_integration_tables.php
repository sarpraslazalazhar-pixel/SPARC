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
        // 1. Connection settings singleton
        Schema::create('haloapu_connections', function (Blueprint $table) {
            $table->id();
            $table->boolean('is_enabled')->default(false);
            $table->string('base_url')->nullable();
            $table->text('api_token')->nullable();
            $table->text('webhook_secret')->nullable();
            $table->boolean('auto_solve_on_publish')->default(true);
            $table->json('filter_rules')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamp('last_webhook_at')->nullable();
            $table->string('last_status')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        // 2. Synchronized HaloAPU tickets
        Schema::create('haloapu_tickets', function (Blueprint $table) {
            $table->id();
            $table->string('haloapu_ticket_id')->unique(); // e.g. "045-812-901"
            $table->unsignedBigInteger('raw_ticket_id')->index();
            $table->string('source_type'); // video_reels | desain_feed
            $table->string('sub_unit_name');
            $table->string('title');
            $table->text('brief')->nullable();
            $table->string('requester_name');
            $table->string('requester_unit')->nullable();
            $table->string('requester_whatsapp')->nullable();
            $table->string('assigned_operator_name')->nullable();
            $table->string('priority')->default('Sedang');
            $table->date('target_date')->nullable();
            $table->string('haloapu_status')->default('open');
            $table->string('sync_status')->default('pending'); // pending | converted | ignored
            $table->boolean('is_result_accepted')->default(false);
            $table->unsignedInteger('revision_count')->default(0);
            $table->timestamp('sla_response_deadline')->nullable();
            $table->timestamp('sla_resolution_deadline')->nullable();
            $table->boolean('is_sla_breached')->default(false);
            $table->json('form_snapshot')->nullable();
            $table->json('attachments_payload')->nullable();
            $table->json('logs_payload')->nullable();
            $table->foreignId('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->string('deliverable_url')->nullable();
            $table->timestamp('haloapu_created_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });

        // 3. Telemetry and audit logs
        Schema::create('haloapu_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('direction'); // inbound_webhook | outbound_push | manual_pull | scheduled_pull
            $table->string('event_type');
            $table->string('status'); // success | failed | error
            $table->unsignedInteger('fetched_count')->default(0);
            $table->unsignedInteger('latency_ms')->default(0);
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('haloapu_sync_logs');
        Schema::dropIfExists('haloapu_tickets');
        Schema::dropIfExists('haloapu_connections');
    }
};
