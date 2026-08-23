#!/usr/bin/env bash
# Generate the Hermes-format tree in this bundle from the canonical Claude Code skills.
# Hermes uses the same layout (<category>/<skill>/SKILL.md + references/) but different
# directory names for three skills, so those are mapped on export.
#
# Called automatically by sync-skills.sh. Run standalone with: ./export-hermes.sh
set -euo pipefail

BUNDLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$BUNDLE/claude-code/skills"
DEST="$BUNDLE/hermes/skills/productivity"

[ -d "$SRC" ] || { echo "error: run sync-skills.sh first — no $SRC" >&2; exit 1; }

# Claude Code dir -> Hermes dir. Anything not listed keeps its name.
hermes_name() {
  case "$1" in
    ba)                  echo "business-analyst-workflow" ;;
    qa)                  echo "quality-analyst" ;;
    pr-review-and-merge) echo "mr-code-review" ;;
    *)                   echo "$1" ;;
  esac
}

echo "==> Exporting Hermes tree -> $DEST"
rm -rf "$BUNDLE/hermes"
mkdir -p "$DEST"

n=0
for d in "$SRC"/*/; do
  [ -f "$d/SKILL.md" ] || continue
  src_name=$(basename "$d")
  dst_name=$(hermes_name "$src_name")
  rsync -a --copy-links \
    --exclude '.DS_Store' --exclude '__pycache__' --exclude '*.pyc' \
    --exclude '*.local.md' \
    "$d" "$DEST/$dst_name/"
  [ "$src_name" != "$dst_name" ] && echo "    $src_name -> $dst_name" || echo "    $dst_name"
  n=$((n+1))
done

# Shared docs, as real files (Hermes may be installed without the Claude tree)
cp "$SRC/PIPELINE.md"       "$DEST/PIPELINE.md"
cp "$SRC/PROJECT-CONFIG.md" "$DEST/PROJECT-CONFIG.md"

cat > "$DEST/DESCRIPTION.md" <<'DESC'
---
description: Full engineering pipeline — plan, architect, spec, test, build, review, secure, release, verify, watch, document, improve.
---

Generated from the canonical Claude Code skills by `export-hermes.sh`. Do not edit here;
edit `~/.claude/skills/<skill>/SKILL.md` and re-run `sync-skills.sh`.

Three skills carry Hermes names: `business-analyst-workflow` (Claude: `ba`),
`quality-analyst` (`qa`), `mr-code-review` (`pr-review-and-merge`).

Start with `PIPELINE.md`. Configuration is `{{PLACEHOLDER}}`-based — see `PROJECT-CONFIG.md`.
DESC

echo "==> Done. $n skills exported in Hermes layout."
