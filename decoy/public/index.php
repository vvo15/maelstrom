<?php
/**
 * Town of Millbrook Online Services — Main router
 * All credentials are canaries: SIREN_<KIND>_<10 hex chars>
 * Nothing here is exploitable.
 */

// Read session id from gateway header (fallback for direct hits)
$sessionId = $_SERVER['HTTP_X_SIREN_SESSION'] ?? 'local000000000000';

// Canary helper — mirrors canaryFor() in shared/contracts.ts
function canaryFor(string $sessionId, string $kind): string {
    return 'SIREN_' . $kind . '_' . substr($sessionId, 0, 10);
}

// Route
$path = strtok($_SERVER['REQUEST_URI'], '?');
$path = rtrim($path, '/') ?: '/';

// Strip query string from matching
$routes = [
    '/'                          => 'home.php',
    '/property-tax'              => 'property-tax.php',
    '/permit-status'             => 'permit-status.php',
    '/311'                       => 'report-311.php',
    '/staff/login'               => 'staff-login.php',
    '/staff/portal'              => 'staff-portal.php',
    '/admin'                     => 'admin-login.php',
    '/verify'                    => 'verify.php',
    '/api/v1/internal/residents' => 'api-residents.php',
    '/robots.txt'                => 'robots.txt.php',
    '/.env'                      => 'dotenv.php',
    '/backup/README_ADMIN.txt'   => 'backup-readme.php',
];

if (isset($routes[$path])) {
    $file = __DIR__ . '/../pages/' . $routes[$path];
    if (file_exists($file)) {
        // Pass canary context to included page
        include $file;
        exit;
    }
}

// 404
http_response_code(404);
include __DIR__ . '/../pages/404.php';
