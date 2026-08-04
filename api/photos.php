<?php
declare(strict_types=1);

$dataFile = __DIR__ . '/../data/photos.json';

header('Content-Type: application/json; charset=utf-8');

if (!file_exists($dataFile)) {
    echo json_encode([]);
    exit;
}

$content = file_get_contents($dataFile);
$photos = json_decode($content, true);
if (!is_array($photos)) {
    $photos = [];
}

usort($photos, function ($a, $b) {
    return strcmp($b['uploadedAt'] ?? '', $a['uploadedAt'] ?? '');
});

echo json_encode($photos, JSON_UNESCAPED_UNICODE);
