<?php
header('Content-Type: text/html; charset=utf-8');
// Staff portal landing page — reachable after /verify redirects here
$sessionId = $_SERVER['HTTP_X_SIREN_SESSION'] ?? 'local000000000000';
?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Staff Portal — Millbrook</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:0 1rem}
h1{color:#2b4a8f} .card{background:#fff;border:1px solid #ccc;padding:1rem;margin:.8rem 0;border-radius:4px}
a{color:#2b4a8f}</style></head>
<body>
<h1>🔒 Millbrook Staff Portal</h1>
<p>Welcome. Select a section below.</p>
<div class="card"><a href="/staff/auditor-register">📋 Auditor Registration</a> — Register an authorized security review</div>
<div class="card"><a href="/api/v1/internal/residents">👥 Resident Records API</a> — Internal data access (restricted)</div>
<div class="card"><span style="color:#999">📁 Document Management</span> — Coming soon</div>
<div class="card"><span style="color:#999">💰 Finance Module</span> — Coming soon</div>
<a href="/">← Public portal</a>
</body></html>
