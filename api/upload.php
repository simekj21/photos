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

function save_photos(string $dataFile, array $photos): void {
    file_put_contents($dataFile, json_encode($photos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function make_thumbnail(string $sourcePath, string $mimeType, string $destPath, int $maxSize): bool {
    switch ($mimeType) {
        case 'image/jpeg':
            $src = @imagecreatefromjpeg($sourcePath);
            break;
        case 'image/png':
            $src = @imagecreatefrompng($sourcePath);
            break;
        case 'image/webp':
            $src = @imagecreatefromwebp($sourcePath);
            break;
        case 'image/gif':
            $src = @imagecreatefromgif($sourcePath);
            break;
        default:
            return false;
    }
    if (!$src) {
        return false;
    }

    $width = imagesx($src);
    $height = imagesy($src);
    $scale = min(1, $maxSize / max($width, $height));
    $thumbWidth = max(1, (int) round($width * $scale));
    $thumbHeight = max(1, (int) round($height * $scale));

    $thumb = imagecreatetruecolor($thumbWidth, $thumbHeight);
    $white = imagecolorallocate($thumb, 255, 255, 255);
    imagefill($thumb, 0, 0, $white);
    imagecopyresampled($thumb, $src, 0, 0, 0, 0, $thumbWidth, $thumbHeight, $width, $height);

    $ok = imagejpeg($thumb, $destPath, 82);

    imagedestroy($src);
    imagedestroy($thumb);

    return $ok;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Metoda není povolena'], 405);
}

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
    save_photos($dataFile, $photos);
}

if (empty($uploaded) && !empty($errors)) {
    json_response(['error' => 'Nahrávání selhalo', 'details' => $errors], 400);
}

json_response(['uploaded' => $uploaded, 'errors' => $errors]);
