<?php
require __DIR__ . '/config.php';

$tripId = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : null;
$tagId  = isset($_GET['tag_id']) ? (int)$_GET['tag_id'] : null;

$sql = "SELECT p.id, p.filename, p.thumb_filename, p.taken_at, p.uploaded_at,
               p.width, p.height, p.gps_lat, p.gps_lng, p.trip_id
        FROM photos p";
$params = [];

if ($tagId) {
    $sql .= " INNER JOIN photo_tags pt ON pt.photo_id = p.id AND pt.tag_id = :tag_id";
    $params['tag_id'] = $tagId;
}

$where = [];
if ($tripId) {
    $where[] = 'p.trip_id = :trip_id';
    $params['trip_id'] = $tripId;
}
if ($where) {
    $sql .= ' WHERE ' . implode(' AND ', $where);
}
$sql .= ' ORDER BY COALESCE(p.taken_at, p.uploaded_at) DESC';

$stmt = db()->prepare($sql);
$stmt->execute($params);
$photos = $stmt->fetchAll();

if ($photos) {
    $ids = array_column($photos, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $tagStmt = db()->prepare(
        "SELECT pt.photo_id, t.id, t.name, t.category
         FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
         WHERE pt.photo_id IN ($placeholders)"
    );
    $tagStmt->execute($ids);
    $tagsByPhoto = [];
    foreach ($tagStmt->fetchAll() as $row) {
        $tagsByPhoto[$row['photo_id']][] = ['id' => $row['id'], 'name' => $row['name'], 'category' => $row['category']];
    }
    foreach ($photos as &$photo) {
        $photo['url'] = UPLOAD_URL . '/originals/' . $photo['filename'];
        $photo['thumb_url'] = UPLOAD_URL . '/thumbs/' . $photo['thumb_filename'];
        $photo['tags'] = $tagsByPhoto[$photo['id']] ?? [];
    }
    unset($photo);
}

json_response($photos);
