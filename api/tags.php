<?php
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = db()->query('SELECT id, name, category FROM tags ORDER BY category, name');
    json_response($stmt->fetchAll());
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }
    $action = $input['action'] ?? 'create';

    if ($action === 'create') {
        $name = trim($input['name'] ?? '');
        $category = $input['category'] ?? 'vlastni';
        if ($name === '') {
            json_response(['error' => 'Name is required'], 400);
        }
        $stmt = db()->prepare('INSERT INTO tags (name, category) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)');
        $stmt->execute([$name, $category]);
        json_response(['id' => db()->lastInsertId(), 'name' => $name, 'category' => $category]);
    }

    if ($action === 'assign') {
        $photoId = (int)($input['photo_id'] ?? 0);
        $tagId = (int)($input['tag_id'] ?? 0);
        if (!$photoId || !$tagId) {
            json_response(['error' => 'photo_id and tag_id are required'], 400);
        }
        $stmt = db()->prepare('INSERT IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)');
        $stmt->execute([$photoId, $tagId]);
        json_response(['ok' => true]);
    }

    if ($action === 'unassign') {
        $photoId = (int)($input['photo_id'] ?? 0);
        $tagId = (int)($input['tag_id'] ?? 0);
        $stmt = db()->prepare('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?');
        $stmt->execute([$photoId, $tagId]);
        json_response(['ok' => true]);
    }

    json_response(['error' => 'Unknown action'], 400);
}

json_response(['error' => 'Method not allowed'], 405);
