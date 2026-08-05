<?php
declare(strict_types=1);

$dataFile = __DIR__ . '/../data/photos.json';

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

require __DIR__ . '/auth-guard.php';
require_admin();

$input = json_decode(file_get_contents('php://input'), true);
$photoIds = $input['photoIds'] ?? [];
$tagIds = $input['tagIds'] ?? [];

if (!is_array($photoIds) || !is_array($tagIds) || empty($photoIds) || empty($tagIds)) {
    json_response(['error' => 'Chybí photoIds nebo tagIds'], 400);
}

if (!file_exists($dataFile)) {
    json_response(['error' => 'Žádné fotky nenalezeny'], 404);
}

$photos = json_decode(file_get_contents($dataFile), true);
if (!is_array($photos)) {
    $photos = [];
}

$photoIdSet = array_flip($photoIds);
$updated = 0;

foreach ($photos as &$photo) {
    if (isset($photoIdSet[$photo['id']])) {
        $existing = $photo['tagIds'] ?? [];
        $photo['tagIds'] = array_values(array_unique(array_merge($existing, $tagIds)));
        $updated++;
    }
}
unset($photo);

$result = @file_put_contents($dataFile, json_encode($photos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
if ($result === false) {
    json_response(['error' => 'Zápis do data/photos.json selhal'], 500);
}

json_response(['updated' => $updated]);
