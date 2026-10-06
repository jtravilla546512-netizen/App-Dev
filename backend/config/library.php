<?php

return [
    'default_loan_days' => (int) env('LIBRARY_DEFAULT_LOAN_DAYS', 14),
    'max_active_loans' => (int) env('LIBRARY_MAX_ACTIVE_LOANS', 3),
    'due_soon_days' => (int) env('LIBRARY_DUE_SOON_DAYS', 3),
    'require_email_verification' => (bool) env('LIBRARY_REQUIRE_EMAIL_VERIFICATION', false),
    'require_member_approval' => (bool) env('LIBRARY_REQUIRE_MEMBER_APPROVAL', false),

    'first_admin' => [
        'name' => env('LIBRARY_FIRST_ADMIN_NAME', 'Library Administrator'),
        'email' => env('LIBRARY_FIRST_ADMIN_EMAIL'),
        'password' => env('LIBRARY_FIRST_ADMIN_PASSWORD'),
    ],
];
