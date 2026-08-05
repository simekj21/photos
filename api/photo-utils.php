<?php
declare(strict_types=1);

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];

const THUMB_MAX_SIZE = 400;
const FULL_MAX_SIZE = 1920; // Full HD - delsi strana originalu se zmensi na max tuto hodnotu

function load_photos(string $dataFile): array {
    if (!file_exists($dataFile)) {
        return [];
    }
    $content = file_get_contents($dataFile);
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function save_photos(string $dataFile, array $photos): bool {
    $dataDir = dirname($dataFile);
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0775, true);
    }
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

function make_upload_target(string $uploadsRoot, string $extension): array {
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

    return [
        'originalDestPath' => "$originalsDir/$uniqueName",
        'thumbDestPath' => "$thumbsDir/$uniqueName",
        'originalUrl' => "uploads/originals/$year/$month/$uniqueName",
        'thumbUrl' => "uploads/thumbs/$year/$month/$uniqueName",
    ];
}

function finalize_uploaded_image(string $originalDestPath, string $mimeType, string $thumbDestPath): array {
    downscale_if_needed($originalDestPath, $mimeType, FULL_MAX_SIZE);

    if (!make_thumbnail($originalDestPath, $mimeType, $thumbDestPath, THUMB_MAX_SIZE)) {
        copy($originalDestPath, $thumbDestPath);
    }

    $imageSize = @getimagesize($originalDestPath);

    return [
        'width' => $imageSize[0] ?? null,
        'height' => $imageSize[1] ?? null,
    ];
}
