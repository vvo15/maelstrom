<?php
header('Content-Type: text/html; charset=utf-8');
$parcel = htmlspecialchars($_GET['parcel'] ?? '');
$result = null;
if ($parcel !== '') {
    // Fake deterministic results — no DB, no user input in paths
    $seed = crc32($parcel);
    $owners = ['J. Hartwell','M. Okonkwo','P. Leung','S. Fitzpatrick','D. Reyes'];
    $owner = $owners[abs($seed) % count($owners)];
    $assessed = 180000 + (abs($seed) % 320000);
    $tax = round($assessed * 0.01423);
    $result = compact('owner','assessed','tax','parcel');
}
?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Property Tax — Millbrook</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:0 1rem}
h1{color:#2b4a8f} table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:.5rem} th{background:#2b4a8f;color:#fff}
.back{margin-top:1rem;display:block}</style></head>
<body>
<h1>Property Tax Lookup</h1>
<form method="get" action="/property-tax">
  <label for="parcel">Parcel ID:</label>
  <input id="parcel" name="parcel" type="text" placeholder="e.g. 0142-005-001"
         value="<?= $parcel ?>" pattern="[\w\-]+" maxlength="20">
  <button type="submit">Search</button>
</form>
<?php if ($result): ?>
<table style="margin-top:1rem">
  <tr><th>Parcel</th><td><?= htmlspecialchars($result['parcel']) ?></td></tr>
  <tr><th>Owner on Record</th><td><?= htmlspecialchars($result['owner']) ?></td></tr>
  <tr><th>Assessed Value</th><td>$<?= number_format($result['assessed']) ?></td></tr>
  <tr><th>Annual Tax</th><td>$<?= number_format($result['tax']) ?></td></tr>
  <tr><th>Status</th><td>Current</td></tr>
</table>
<?php elseif ($parcel !== ''): ?>
<p>No record found for parcel <strong><?= $parcel ?></strong>.</p>
<?php endif; ?>
<a class="back" href="/">← Back to services</a>
</body></html>
