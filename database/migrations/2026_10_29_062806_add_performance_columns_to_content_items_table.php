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
        Schema::table('content_items', function (Blueprint $table) {
            $table->string('ref_design_url', 500)->nullable()->after('brief');
            $table->string('result_design_url', 500)->nullable()->after('ref_design_url');
            $table->text('revision_note')->nullable()->after('caption');
            $table->text('performance_notes')->nullable()->after('revision_note');
            $table->unsignedBigInteger('views')->default(0)->after('performance_notes');
            $table->unsignedBigInteger('likes')->default(0)->after('views');
            $table->unsignedBigInteger('comments_count')->default(0)->after('likes');
            $table->unsignedBigInteger('shares')->default(0)->after('comments_count');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('content_items', function (Blueprint $table) {
            $table->dropColumn([
                'ref_design_url',
                'result_design_url',
                'revision_note',
                'performance_notes',
                'views',
                'likes',
                'comments_count',
                'shares',
            ]);
        });
    }
};
