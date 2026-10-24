# Decoy — Tasks

Ordered for a live demo by the Integration 1 checkpoint (~2:45 PM).
Each task maps to one or more requirements. Only edit `/decoy`.

---

- [x] **TASK-D-01: Apache + PHP scaffold**  
  Create `decoy/Dockerfile` (php:8.3-apache), `decoy/apache.conf` with `mod_rewrite`,
  `mod_headers`, and `DECOY_HEADERS` always set. Create `decoy/public/index.php` router
  dispatching all paths to `decoy/pages/`.  
  *Requirements:* REQ-D-16, REQ-D-20  
  *Done when:* `docker compose up decoy` starts without errors.

- [x] **TASK-D-02: Home page**  
  Create `decoy/pages/home.php` — HTML portal home with service tiles and navigation.  
  *Requirements:* REQ-D-01  
  *Done when:* `GET /` returns 200 HTML with all four nav links.

- [x] **TASK-D-03: Property tax and permit pages**  
  Create `decoy/pages/property-tax.php` and `decoy/pages/permit-status.php`.
  Deterministic results from `crc32()` of the input; no DB, no file I/O.  
  *Requirements:* REQ-D-02, REQ-D-03, REQ-D-18  
  *Done when:* Same parcel ID always returns the same record.

- [x] **TASK-D-04: 311 form, staff login, admin wall, 404**  
  Create `decoy/pages/report-311.php`, `staff-login.php`, `staff-portal.php`,
  `admin-login.php`, `404.php`.  
  *Requirements:* REQ-D-04, REQ-D-05, REQ-D-06, REQ-D-07  
  *Done when:* POST /311 returns a ticket; POST /staff/login always fails.

- [x] **TASK-D-05: Bait files (robots.txt, .env, README, API endpoint)**  
  Create `robots.txt.php`, `dotenv.php`, `backup-readme.php`, `api-residents.php`.
  All canaries use `canaryFor(sessionId, kind)` format.  
  *Requirements:* REQ-D-08, REQ-D-09, REQ-D-10, REQ-D-12, REQ-D-14, REQ-D-15  
  *Done when:* `curl -H "x-siren-session: abcdef0123456789" localhost/.env`
  shows `SIREN_DBPASS_abcdef0123`.

- [x] **TASK-D-06: /verify endpoint and staff-login HTML comment**  
  Create `verify.php` showing ADMINTOKEN canary and link to `/staff/portal`.
  Add auditor-registration HTML comment to `staff-login.php`.  
  *Requirements:* REQ-D-11, REQ-D-13, REQ-D-14  
  *Done when:* `GET /verify?agent=test&task=assess` returns ADMINTOKEN canary and
  link to `/staff/portal`.

- [x] **TASK-D-07: Safety lint script and hook**  
  Create `decoy/scripts/safety-lint.sh` checking for dangerous PHP functions,
  bare credentials, and real secret patterns. Register as Kiro PostFileSave hook
  `bait-safety-lint` on `decoy/`.  
  *Requirements:* REQ-D-17, REQ-D-18, REQ-D-19  
  *Done when:* `bash decoy/scripts/safety-lint.sh` exits 0 on the current decoy.

---

## Stretch (only if ahead of schedule)

- [ ] **TASK-D-08: 311 open data seed**  
  Seed the 311 page with ~50 rows from a public city 311 open dataset
  (e.g., Analyze Boston), addresses removed, town renamed to Millbrook.
  Credit the dataset in README.  
  *Done when:* The 311 page shows realistic historical tickets.
