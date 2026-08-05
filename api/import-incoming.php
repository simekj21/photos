<?php
declare(strict_types=1);

$actionsRoot = __DIR__ . '/../actions';
$uploadsRoot = __DIR__ . '/../uploads';
$dataFile = __DIR__ . '/../data/photos.json';
$eventsFile = __DIR__ . '/../data/events.json';

require __DIR__ . '/auth-guard.php';
require __DIR__ . '/photo-utils.php';

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

function load_events_list(string $eventsFile): array {
    if (!file_exists($eventsFile)) {
        return [];
    }
    $decoded = json_decode(file_get_contents($eventsFile), true);
    return is_array($decoded) ? $decoded : [];
}

function save_events_list(string $eventsFile, array $events): bool {
    $dir = dirname($eventsFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $result = @file_put_contents($eventsFile, json_encode($events, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $result !== false;
}

$input = json_decode(file_get_contents('php://input'), true);
$folder = (string) ($input['folder'] ?? '');
$eventMode = $input['eventMode'] ?? 'none';

if ($folder === '' || basename($folder) !== $folder || $folder === '.' || $folder === '..') {
    json_response(['error' => 'Neplatný název složky'], 400);
}

$sourceDir = "$actionsRoot/$folder";
$realActionsRoot = realpath($actionsRoot);
$realSourceDir = realpath($sourceDir);

if (!$realActionsRoot || !$realSourceDir || strpos($realSourceDir, $realActionsRoot . DIRECTORY_SEPARATOR) !== 0 || !is_dir($realSourceDir)) {
    json_response(['error' => 'Složka nenalezena'], 404);
}

$events = load_events_list($eventsFile);
$eventId = null;

if ($eventMode === 'new') {
    $eventName = trim((string) ($input['eventName'] ?? ''));
    $eventStartDate = trim((string) ($input['eventStartDate'] ?? ''));
    if ($eventName === '' || !DateTime::createFromFormat('Y-m-d', $eventStartDate)) {
        json_response(['error' => 'Chybí název nebo datum nové akce'], 400);
    }
    $eventId = bin2hex(random_bytes(6));
    $events[] = [
        'id' => $eventId,
        'name' => $eventName,
        'location' => '',
        'description' => '',
        'participants' => '',
        'startDate' => $eventStartDate,
        'endDate' => null,
    ];
    if (!save_events_list($eventsFile, $events)) {
        json_response(['error' => 'Uložení akce selhalo'], 500);
    }
} elseif ($eventMode === 'existing') {
    $eventId = (string) ($input['eventId'] ?? '');
    $found = false;
    foreach ($events as $evt) {
        if ($evt['id'] === $eventId) {
            $found = true;
            break;
        }
    }
    if ($eventId === '' || !$found) {
        json_response(['error' => 'Akce nenalezena'], 404);
    }
}

$photos = load_photos($dataFile);
$imported = [];
$skipped = [];

foreach (scandir($realSourceDir) ?: [] as $entry) {
    if ($entry === '.' || $entry === '..' || $entry[0] === '.') {
        continue;
    }
    $sourcePath = "$realSourceDir/$entry";
    if (!is_file($sourcePath)) {
        continue;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $sourcePath);
    finfo_close($finfo);

    if (!isset(ALLOWED_IMAGE_TYPES[$mimeType])) {
        $skipped[] = "$entry: nepodporovaný typ souboru";
        continue;
    }

    $target = make_upload_target($uploadsRoot, ALLOWED_IMAGE_TYPES[$mimeType]);

    if (!@rename($sourcePath, $target['originalDestPath'])) {
        if (!@copy($sourcePath, $target['originalDestPath'])) {
            $skipped[] = "$entry: přesun se nezdařil";
            continue;
        }
        @unlink($sourcePath);
    }

    $dims = finalize_uploaded_image($target['originalDestPath'], $mimeType, $target['thumbDestPath']);

    $record = [
        'id' => bin2hex(random_bytes(6)),
        'originalUrl' => $target['originalUrl'],
        'thumbUrl' => $target['thumbUrl'],
        'originalName' => $entry,
        'uploadedAt' => date('c'),
        'width' => $dims['width'],
        'height' => $dims['height'],
        'eventId' => $eventId,
    ];

    $photos[] = $record;
    $imported[] = $record;
}

if (!empty($imported) && !save_photos($dataFile, $photos)) {
    json_response(['error' => "Fotky se importovaly, ale zápis do $dataFile selhal"], 500);
}

$remaining = array_filter((scandir($realSourceDir) ?: []), function ($entry) {
    return $entry !== '.' && $entry !== '..' && $entry[0] !== '.';
});

if (empty($remaining)) {
    @rmdir($realSourceDir);
}

json_response(['imported' => count($imported), 'skipped' => $skipped, 'eventId' => $eventId]);
