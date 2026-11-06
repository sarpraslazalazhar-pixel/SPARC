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
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'no_wa')) {
                $table->string('no_wa', 30)->nullable()->after('email');
            }
            if (! Schema::hasColumn('users', 'notify_browser')) {
                $table->boolean('notify_browser')->default(true)->after('capacity_hours');
            }
            if (! Schema::hasColumn('users', 'notify_inapp')) {
                $table->boolean('notify_inapp')->default(true)->after('notify_browser');
            }
            if (! Schema::hasColumn('users', 'notify_sound')) {
                $table->boolean('notify_sound')->default(true)->after('notify_inapp');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['no_wa', 'notify_browser', 'notify_inapp', 'notify_sound']);
        });
    }
};
