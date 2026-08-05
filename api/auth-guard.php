<?php
declare(strict_types=1);

function load_admin_config(): ?array {
    $path = __DIR__ . '/config.php';
    if (!file_exists($path)) {
        return null;
    }
    $config = include $path;
    return is_array($config) ? $config : null;
}

function admin_expected_token(array $config): string {
    return hash('sha256', 'admin-token:' . $config['secret']);
}

function admin_request_token(): string {
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'X-Admin-Token') === 0) {
                return $value;
            }
        }
    }
    return $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
}

function require_admin(): void {
    $config = load_admin_config();
    if (!$config) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Admin není nakonfigurován']);
        exit;
    }

    $token = admin_request_token();
    if ($token === '' || !hash_equals(admin_expected_token($config), $token)) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Neautorizováno']);
        exit;
    }
}
