<?php
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = db()->query(
        'SELECT t.id, t.name, t.description, t.date_from, t.date_to, t.country_id,
                c.name AS country_name, t.cover_photo_id,
                p.thumb_filename AS cover_thumb
         FROM trips t
         LEFT JOIN countries c ON c.id = t.country_id
         LEFT JOIN photos p ON p.id = t.cover_photo_id
         ORDER BY COALESCE(t.date_from, t.created_at) DESC'
    );
    $trips = $stmt->fetchAll();
    foreach ($trips as &$trip) {
        $trip['cover_url'] = $trip['cover_thumb'] ? UPLOAD_URL . '/thumbs/' . $trip['cover_thumb'] : null;
    }
    unset($trip);
    json_response($trips);
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }
    $name = trim($input['name'] ?? '');
    if ($name === '') {
        json_response(['error' => 'Name is required'], 400);
    }
    $stmt = db()->prepare(
        'INSERT INTO trips (name, description, date_from, date_to, country_id)
         VALUES (:name, :description, :date_from, :date_to, :country_id)'
    );
    $stmt->execute([
        'name' => $name,
        'description' => $input['description'] ?? null,
        'date_from' => $input['date_from'] ?? null,
        'date_to' => $input['date_to'] ?? null,
        'country_id' => !empty($input['country_id']) ? (int)$input['country_id'] : null,
    ]);
    json_response(['id' => db()->lastInsertId()]);
}

json_response(['error' => 'Method not allowed'], 405);
