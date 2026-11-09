#!/bin/sh
# Runs every test against ../index.html in headless Chrome. No network is needed: the tests fake the public services.
#   cd tests && npm install && npm test          (set CHROME=/path/to/chrome if it isn't /usr/bin/google-chrome)
cd "$(dirname "$0")" || exit 1
fail=0
for t in test_*.mjs; do
  out=$(node "$t" 2>&1)
  if echo "$out" | grep -q "FAIL" || ! echo "$out" | grep -qi "ALL PASSED\|errors: none"; then
    echo "FAILED  $t"; echo "$out" | grep "FAIL" | head -5; fail=1
  else
    echo "ok      $t"
  fi
done
[ "$fail" = 0 ] && echo "All tests passed." || { echo "Some tests failed."; exit 1; }
