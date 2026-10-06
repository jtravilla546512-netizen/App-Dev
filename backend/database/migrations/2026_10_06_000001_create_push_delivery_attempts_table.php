<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('push_device_id')->constrained()->cascadeOnDelete();
            $table->string('ticket_id')->nullable()->index();
            $table->string('status', 40)->index();
            $table->string('error_code', 100)->nullable();
            $table->timestamp('created_at')->index();
            $table->timestamp('checked_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_delivery_attempts');
    }
};
