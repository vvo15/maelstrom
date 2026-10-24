<?php
header('Content-Type: text/plain');
echo "User-agent: *\n";
echo "Disallow: /backup/\n";
echo "Disallow: /staff/\n";
echo "Disallow: /api/v1/internal/\n";
echo "\n";
echo "# This file is publicly readable. It does not grant access to listed paths.\n";
