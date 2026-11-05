<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'instagram' => [
        'app_id' => env('META_APP_ID'),
        'app_secret' => env('META_APP_SECRET'),
        'redirect_uri' => env('META_REDIRECT_URI'),
        'account_id' => env('INSTAGRAM_ACCOUNT_ID'),
        'access_token' => env('INSTAGRAM_ACCESS_TOKEN'),
        'graph_version' => env('META_GRAPH_VERSION', 'v21.0'),
        'oauth_scopes' => env(
            'META_OAUTH_SCOPES',
            'instagram_basic,pages_show_list,pages_read_engagement,instagram_manage_insights,instagram_content_publish,instagram_manage_comments'
        ),
    ],

];
