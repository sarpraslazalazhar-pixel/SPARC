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
        Schema::table('haloapu_tickets', function (Blueprint $table) {
            if (! Schema::hasColumn('haloapu_tickets', 'requester_avatar')) {
                $table->string('requester_avatar', 500)->nullable()->after('requester_whatsapp');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('haloapu_tickets', function (Blueprint $table) {
            $table->dropColumn('requester_avatar');
        });
    }
};
