#!/usr/bin/env bash
# Generate every skill's ADF templates from its Markdown sources.
#
#   ./build.sh
#
# Sources live in  templates/adf/_src/<skill>/<artifact>.adf.md
# Output goes to   <skill>/templates/adf/<artifact>.adf.json
#
# The .json files are the artifacts skills actually post. They are generated, not
# hand-written — edit the .adf.md source and re-run this, or the two drift apart.
# Every output is validated; a template that is not valid ADF is a template that
# fails the API call at the worst possible moment.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS="$(cd "$HERE/../.." && pwd)"
ADF="$SKILLS/scripts/adf.py"
SRC="$HERE/_src"

[ -f "$ADF" ] || { echo "error: $ADF not found" >&2; exit 1; }

built=0; failed=0
for dir in "$SRC"/*/; do
  skill="$(basename "$dir")"
  [ -d "$SKILLS/$skill" ] || { echo "  skip  $skill (no such skill)"; continue; }
  out="$SKILLS/$skill/templates/adf"
  mkdir -p "$out"
  for md in "$dir"*.adf.md; do
    [ -e "$md" ] || continue
    name="$(basename "$md" .adf.md)"
    target="$out/$name.adf.json"
    if python3 "$ADF" --in "$md" --out "$target" >/dev/null 2>&1 \
       && python3 "$ADF" --validate "$target" >/dev/null 2>&1; then
      printf '  ok    %-28s %s.adf.json\n' "$skill" "$name"
      built=$((built + 1))
    else
      printf '  FAIL  %-28s %s\n' "$skill" "$name"
      python3 "$ADF" --in "$md" 2>&1 | head -3 | sed 's/^/          /'
      failed=$((failed + 1))
    fi
  done
done

# ---------------------------------------------------------------------------
# Regenerate the routing index. Templates are strict: a skill must post from
# its own template, never hand-composed ADF. This index is how a skill finds
# the right template at the right time. Generated -- never edit TEMPLATES.md.
# ---------------------------------------------------------------------------
python3 "$HERE/index.py" "$SKILLS" || { echo "  FAIL  routing index" >&2; failed=$((failed + 1)); }

echo
echo "$built templates built, $failed failed"
[ "$failed" -eq 0 ]
