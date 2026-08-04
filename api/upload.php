<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed'], 405);
}

if (empty($_FILES['photos'])) {
    json_response(['error' => 'No files uploaded'], 400);
}

$tripId = !empty($_POST['trip_id']) ? (int)$_POST['trip_id'] : null;
$tagIds = [];
if (!empty($_POST['tag_ids'])) {
    $tagIds = array_map('intval', explode(',', $_POST['tag_ids']));
}

$allowedTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$year = date('Y');
$month = date('m');
$origDir = UPLOAD_DIR . "/originals/$year/$month";
$thumbDir = UPLOAD_DIR . "/thumbs/$year/$month";
if (!is_dir($origDir)) mkdir($origDir, 0755, true);
if (!is_dir($thumbDir)) mkdir($thumbDir, 0755, true);

$results = [];
$fileCount = count($_FILES['photos']['name']);

for ($i = 0; $i < $fileCount; $i++) {
    if ($_FILES['photos']['error'][$i] !== UPLOAD_ERR_OK) {
        continue;
    }
    $tmpPath = $_FILES['photos']['tmp_name'][$i];
    $mime = mime_content_type($tmpPath);
    if (!isset($allowedTypes[$mime])) {
        continue;
    }
    $ext = $allowedTypes[$mime];
    $uniqueName = uniqid('photo_', true) . '.' . $ext;
    $relPath = "$year/$month/$uniqueName";
    $destPath = "$origDir/$uniqueName";

    if (!move_uploaded_file($tmpPath, $destPath)) {
        continue;
    }

    [$width, $height] = getimagesize($destPath);
    [$takenAt, $lat, $lng] = extract_exif($destPath, $mime);

    $thumbName = $uniqueName;
    $thumbPath = "$thumbDir/$thumbName";
    create_thumbnail($destPath, $thumbPath, $mime, THUMB_MAX_SIZE);

    $stmt = db()->prepare(
        'INSERT INTO photos (filename, thumb_filename, original_name, taken_at, width, height, gps_lat, gps_lng, trip_id)
         VALUES (:filename, :thumb_filename, :original_name, :taken_at, :width, :height, :lat, :lng, :trip_id)'
    );
    $stmt->execute([
        'filename' => $relPath,
        'thumb_filename' => "$year/$month/$thumbName",
        'original_name' => $_FILES['photos']['name'][$i],
        'taken_at' => $takenAt,
        'width' => $width,
        'height' => $height,
        'lat' => $lat,
        'lng' => $lng,
        'trip_id' => $tripId,
    ]);
    $photoId = db()->lastInsertId();

    foreach ($tagIds as $tagId) {
        $tagStmt = db()->prepare('INSERT IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)');
        $tagStmt->execute([$photoId, $tagId]);
    }

    $results[] = ['id' => $photoId, 'filename' => $relPath];
}

json_response(['uploaded' => $results]);

function extract_exif(string $path, string $mime): array {
    if ($mime !== 'image/jpeg' || !function_exists('exif_read_data')) {
        return [null, null, null];
    }
    $exif = @exif_read_data($path);
    if (!$exif) {
        return [null, null, null];
    }
    $takenAt = $exif['DateTimeOriginal'] ?? $exif['DateTime'] ?? null;
    if ($takenAt) {
        $takenAt = str_replace(':', '-', substr($takenAt, 0, 10)) . substr($takenAt, 10);
    }
    $lat = $lng = null;
    if (!empty($exif['GPSLatitude']) && !empty($exif['GPSLongitude'])) {
        $lat = gps_to_decimal($exif['GPSLatitude'], $exif['GPSLatitudeRef'] ?? 'N');
        $lng = gps_to_decimal($exif['GPSLongitude'], $exif['GPSLongitudeRef'] ?? 'E');
    }
    return [$takenAt, $lat, $lng];
}

function gps_to_decimal(array $coord, string $ref): float {
    $parts = array_map(function ($v) {
        $bits = explode('/', $v . '/1');
        $num = (float)$bits[0];
        $den = (float)$bits[1];
        return $den != 0 ? $num / $den : 0;
    }, $coord);
    $decimal = $parts[0] + ($parts[1] / 60) + ($parts[2] / 3600);
    return in_array($ref, ['S', 'W']) ? -$decimal : $decimal;
}

function create_thumbnail(string $src, string $dest, string $mime, int $maxSize): void {
    if ($mime === 'image/jpeg') {
        $image = imagecreatefromjpeg($src);
    } elseif ($mime === 'image/png') {
        $image = imagecreatefrompng($src);
    } elseif ($mime === 'image/webp') {
        $image = imagecreatefromwebp($src);
    } else {
        return;
    }
    if (!$image) return;

    $width = imagesx($image);
    $height = imagesy($image);
    $ratio = min($maxSize / $width, $maxSize / $height, 1);
    $newWidth = (int)($width * $ratio);
    $newHeight = (int)($height * $ratio);

    $thumb = imagecreatetruecolor($newWidth, $newHeight);
    imagecopyresampled($thumb, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
    imagejpeg($thumb, $dest, 82);

    imagedestroy($image);
    imagedestroy($thumb);
}
