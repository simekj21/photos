<?php
declare(strict_types=1);

$uploadsRoot = __DIR__ . '/../uploads';
$dataFile = __DIR__ . '/../data/photos.json';
$maxFileSize = 15 * 1024 * 1024; // 15 MB
$allowedTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];
$thumbMaxSize = 400;
$fullMaxSize = 1920; // Full HD - delsi strana originalu se zmensi na max tuto hodnotu

function json_response($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function load_photos(string $dataFile): array {
    if (!file_exists($dataFile)) {
        return [];
    }
    $content = file_get_contents($dataFile);
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function save_photos(string $dataFile, array $photos): bool {
    $result = @file_put_contents($dataFile, json_encode($photos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $result !== false;
}

function load_image(string $path, string $mimeType) {
    switch ($mimeType) {
        case 'image/jpeg':
            return @imagecreatefromjpeg($path);
        case 'image/png':
            return @imagecreatefrompng($path);
        case 'image/webp':
            return @imagecreatefromwebp($path);
        case 'image/gif':
            return @imagecreatefromgif($path);
        default:
            return false;
    }
}

function resize_image(string $sourcePath, string $mimeType, int $maxWidth, int $maxHeight, string $destPath, int $quality): bool {
    $src = load_image($sourcePath, $mimeType);
    if (!$src) {
        return false;
    }

    $width = imagesx($src);
    $height = imagesy($src);
    $scale = min(1, $maxWidth / $width, $maxHeight / $height);
    $newWidth = max(1, (int) round($width * $scale));
    $newHeight = max(1, (int) round($height * $scale));

    $resized = imagecreatetruecolor($newWidth, $newHeight);
    if ($mimeType === 'image/png' || $mimeType === 'image/webp') {
        imagealphablending($resized, false);
        imagesavealpha($resized, true);
    } else {
        $white = imagecolorallocate($resized, 255, 255, 255);
        imagefill($resized, 0, 0, $white);
    }
    imagecopyresampled($resized, $src, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

    switch ($mimeType) {
        case 'image/jpeg':
            $ok = imagejpeg($resized, $destPath, $quality);
            break;
        case 'image/webp':
            $ok = imagewebp($resized, $destPath, $quality);
            break;
        case 'image/png':
            $ok = imagepng($resized, $destPath);
            break;
        case 'image/gif':
            $ok = imagegif($resized, $destPath);
            break;
        default:
            $ok = false;
    }

    imagedestroy($src);
    imagedestroy($resized);

    return $ok;
}

function downscale_if_needed(string $path, string $mimeType, int $maxSize): void {
    $size = @getimagesize($path);
    if (!$size) {
        return;
    }
    [$width, $height] = $size;
    if (max($width, $height) <= $maxSize) {
        return;
    }
    resize_image($path, $mimeType, $maxSize, $maxSize, $path, 88);
}

function make_thumbnail(string $sourcePath, string $mimeType, string $destPath, int $maxSize): bool {
    return resize_image($sourcePath, $mimeType, $maxSize, $maxSize, $destPath, 82);
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

    if (!isset($allowedTypes[$mimeType])) {
        $errors[] = "$originalName: nepodporovaný typ souboru";
        continue;
    }

    $extension = $allowedTypes[$mimeType];
    $year = date('Y');
    $month = date('m');
    $uniqueName = bin2hex(random_bytes(8)) . '.' . $extension;

    $originalsDir = "$uploadsRoot/originals/$year/$month";
    $thumbsDir = "$uploadsRoot/thumbs/$year/$month";
    if (!is_dir($originalsDir)) {
        mkdir($originalsDir, 0775, true);
    }
    if (!is_dir($thumbsDir)) {
        mkdir($thumbsDir, 0775, true);
    }

    $originalDestPath = "$originalsDir/$uniqueName";
    $thumbDestPath = "$thumbsDir/$uniqueName";

    if (!move_uploaded_file($tmpPath, $originalDestPath)) {
        $errors[] = "$originalName: uložení se nezdařilo";
        continue;
    }

    downscale_if_needed($originalDestPath, $mimeType, $fullMaxSize);

    if (!make_thumbnail($originalDestPath, $mimeType, $thumbDestPath, $thumbMaxSize)) {
        copy($originalDestPath, $thumbDestPath);
    }

    $imageSize = @getimagesize($originalDestPath);

    $record = [
        'id' => bin2hex(random_bytes(6)),
        'originalUrl' => "uploads/originals/$year/$month/$uniqueName",
        'thumbUrl' => "uploads/thumbs/$year/$month/$uniqueName",
        'originalName' => $originalName,
        'uploadedAt' => date('c'),
        'width' => $imageSize[0] ?? null,
        'height' => $imageSize[1] ?? null,
    ];

    $photos[] = $record;
    $uploaded[] = $record;
}

if (!empty($uploaded)) {
    $dataDir = dirname($dataFile);
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0775, true);
    }
    if (!save_photos($dataFile, $photos)) {
        json_response([
            'error' => "Fotky se nahrály, ale zápis do $dataFile selhal (zkontrolujte oprávnění složky data/ na hostingu)",
            'uploaded' => [],
            'errors' => $errors,
        ], 500);
    }
}

if (empty($uploaded) && !empty($errors)) {
    json_response(['error' => 'Nahrávání selhalo', 'details' => $errors], 400);
}

json_response(['uploaded' => $uploaded, 'errors' => $errors]);
