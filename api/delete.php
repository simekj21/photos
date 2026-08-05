<?php
declare(strict_types=1);

$dataFile = __DIR__ . '/../data/photos.json';
$root = __DIR__ . '/..';

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
$ids = $input['ids'] ?? null;
if (!is_array($ids)) {
    $singleId = $input['id'] ?? ($_POST['id'] ?? null);
    $ids = $singleId ? [$singleId] : [];
}
$ids = array_values(array_unique(array_filter($ids)));

if (empty($ids)) {
    json_response(['error' => 'Chybí id fotky/fotek'], 400);
}

if (!file_exists($dataFile)) {
    json_response(['error' => 'Fotka nenalezena'], 404);
}

$photos = json_decode(file_get_contents($dataFile), true);
if (!is_array($photos)) {
    $photos = [];
}

$idsToDelete = array_flip($ids);
$deleted = [];
$remaining = [];

foreach ($photos as $photo) {
    $photoId = $photo['id'] ?? null;
    if ($photoId !== null && isset($idsToDelete[$photoId])) {
        foreach (['originalUrl', 'thumbUrl'] as $key) {
            if (!empty($photo[$key])) {
                $path = $root . '/' . $photo[$key];
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }
        $deleted[] = $photoId;
    } else {
        $remaining[] = $photo;
    }
}

if (empty($deleted)) {
    json_response(['error' => 'Fotka nenalezena'], 404);
}

$result = @file_put_contents($dataFile, json_encode($remaining, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
if ($result === false) {
    json_response(['error' => 'Zápis do data/photos.json selhal'], 500);
}

json_response(['deleted' => $deleted]);
