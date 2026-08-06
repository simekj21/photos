<?php
declare(strict_types=1);

$actionsRoot = __DIR__ . '/../actions';

require __DIR__ . '/auth-guard.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function json_response($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Metoda není povolena'], 405);
}

require_admin();

function rrmdir(string $dir): void {
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = "$dir/$entry";
        if (is_dir($path)) {
            rrmdir($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

$input = json_decode(file_get_contents('php://input'), true);
$folder = (string) ($input['folder'] ?? '');

if ($folder === '' || basename($folder) !== $folder || $folder === '.' || $folder === '..') {
    json_response(['error' => 'Neplatný název složky'], 400);
}

$targetDir = "$actionsRoot/$folder";
$realActionsRoot = realpath($actionsRoot);
$realTargetDir = realpath($targetDir);

if (!$realActionsRoot || !$realTargetDir || strpos($realTargetDir, $realActionsRoot . DIRECTORY_SEPARATOR) !== 0 || !is_dir($realTargetDir)) {
    json_response(['error' => 'Složka nenalezena'], 404);
}

rrmdir($realTargetDir);

json_response(['deleted' => $folder]);
