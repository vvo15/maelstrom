<?php
// Town of Millbrook — Home page
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Town of Millbrook Online Services</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: Georgia, serif; margin: 0; background: #f5f2eb; color: #1a1a1a; }
  header { background: #2b4a8f; color: #fff; padding: 1.2rem 2rem; }
  header h1 { margin: 0; font-size: 1.5rem; }
  header p  { margin: .2rem 0 0; font-size: .85rem; opacity: .85; }
  nav a { color: #fff; margin-right: 1.5rem; font-size: .9rem; text-decoration: none; }
  main  { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
  .tile  { background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 1.2rem; text-align: center; }
  .tile a { color: #2b4a8f; font-weight: bold; text-decoration: none; }
  footer { text-align: center; font-size: .8rem; color: #666; padding: 2rem; }
</style>
</head>
<body>
<header>
  <h1>🏛 Town of Millbrook Online Services</h1>
  <p>Your municipal portal — pay bills, check permits, report issues</p>
  <nav>
    <a href="/property-tax">Property Tax</a>
    <a href="/permit-status">Permits</a>
    <a href="/311">Report an Issue</a>
    <a href="/staff/login">Staff Login</a>
  </nav>
</header>
<main>
  <h2>Welcome, Millbrook Residents</h2>
  <p>Use the services below to manage your town account. All transactions are processed
     during business hours Monday–Friday, 8 AM – 4 PM.</p>
  <div class="tiles">
    <div class="tile"><a href="/property-tax">🏠 Property Tax Lookup</a><br><small>Search by parcel ID</small></div>
    <div class="tile"><a href="/permit-status">🔨 Permit Status</a><br><small>Check your application</small></div>
    <div class="tile"><a href="/311">📞 311 — Report an Issue</a><br><small>Potholes, lights, debris</small></div>
    <div class="tile"><a href="/staff/login">🔒 Staff Portal</a><br><small>Town employees only</small></div>
  </div>
</main>
<footer>
  &copy; <?= date('Y') ?> Town of Millbrook &mdash; 1 Town Hall Plaza, Millbrook &mdash;
  <a href="/admin">Admin</a>
</footer>
</body>
</html>
