<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Role `publisher` digabung ke `creator`; seluruh izin publisher kini dimiliki creator.
     */
    public function up(): void
    {
        DB::table('users')->where('role', 'publisher')->update(['role' => 'creator']);
        DB::table('users')->where('primary_role', 'publisher')->update(['primary_role' => 'creator']);

        if (Schema::hasTable('content_items')) {
            DB::table('content_items')->where('pic_role', 'publisher')->update(['pic_role' => 'creator']);
        }
    }

    /**
     * Tidak ada rollback: pemisahan publisher/creator tidak bisa direkonstruksi.
     */
    public function down(): void
    {
        //
    }
};
