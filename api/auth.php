<?php
declare(strict_types=1);

require __DIR__ . '/auth-guard.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metoda není povolena']);
    exit;
}

$config = load_admin_config();
if (!$config) {
    http_response_code(500);
    echo json_encode(['error' => 'Admin není nakonfigurován']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$pin = (string) ($input['pin'] ?? '');

$pinHash = hash('sha256', $pin . ':' . $config['secret']);

if (!hash_equals($config['pinHash'], $pinHash)) {
    http_response_code(401);
    echo json_encode(['error' => 'Nesprávný PIN']);
    exit;
}

echo json_encode(['token' => admin_expected_token($config)]);
