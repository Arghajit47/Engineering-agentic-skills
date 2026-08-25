#!/usr/bin/env bash
# Regression matrix for guard.py. Every rule needs a blocking case AND a
# must-not-fire case — a guard with no false-positive tests becomes noisy and
# then gets switched off.
#
#   ./test-guard.sh
set -uo pipefail

# Test runs must never contaminate real telemetry.
export SKILLS_TELEMETRY_OFF=1

GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guard.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/repo" "$TMP/proj/src/app" "$TMP/plain/src/app"
git -C "$TMP/repo" init -q
echo x > "$TMP/repo/a"; git -C "$TMP/repo" add .
git -C "$TMP/repo" -c user.email=t@t -c user.name=t commit -qm init
printf '@theme inline {\n  --breakpoint-laptop: 1440px;\n}\n' > "$TMP/proj/src/app/globals.css"
printf '@import "tailwindcss";\n' > "$TMP/plain/src/app/globals.css"

P=0; F=0
json() { python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$1"; }

bash_case() { # name cmd expect
  local rc got
  printf '{"tool_name":"Bash","tool_input":{"command":%s},"cwd":"%s"}' "$(json "$2")" "$TMP/repo" \
    | python3 "$GUARD" >/dev/null 2>&1; rc=$?
  got=$([ "$rc" -eq 2 ] && echo block || echo allow)
  if [ "$got" = "$3" ]; then P=$((P+1)); printf '  ok   %-46s %s\n' "$1" "$got"
  else F=$((F+1)); printf '  FAIL %-46s got %s want %s\n' "$1" "$got" "$3"; fi
}

edit_case() { # name path content expect
  local rc got
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","new_string":%s}}' "$2" "$(json "$3")" \
    | python3 "$GUARD" >/dev/null 2>&1; rc=$?
  got=$([ "$rc" -eq 2 ] && echo warn || echo silent)
  if [ "$got" = "$4" ]; then P=$((P+1)); printf '  ok   %-46s %s\n' "$1" "$got"
  else F=$((F+1)); printf '  FAIL %-46s got %s want %s\n' "$1" "$got" "$4"; fi
}

on_branch() { git -C "$TMP/repo" checkout -q "$1" 2>/dev/null || git -C "$TMP/repo" checkout -qb "$1"; }

echo "== protected branch =="
on_branch main
bash_case "push implicit from main"       'git push origin'                          block
bash_case "push origin main"              'git push origin main'                     block
bash_case "push -f origin main"           'git push -f origin main'                  block
bash_case "push --force-with-lease main"  'git push --force-with-lease origin main'  block
bash_case "push origin HEAD:main"         'git push origin HEAD:main'                block
bash_case "push origin +main"             'git push origin +main'                    block
bash_case "push origin master"            'git push origin master'                   block
bash_case "commit on main"                'git commit -m x'                          block
bash_case "push a feature branch"         'git push origin feat/x'                   allow
bash_case "push -u origin feat"           'git push -u origin feat'                  allow
bash_case "push origin HEAD:feat"         'git push origin HEAD:feat'                allow
bash_case "push tags"                     'git push --tags origin v1.0.0'            allow
on_branch feat
bash_case "commit on feature"             'git commit -m x'                          allow
bash_case "push current from feature"     'git push origin'                          allow
bash_case "explicit main still blocked"   'git push origin main'                     block
on_branch main

echo "== token separation =="
bash_case "both tokens assigned"          'GITHUB_TOKEN=$A GITHUB_REVIEWER_TOKEN=$B gh pr merge 1'      block
bash_case "both tokens expanded"          'echo $GITHUB_TOKEN; gh api -H "x: $GITHUB_REVIEWER_TOKEN"'   block
bash_case "one token only"                'GITHUB_TOKEN=$A gh pr create'                                allow
bash_case "names in prose only"           'echo "GITHUB_TOKEN vs GITHUB_REVIEWER_TOKEN"'                allow

echo "== gh --body injection =="
bash_case "body with backtick"            'gh pr create --body "see `ls`"'           block
bash_case "body plain"                    'gh pr create --body "plain"'              allow
bash_case "body-file"                     'gh pr create --body-file b.md'            allow

echo "== visual baseline =="
bash_case "playwright -u"                 'npx playwright test -u'                   block
bash_case "playwright --update-snapshots" 'npx playwright test --update-snapshots'   block
bash_case "unrelated -u"                  'npm run build -- -u'                      allow

echo "== documentation must never trip a rule =="
bash_case "heredoc: push main"            'cat > d.md <<EOF
never run git push origin main
EOF'  allow
bash_case "heredoc: both tokens"          'cat > d.md <<EOF
GITHUB_TOKEN and GITHUB_REVIEWER_TOKEN must not mix
EOF'  allow
bash_case "harmless"                      'ls -la'                                   allow

echo "== design-token drift =="
edit_case "raw hex, custom breakpoints"   "$TMP/proj/src/C.tsx"  'style={{color:"#0a2540"}}'                      warn
edit_case "default lg: with custom bps"   "$TMP/proj/src/C.tsx"  '<div className="lg:grid-cols-3" />'             warn
edit_case "tokens + named breakpoints"    "$TMP/proj/src/C.tsx"  '<div className="laptop:grid-cols-3" />'         silent
edit_case "default lg: without custom"    "$TMP/plain/src/C.tsx" '<div className="lg:grid-cols-3" />'             silent
edit_case "globals.css exempt"            "$TMP/proj/src/app/globals.css" '--c: #0a2540;'                         silent
edit_case "test file exempt"              "$TMP/proj/src/C.test.tsx" 'expect(c).toBe("#0a2540")'                   silent
edit_case "non-component file"            "$TMP/proj/scripts/x.ts"   'const c="#0a2540"'                           silent

echo "== fails open =="
for bad in '' 'not json' '{"tool_name":"Bash"}'; do
  printf '%s' "$bad" | python3 "$GUARD" >/dev/null 2>&1
  if [ $? -eq 0 ]; then P=$((P+1)); printf '  ok   %-46s allow\n' "malformed: ${bad:-empty}"
  else F=$((F+1)); printf '  FAIL %-46s blocked\n' "malformed: ${bad:-empty}"; fi
done

echo
printf '%s passed, %s failed\n' "$P" "$F"
[ "$F" -eq 0 ]
