<?php

return [

    /*
    |--------------------------------------------------------------------------
    | View Paths
    |--------------------------------------------------------------------------
    |
    | These are the directories where the application stores its Blade views.
    | Laravel's mail notifications use Blade to render their Markdown emails.
    |
    */

    'paths' => [
        resource_path('views'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Compiled View Path
    |--------------------------------------------------------------------------
    |
    | Give Blade an explicit cache directory. Avoid realpath() here because
    | it returns false when the ignored runtime directory is absent in a fresh
    | deployment image.
    |
    */

    'compiled' => env('VIEW_COMPILED_PATH', storage_path('framework/views')),

];
