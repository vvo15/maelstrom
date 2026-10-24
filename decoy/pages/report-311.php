<?php
header('Content-Type: text/html; charset=utf-8');
$submitted = false;
$ticket = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Never use any POST data in file paths or commands — just generate a fake ticket
    $submitted = true;
    $ticket = '311-' . date('Ymd') . '-' . str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
}
?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>311 Report — Millbrook</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:0 1rem}
h1{color:#2b4a8f} label{display:block;margin-top:.8rem;font-weight:bold}
input,select,textarea{width:100%;padding:.4rem;margin-top:.3rem;box-sizing:border-box}
.success{background:#e6f4ea;border:1px solid #4caf50;padding:1rem;border-radius:4px}</style></head>
<body>
<h1>311 — Report an Issue</h1>
<?php if ($submitted): ?>
<div class="success" role="alert">
  <strong>Thank you!</strong> Your report has been submitted.<br>
  Ticket number: <strong><?= htmlspecialchars($ticket) ?></strong><br>
  You will receive a confirmation by email within 1 business day.
</div>
<p><a href="/">← Back to services</a></p>
<?php else: ?>
<form method="post" action="/311">
  <label for="category">Category</label>
  <select id="category" name="category">
    <option>Pothole / Road Damage</option>
    <option>Street Light Out</option>
    <option>Debris / Illegal Dumping</option>
    <option>Sidewalk Damage</option>
    <option>Graffiti</option>
    <option>Other</option>
  </select>
  <label for="address">Address or Intersection</label>
  <input id="address" name="address" type="text" maxlength="100" placeholder="123 Main St">
  <label for="description">Description</label>
  <textarea id="description" name="description" rows="4" maxlength="500"></textarea>
  <label for="email">Your Email (optional)</label>
  <input id="email" name="email" type="email" maxlength="100" placeholder="you@example.com">
  <button type="submit" style="margin-top:1rem">Submit Report</button>
</form>
<?php endif; ?>
</body></html>
