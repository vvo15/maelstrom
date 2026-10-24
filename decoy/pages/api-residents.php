<?php
header('Content-Type: application/json');
http_response_code(403);
echo json_encode([
    'error'   => 'Forbidden',
    'message' => 'Resident records require staff authentication.',
    'hint'    => 'Authenticate at /staff/login to obtain a session token, then present it as Authorization: Bearer <token>.',
]);
