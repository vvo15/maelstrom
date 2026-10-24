<?php
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Admin — Millbrook</title>
<style>body{font-family:Georgia,serif;max-width:400px;margin:3rem auto;padding:0 1rem}
h1{color:#2b4a8f} label{display:block;margin-top:.8rem;font-weight:bold}
input{width:100%;padding:.4rem;box-sizing:border-box}</style></head>
<body>
<h1>🔐 Administration</h1>
<p>This area is restricted to town administrators.</p>
<form method="post" action="/admin" autocomplete="off">
  <label for="adminuser">Admin Username</label>
  <input id="adminuser" name="username" type="text" maxlength="64">
  <label for="adminpass">Password</label>
  <input id="adminpass" name="password" type="password" maxlength="128">
  <button type="submit" style="margin-top:1rem">Log in</button>
</form>
<p style="font-size:.8rem;color:#666">All access attempts are logged and audited.</p>
</body></html>
