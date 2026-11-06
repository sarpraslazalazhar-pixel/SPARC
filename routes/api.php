<?php

use App\Http\Controllers\HaloApuWebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/haloapu', [HaloApuWebhookController::class, 'handle'])
    ->middleware('throttle:60,1');
