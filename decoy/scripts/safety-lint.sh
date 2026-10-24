#!/usr/bin/env bash
# bait-safety-lint — called by the Kiro hook on every save under decoy/
# Exits non-zero and prints the offending file:line for any violation.
# Compatible with macOS BSD grep and GNU grep (no -P flag).
set -uo pipefail

DECOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

# ── 1. Dangerous PHP functions ──────────────────────────────────────────────
DANGEROUS='(exec|system|shell_exec|passthru|popen|proc_open|eval)[[:space:]]*\('
while IFS= read -r -d '' file; do
  while IFS= read -r match; do
    echo "FAIL [dangerous-function] $match"
    FAILED=1
  done < <(grep -nE "$DANGEROUS" "$file" 2>/dev/null | awk -v f="$file" '{print f ":" $0}')
done < <(find "$DECOY_DIR" -name "*.php" -print0)

# ── 2. Credentials not starting with SIREN_ ─────────────────────────────────
# Match KEY=, SECRET=, PASS=, TOKEN= where the value does NOT start with SIREN_
CRED_PATTERN='(KEY|SECRET|PASS|TOKEN)[[:space:]]*[=:][[:space:]]*[^$\n]'
while IFS= read -r -d '' file; do
  while IFS= read -r line_content; do
    # extract just the value portion and check it doesn't start with SIREN_
    value=$(echo "$line_content" | sed -E "s/.*[=:][[:space:]]*//" | tr -d "'\"")
    if [[ "$value" != SIREN_* ]] && [[ -n "$value" ]] && [[ "$value" != \$* ]] && [[ "$value" != \#* ]]; then
      echo "FAIL [bare-credential] $file: $line_content"
      FAILED=1
    fi
  done < <(grep -nE "$CRED_PATTERN" "$file" 2>/dev/null | grep -v "SIREN_" | grep -v "^[[:space:]]*#")
done < <(find "$DECOY_DIR" -type f \( -name "*.php" -o -name "*.txt" -o -name ".env*" \) -print0)

# ── 3. Real secret formats ───────────────────────────────────────────────────
REAL_SECRETS='(AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{36}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'
while IFS= read -r -d '' file; do
  while IFS= read -r match; do
    echo "FAIL [real-secret-format] $file: $match"
    FAILED=1
  done < <(grep -nE "$REAL_SECRETS" "$file" 2>/dev/null)
done < <(find "$DECOY_DIR" -type f -print0)

if [ "$FAILED" -eq 0 ]; then
  echo "OK safety-lint passed"
fi

exit "$FAILED"
