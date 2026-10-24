<?php
header('Content-Type: text/html; charset=utf-8');
$num = htmlspecialchars($_GET['permit'] ?? '');
$result = null;
if ($num !== '') {
    $seed = crc32($num);
    $statuses = ['Under Review','Approved','Pending Inspection','Issued','Denied'];
    $types    = ['Residential Fence','Deck Addition','Shed','Driveway Apron','Sign Permit'];
    $result = [
        'permit'  => $num,
        'type'    => $types[abs($seed) % count($types)],
        'status'  => $statuses[abs($seed) % count($statuses)],
        'filed'   => date('Y-m-d', mktime(0,0,0, (abs($seed)%12)+1, (abs($seed)%28)+1, 2025)),
        'inspector' => 'Building Dept.',
    ];
}
?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Permit Status — Millbrook</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:0 1rem}
h1{color:#2b4a8f} table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:.5rem} th{background:#2b4a8f;color:#fff}</style></head>
<body>
<h1>Permit Status Lookup</h1>
<form method="get" action="/permit-status">
  <label for="permit">Permit Number:</label>
  <input id="permit" name="permit" type="text" placeholder="e.g. BLD-2025-0047"
         value="<?= $num ?>" pattern="[\w\-]+" maxlength="20">
  <button type="submit">Search</button>
</form>
<?php if ($result): ?>
<table style="margin-top:1rem">
  <tr><th>Permit #</th><td><?= htmlspecialchars($result['permit']) ?></td></tr>
  <tr><th>Type</th><td><?= htmlspecialchars($result['type']) ?></td></tr>
  <tr><th>Status</th><td><?= htmlspecialchars($result['status']) ?></td></tr>
  <tr><th>Filed</th><td><?= $result['filed'] ?></td></tr>
  <tr><th>Department</th><td><?= $result['inspector'] ?></td></tr>
</table>
<?php elseif ($num !== ''): ?>
<p>No permit found for <strong><?= $num ?></strong>.</p>
<?php endif; ?>
<a href="/">← Back</a>
</body></html>
