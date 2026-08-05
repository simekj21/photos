<?php
declare(strict_types=1);

$actionsRoot = __DIR__ . '/../actions';

require __DIR__ . '/auth-guard.php';
require __DIR__ . '/photo-utils.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function json_response($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['error' => 'Metoda není povolena'], 405);
}

require_admin();

function count_images_in_dir(string $dir): int {
    $count = 0;
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = "$dir/$entry";
        if (!is_file($path)) {
            continue;
        }
        $extension = strtolower((string) pathinfo($entry, PATHINFO_EXTENSION));
        if (in_array($extension, ALLOWED_IMAGE_TYPES, true) || $extension === 'jpeg') {
            $count++;
        }
    }
    return $count;
}

$folders = [];

if (is_dir($actionsRoot)) {
    foreach (scandir($actionsRoot) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..' || $entry[0] === '.') {
            continue;
        }
        $path = "$actionsRoot/$entry";
        if (!is_dir($path)) {
            continue;
        }
        $folders[] = [
            'name' => $entry,
            'count' => count_images_in_dir($path),
        ];
    }
}

usort($folders, function ($a, $b) {
    return strcasecmp($a['name'], $b['name']);
});

json_response($folders);
