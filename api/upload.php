<?php
declare(strict_types=1);

$uploadsRoot = __DIR__ . '/../uploads';
$dataFile = __DIR__ . '/../data/photos.json';
$maxFileSize = 15 * 1024 * 1024; // 15 MB

require __DIR__ . '/photo-utils.php';

function json_response($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Metoda není povolena'], 405);
}

require __DIR__ . '/auth-guard.php';
require_admin();

if (empty($_FILES['photos'])) {
    json_response(['error' => 'Nebyly nahrány žádné soubory'], 400);
}

$files = $_FILES['photos'];
$fileCount = is_array($files['name']) ? count($files['name']) : 0;
$countryCode = trim((string) ($_POST['countryCode'] ?? '')) ?: null;

if ($fileCount === 0) {
    json_response(['error' => 'Nebyly nahrány žádné soubory'], 400);
}

$photos = load_photos($dataFile);
$uploaded = [];
$errors = [];

for ($i = 0; $i < $fileCount; $i++) {
    $originalName = $files['name'][$i];
    $tmpPath = $files['tmp_name'][$i];
    $error = $files['error'][$i];
    $size = $files['size'][$i];

    if ($error !== UPLOAD_ERR_OK) {
        $errors[] = "$originalName: chyba při nahrávání";
        continue;
    }
    if ($size > $maxFileSize) {
        $errors[] = "$originalName: soubor je příliš velký (max 15 MB)";
        continue;
    }
    if (!is_uploaded_file($tmpPath)) {
        $errors[] = "$originalName: neplatný soubor";
        continue;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $tmpPath);
    finfo_close($finfo);

    if (!isset(ALLOWED_IMAGE_TYPES[$mimeType])) {
        $errors[] = "$originalName: nepodporovaný typ souboru";
        continue;
    }

    $target = make_upload_target($uploadsRoot, ALLOWED_IMAGE_TYPES[$mimeType]);

    if (!move_uploaded_file($tmpPath, $target['originalDestPath'])) {
        $errors[] = "$originalName: uložení se nezdařilo";
        continue;
    }

    $dims = finalize_uploaded_image($target['originalDestPath'], $mimeType, $target['thumbDestPath']);

    $record = [
        'id' => bin2hex(random_bytes(6)),
        'originalUrl' => $target['originalUrl'],
        'thumbUrl' => $target['thumbUrl'],
        'originalName' => $originalName,
        'uploadedAt' => date('c'),
        'width' => $dims['width'],
        'height' => $dims['height'],
        'countryCode' => $countryCode,
    ];

    $photos[] = $record;
    $uploaded[] = $record;
}

if (!empty($uploaded) && !save_photos($dataFile, $photos)) {
    json_response([
        'error' => "Fotky se nahrály, ale zápis do $dataFile selhal (zkontrolujte oprávnění složky data/ na hostingu)",
        'uploaded' => [],
        'errors' => $errors,
    ], 500);
}

if (empty($uploaded) && !empty($errors)) {
    json_response(['error' => 'Nahrávání selhalo', 'details' => $errors], 400);
}

json_response(['uploaded' => $uploaded, 'errors' => $errors]);
