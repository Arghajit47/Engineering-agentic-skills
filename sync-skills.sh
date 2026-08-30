#!/usr/bin/env bash
# Mirror ~/.claude/skills into this bundle so the folder can be handed to anyone.
# Re-run after any skill edit. Review `git diff` before committing — this artifact
# is what other people install.
set -euo pipefail

SRC="${CLAUDE_SKILLS_SRC:-$HOME/.claude/skills}"
BUNDLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$BUNDLE/claude-code/skills"

[ -d "$SRC" ] || { echo "error: no skills at $SRC" >&2; exit 1; }

echo "==> Secret scan on $SRC"
if grep -rIlE '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY)' "$SRC" 2>/dev/null; then
  echo "REFUSING TO SYNC: literal credential found above. Remove it first." >&2
  exit 1
fi
echo "    clean"

echo "==> Structure checks on $SRC"
# A reference file no SKILL.md points at is invisible to the agent that needs it.
# 39 of 113 had drifted that way before this guard existed.
python3 "$SRC/scripts/refindex.py" --check || {
  echo "REFUSING TO SYNC: reference index is stale." >&2; exit 1; }

# Templates are strict: every posting skill routes through templates/TEMPLATES.md.
[ -f "$SRC/templates/TEMPLATES.md" ] || {
  echo "REFUSING TO SYNC: templates/TEMPLATES.md missing — run templates/adf/build.sh" >&2; exit 1; }
for md in "$SRC"/*/templates/adf/*.adf.json; do
  [ -e "$md" ] || continue
  name="$(basename "$md")"; skill="$(basename "$(dirname "$(dirname "$(dirname "$md")")")")"
  grep -q "$skill/templates/adf/$name" "$SRC/templates/TEMPLATES.md" \
    || [ "$name" = "comment.adf.json" ] \
    || { echo "REFUSING TO SYNC: $skill/$name is not routed in templates/TEMPLATES.md." >&2
         echo "Add a row to templates/adf/_src/_routing.tsv and re-run templates/adf/build.sh." >&2; exit 1; }
done

# Figma extraction is Local AI Bridge only. figma-extractor is RETIRED: the token
# may appear only in the two skills whose job is to forbid it. A file allowlist is
# used deliberately instead of matching prohibition keywords on the line -- a line
# can carry both a prohibition word and a usable recipe, which slips a keyword filter.
FIGMA_OK='^(ba/SKILL\.md|local-ai-bridge/SKILL\.md|local-ai-bridge/references/operational-gotchas\.md)$'
BADFIG=$(cd "$SRC" && grep -RIl --include='*.md' -i 'figma-extractor' . 2>/dev/null \
  | sed 's|^\./||' | grep -vE "$FIGMA_OK" || true)
if [ -n "$BADFIG" ]; then
  echo "REFUSING TO SYNC: figma-extractor named outside the skills that forbid it:" >&2
  echo "$BADFIG" | head -5 >&2
  echo "Figma extraction is Local AI Bridge only; remove the mention." >&2
  exit 1
fi
echo "    reference index current, templates routed, no figma-extractor recipes"

echo "==> Mirroring $SRC -> $DEST"
mkdir -p "$DEST"
rsync -a --copy-links --delete \
  --exclude '.DS_Store' --exclude '__pycache__' --exclude '*.pyc' \
  --exclude 'project-config.local.md' --exclude '*.local.md' \
  --exclude 'events.jsonl*' --exclude 'DISABLED' \
  "$SRC"/ "$DEST"/

# PIPELINE.md lives at both the bundle root and inside skills/ so it is found either way.
[ -f "$DEST/PIPELINE.md" ] && cp "$DEST/PIPELINE.md" "$BUNDLE/PIPELINE.md"

"$BUNDLE/export-hermes.sh"

echo "==> De-identification check on the bundle"
# PROJECT-CONFIG.md is exempt: its whole purpose is to SHOW what these values look like.
LEAK=$(grep -RnE '[0-9]{6}:[0-9a-f]{8}-|[a-z0-9-]+\.atlassian\.net|[a-z0-9-]+\.netlify\.app/|customfield_1[0-9]{4}' \
  "$BUNDLE" --exclude-dir=.git 2>/dev/null \
  | grep -v '/PROJECT-CONFIG\.md:' \
  | grep -vE 'your-domain\.atlassian\.net|acme\.atlassian\.net|<site>\.netlify\.app|<[a-z-]+>\.atlassian\.net|acme\.example\.com|customfield_XXXXX' || true)
if [ -n "$LEAK" ]; then
  echo "REFUSING TO SYNC — identifying value leaked back into a skill:" >&2
  echo "$LEAK" | head -10 >&2
  echo "Replace it with a {{PLACEHOLDER}} and add the key to PROJECT-CONFIG.md." >&2
  exit 1
fi
# Require a real-looking username: must start with a letter or digit, so
# documentation placeholders (/Users/..., /Users/<name>) never match.
# Known placeholder names are exempt, case-insensitively, but ONLY when the name
# ends there — the following character must be outside the username alphabet.
# So a placeholder with anything appended — a hyphenated name, a dotted domain —
# is still treated as a real leak, while prose that quotes a bare placeholder in
# backticks or quotes does not trip the guard.
# Deliberately grep -E, not -P: PCRE is not available everywhere, and because this
# pipeline ends in `|| true` a failing grep would silently disable the check.
HOMELEAK=$(grep -RnIE "/Users/[A-Za-z0-9][A-Za-z0-9._-]*" "$BUNDLE" --exclude-dir=.git 2>/dev/null \
  | grep -v '\$HOME' \
  | grep -viE '/Users/(someone|user|you|example)([^A-Za-z0-9._-]|$)' || true)
if [ -n "$HOMELEAK" ]; then
  echo "REFUSING TO SYNC — a personal filesystem path leaked into a skill:" >&2
  echo "$HOMELEAK" | head -10 >&2
  echo 'Use $HOME or $REPO_ROOT instead of an absolute /Users/<name> path.' >&2
  exit 1
fi
echo "    no account ids, site hosts, deployed URLs, or personal paths in the bundle"
[ -f "$DEST/project-config.local.md" ] && { echo "REFUSING: local config leaked into bundle" >&2; exit 1; }

echo "==> Regenerating MANIFEST.md"
{
  echo "# Manifest"
  echo
  echo "Generated by \`sync-skills.sh\`. Do not edit by hand."
  echo
  echo "| Skill | Version | Description |"
  echo "|---|---|---|"
  for f in "$DEST"/*/SKILL.md; do
    d=$(basename "$(dirname "$f")")
    v=$(grep -m1 '^version:' "$f" | sed 's/version: *//' || true)
    desc=$(grep -m1 '^description:' "$f" | sed 's/description: *//;s/^"//;s/"$//' | cut -c1-160)
    printf '| `%s` | %s | %s |\n' "$d" "${v:---}" "$desc"
  done
  echo
  echo "Skills: $(find "$DEST" -name SKILL.md | wc -l | tr -d ' ')"
  echo "Reference files: $(find "$DEST" -path '*/references/*' -type f | wc -l | tr -d ' ')"
} > "$BUNDLE/MANIFEST.md"

echo "==> Done. $(find "$DEST" -name SKILL.md | wc -l | tr -d ' ') skills mirrored."
echo "    Review: git -C \"$BUNDLE\" diff"
