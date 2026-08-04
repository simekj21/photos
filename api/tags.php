<?php
declare(strict_types=1);

$tagsFile = __DIR__ . '/../data/tags.json';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function json_response($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function load_tags(string $tagsFile): array {
    if (!file_exists($tagsFile)) {
        return [];
    }
    $decoded = json_decode(file_get_contents($tagsFile), true);
    return is_array($decoded) ? $decoded : [];
}

function save_tags(string $tagsFile, array $tags): bool {
    $dir = dirname($tagsFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $result = @file_put_contents($tagsFile, json_encode($tags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $result !== false;
}

function remove_tag_from_photos(string $tagId): void {
    $dataFile = __DIR__ . '/../data/photos.json';
    if (!file_exists($dataFile)) {
        return;
    }
    $photos = json_decode(file_get_contents($dataFile), true);
    if (!is_array($photos)) {
        return;
    }
    foreach ($photos as &$photo) {
        if (!empty($photo['tagIds'])) {
            $photo['tagIds'] = array_values(array_diff($photo['tagIds'], [$tagId]));
        }
    }
    unset($photo);
    @file_put_contents($dataFile, json_encode($photos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    json_response(load_tags($tagsFile));
}

if ($method !== 'POST') {
    json_response(['error' => 'Metoda není povolena'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? 'create';
$tags = load_tags($tagsFile);

if ($action === 'create') {
    $name = trim((string) ($input['name'] ?? ''));
    if ($name === '') {
        json_response(['error' => 'Chybí název tagu'], 400);
    }

    foreach ($tags as $existing) {
        if (mb_strtolower($existing['name']) === mb_strtolower($name)) {
            json_response($existing);
        }
    }

    $tag = ['id' => bin2hex(random_bytes(6)), 'name' => $name];
    $tags[] = $tag;

    if (!save_tags($tagsFile, $tags)) {
        json_response(['error' => 'Uložení tagu selhalo'], 500);
    }
    json_response($tag);
}

if ($action === 'rename') {
    $id = $input['id'] ?? null;
    $name = trim((string) ($input['name'] ?? ''));
    if (!$id || $name === '') {
        json_response(['error' => 'Chybí id nebo název'], 400);
    }

    $found = false;
    foreach ($tags as &$tag) {
        if ($tag['id'] === $id) {
            $tag['name'] = $name;
            $found = true;
            break;
        }
    }
    unset($tag);

    if (!$found) {
        json_response(['error' => 'Tag nenalezen'], 404);
    }
    if (!save_tags($tagsFile, $tags)) {
        json_response(['error' => 'Uložení tagu selhalo'], 500);
    }
    json_response(['id' => $id, 'name' => $name]);
}

if ($action === 'delete') {
    $id = $input['id'] ?? null;
    if (!$id) {
        json_response(['error' => 'Chybí id'], 400);
    }

    $before = count($tags);
    $tags = array_values(array_filter($tags, function ($tag) use ($id) {
        return $tag['id'] !== $id;
    }));

    if (count($tags) === $before) {
        json_response(['error' => 'Tag nenalezen'], 404);
    }
    if (!save_tags($tagsFile, $tags)) {
        json_response(['error' => 'Uložení tagu selhalo'], 500);
    }

    remove_tag_from_photos($id);

    json_response(['deleted' => $id]);
}

json_response(['error' => 'Neznámá akce'], 400);
