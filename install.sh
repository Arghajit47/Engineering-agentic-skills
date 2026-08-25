#!/usr/bin/env bash
# Install this engineering pipeline into Claude Code (default) or Hermes.
#
#   ./install.sh                 # install/upgrade into ~/.claude/skills (backs up first)
#   ./install.sh --dry-run       # show what would change
#   ./install.sh --dest <path>   # install somewhere else (e.g. a project's .claude/skills)
#   ./install.sh --list          # what is in this bundle
#   ./install.sh --target hermes # install the Hermes-layout tree into ~/.hermes/skills/productivity
#   ./install.sh --config        # show where your config lives and what is in it
#   ./install.sh --setup         # (re-)run the configuration prompts only
#   ./install.sh --with-bridge   # also install the Local AI Bridge (Figma read path)
#   ./install.sh --no-bridge     # never offer the bridge
#   ./install.sh --with-hooks    # wire the enforcement hooks into settings.json
#   ./install.sh --no-hooks      # never offer them
set -euo pipefail

BUNDLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=claude
SRC="$BUNDLE/claude-code/skills"
DEST="$HOME/.claude/skills"
DRY=0
SETUP_ONLY=0
SETUP=1
BRIDGE=ask
HOOKS=ask

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; SETUP=0; shift ;;
    --no-setup) SETUP=0; shift ;;
    --with-bridge) BRIDGE=yes; shift ;;
    --no-bridge)   BRIDGE=no; shift ;;
    --with-hooks)  HOOKS=yes; shift ;;
    --no-hooks)    HOOKS=no; shift ;;
    --dest)    DEST="$2"; DEST_SET=1; shift 2 ;;
    --target)  TARGET="$2"; shift 2 ;;
    --list)    LIST_ONLY=1; shift ;;
    --setup)   SETUP_ONLY=1; shift ;;
    --config)  SHOW_CONFIG=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

case "$TARGET" in
  claude) ;;
  hermes)
    SRC="$BUNDLE/hermes/skills/productivity"
    [ "${DEST_SET:-0}" -eq 1 ] || DEST="$HOME/.hermes/skills/productivity"
    ;;
  *) echo "unknown target: $TARGET (expected: claude, hermes)" >&2; exit 1 ;;
esac

if [ "${SHOW_CONFIG:-0}" -eq 1 ]; then
  CFG="$HOME/.claude/skills/project-config.local.md"
  echo "Configuration file"
  echo "  $CFG"
  echo
  if [ -f "$CFG" ]; then
    echo "Current values:"
    grep -E '^(## |- )' "$CFG" | sed 's/^/  /'
    echo
    UNSET_N=$(grep -c '{{' "$CFG" || true)
    if [ "$UNSET_N" -gt 0 ]; then
      echo "  $UNSET_N value(s) still unset ({{PLACEHOLDER}}) — the skill that needs one"
      echo "  will ask you for it, once, and offer to save it."
      echo
    fi
    echo "To change anything, edit that file directly — it is plain Markdown, one"
    echo "\"- KEY: value\" per line, and takes effect on the next skill run. Or re-run"
    echo "the prompts with:  ./install.sh --setup   (delete the file first to be re-asked)."
    echo
    echo "Reference for every key, how to find it, and how skills use it:"
    echo "  $HOME/.claude/skills/PROJECT-CONFIG.md"
    echo
    echo "This file is local only: gitignored, and excluded from the shareable bundle."
  else
    echo "No config yet. Create it with:  ./install.sh --setup"
    echo "Reference: $HOME/.claude/skills/PROJECT-CONFIG.md"
  fi
  exit 0
fi

if [ "${LIST_ONLY:-0}" -eq 1 ]; then
  echo "target: $TARGET   source: $SRC"
  ls -1 "$SRC" 2>/dev/null | sed 's/^/  /'
  exit 0
fi

[ -d "$SRC" ] || { echo "error: bundle is missing $SRC — run sync-skills.sh on the source machine" >&2; exit 1; }
command -v rsync >/dev/null || { echo "error: rsync required" >&2; exit 1; }


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
install_hooks() {
  local GUARD="$DEST/hooks/guard.py"
  [ -f "$GUARD" ] || return 0
  command -v python3 >/dev/null 2>&1 || { echo "    python3 not found — hooks skipped"; return 0; }

  if [ "$HOOKS" = ask ]; then
    if [ ! -t 0 ]; then HOOKS=no; else
      echo
      echo "  Enforcement hooks — harness-level, so they cannot be missed when context"
      echo "  is long. They block: pushing/committing to main, mixing the dev and"
      echo "  reviewer GitHub tokens, 'gh --body' with backticks, and updating a visual"
      echo "  baseline; and warn on raw hex / default breakpoints in components."
      echo "  A hook overrides your permission allowlist. Off switch:"
      echo "    touch $DEST/hooks/DISABLED"
      echo "  Type 'y' to wire them in, or 'n' to decline. There is no default —"
      echo "  this changes how your harness behaves, so it needs an explicit answer."
      while :; do
        read -r -p "  Wire them into settings.json? (y/n) " ans
        case "$ans" in
          y|Y|yes|Yes) HOOKS=yes; break ;;
          n|N|no|No)   HOOKS=no;  break ;;
          *) echo "    Please type y or n." ;;
        esac
      done
    fi
  fi
  [ "$HOOKS" = yes ] || { echo "    Hooks not wired. Later: ./install.sh --with-hooks"; return 0; }

  python3 - "$GUARD" <<'PYHOOK'
import json, os, shutil, sys, datetime
guard = sys.argv[1]
p = os.path.expanduser("~/.claude/settings.json")
cfg = {}
if os.path.exists(p):
    shutil.copy(p, p + ".backup-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    try:
        cfg = json.load(open(p))
    except Exception:
        print("    settings.json is not valid JSON — not touching it"); sys.exit(0)
else:
    os.makedirs(os.path.dirname(p), exist_ok=True)
hooks = cfg.setdefault("hooks", {})
added = []
for event, matcher in (("PreToolUse", "Bash"), ("PostToolUse", "Edit|Write|MultiEdit")):
    lst = hooks.setdefault(event, [])
    if any(guard in h.get("command", "") for e in lst for h in e.get("hooks", [])):
        continue
    lst.append({"matcher": matcher,
                "hooks": [{"type": "command", "command": "python3 '%s'" % guard, "timeout": 10}]})
    added.append(event)
json.dump(cfg, open(p, "w"), indent=2); open(p, "a").write("\n")
print("    " + (", ".join(added) + " wired" if added else "already wired") +
      " (existing hooks preserved, settings.json backed up)")
PYHOOK
  echo "    self-test: $("$DEST/hooks/test-guard.sh" 2>/dev/null | tail -1)"
}

# ---------------------------------------------------------------------------
install_bridge() {
  local SRC="$BUNDLE/bridge"
  [ -d "$SRC" ] || { echo "    bridge source missing from this bundle — skipping"; return 0; }

  local DEST_B="${LOCAL_AI_BRIDGE_HOME:-$HOME/Local AI Bridge}"

  # ---- prerequisite check -------------------------------------------------
  local MISSING=0
  echo
  echo "  Local AI Bridge — the Figma read path for /ba, /qa, /developer and"
  echo "  /design-system. Without it those four halt on any design extraction."
  echo
  echo "  Prerequisites:"
  if command -v node >/dev/null 2>&1; then
    echo "    [ok]   Node.js $(node --version)"
  else
    echo "    [MISS] Node.js 18+ — needed to build the plugin and run the server"; MISSING=1
  fi
  if command -v npm >/dev/null 2>&1; then
    echo "    [ok]   npm $(npm --version)"
  else
    echo "    [MISS] npm"; MISSING=1
  fi
  case "$(uname -s)" in
    Darwin) [ -d "/Applications/Figma.app" ] \
              && echo "    [ok]   Figma Desktop app" \
              || { echo "    [MISS] Figma Desktop app — https://www.figma.com/downloads/"; MISSING=1; } ;;
    Linux)  echo "    [?]    Figma Desktop — no official Linux build; the browser CANNOT load a dev plugin" ;;
    *)      echo "    [?]    Figma Desktop — verify it is installed (browser will not work)" ;;
  esac
  if command -v lsof >/dev/null 2>&1 && lsof -i :47291 >/dev/null 2>&1; then
    echo "    [WARN] port 47291 is already in use — free it before starting the server"
  else
    echo "    [ok]   port 47291 free"
  fi
  echo
  echo "  Also required, and only you can do these:"
  echo "    - a Figma account (free plan is fine)"
  echo "    - the design file OPEN in Figma Desktop — the plugin reads the open file"
  echo "    - import the plugin from its manifest, then run it and KEEP IT OPEN"
  [ "$MISSING" -eq 1 ] && echo "
  Missing items above will not stop the install, but the bridge will not work
  until they are resolved. See bridge/INSTALL.md."
  echo

  if [ "$BRIDGE" = ask ]; then
    if [ ! -t 0 ]; then BRIDGE=no; else
      read -r -p "  Install it to [$DEST_B]? [Y/n/path] " ans
      case "$ans" in
        n|N|no|No) BRIDGE=no ;;
        ""|y|Y|yes|Yes) BRIDGE=yes ;;
        *) BRIDGE=yes; DEST_B="$ans" ;;
      esac
    fi
  fi
  if [ "$BRIDGE" != yes ]; then
    set_cfg FIGMA_READ_PATH figma-mcp
    cat <<'NOBRIDGE'
    Bridge not installed. Recorded FIGMA_READ_PATH: figma-mcp — the skills will
    use the official plugin:figma MCP server for design facts and will NOT ask
    about this again.

    If you install the bridge yourself later, flip one line in
    project-config.local.md:

        - FIGMA_READ_PATH: bridge

    or re-run:  ./install.sh --with-bridge
NOBRIDGE
    return 0
  fi

  echo "==> Installing Local AI Bridge -> $DEST_B"
  if [ -e "$DEST_B/manifest.json" ]; then
    local BK="$DEST_B.backup-$(date +%Y%m%d-%H%M%S)"
    echo "    existing install found — backing up its source to $BK"
    mkdir -p "$BK"
    ( cd "$DEST_B" && for f in code.ts ui.html manifest.json package.json tsconfig.json README.md server/server.ts server/package.json; do
        [ -f "$f" ] && { mkdir -p "$BK/$(dirname "$f")"; cp "$f" "$BK/$f"; }
      done ) || true
  fi
  mkdir -p "$DEST_B/server"
  rsync -a --exclude '.DS_Store' "$SRC"/ "$DEST_B"/
  echo "    source copied — caches under server/ left untouched"

  if command -v npm >/dev/null 2>&1; then
    echo "==> npm install + build (takes a minute)"
    ( cd "$DEST_B" && npm install --silent && npm run build --silent ) >/dev/null 2>&1 \
      && echo "    plugin built (code.js)" \
      || echo "    WARN: plugin build failed — run it by hand, see bridge/INSTALL.md"
    ( cd "$DEST_B/server" && npm install --silent ) >/dev/null 2>&1 \
      && echo "    server deps installed" \
      || echo "    WARN: server npm install failed"
  else
    echo "    npm not found — install Node, then: cd \"$DEST_B\" && npm install && npm run build"
  fi

  # The config must record where the bridge actually went, whatever was typed at setup.
  local CFG_B="$HOME/.claude/skills/project-config.local.md"
  if [ -f "$CFG_B" ]; then
    if grep -q '^- LOCAL_AI_BRIDGE_HOME:' "$CFG_B"; then
      local TMP_B; TMP_B="$(mktemp)"
      sed "s|^- LOCAL_AI_BRIDGE_HOME:.*|- LOCAL_AI_BRIDGE_HOME: $DEST_B|" "$CFG_B" > "$TMP_B" && mv "$TMP_B" "$CFG_B"
    else
      printf -- "- LOCAL_AI_BRIDGE_HOME: %s\n" "$DEST_B" >> "$CFG_B"
    fi
    echo "    recorded LOCAL_AI_BRIDGE_HOME in project-config.local.md"
  fi
  set_cfg FIGMA_READ_PATH bridge

  cat <<BRIDGEDONE

  Bridge source installed and built. Figma requires a human for the rest:

    1. Open the FIGMA DESKTOP APP (figma.com in a browser cannot load a dev
       plugin and cannot reach localhost), and open your design file.
    2. Plugins -> Development -> Import plugin from manifest...
       -> $DEST_B/manifest.json          (once per machine)
    3. cd "$DEST_B/server" && npm start   (leave it running)
    4. Plugins -> Development -> Local AI Bridge -> Run
       KEEP THE PLUGIN OPEN. Closing it makes the server serve stale data,
       and the plugin reads whichever file is open — re-run it per file.

  Verify:  curl -s http://localhost:47291/api/whoami | jq '.pluginConnected'   # true
  Details: bridge/INSTALL.md
BRIDGEDONE
}

# Write or replace one "- KEY: value" line in the config.
set_cfg() {
  local key="$1" val="$2" cfg="$HOME/.claude/skills/project-config.local.md"
  [ -f "$cfg" ] || return 0
  if grep -q "^- $key:" "$cfg"; then
    local tmp; tmp="$(mktemp)"
    sed "s|^- $key:.*|- $key: $val|" "$cfg" > "$tmp" && mv "$tmp" "$cfg"
  else
    printf -- "- %s: %s\n" "$key" "$val" >> "$cfg"
  fi
}

# Print $2 if non-empty, otherwise the literal {{NAME}} placeholder.
ph() { if [ -n "${2:-}" ]; then printf '%s' "$2"; else printf '{{%s}}' "$1"; fi; }

run_setup() {
  local CFG="$DEST/project-config.local.md"
  [ "$TARGET" = hermes ] && CFG="$HOME/.claude/skills/project-config.local.md"
  echo
  echo "==> Setup"
  echo "    The skills contain no account ids, site hosts, project keys, or deployed"
  echo "    URLs — only {{PLACEHOLDER}} names. Answer these once and they are saved to"
  echo "    $CFG (local only; never committed, never bundled)."
  echo "    Press Enter to skip any value — the skill that needs it will ask you later."
  echo

  if [ -f "$CFG" ]; then
    echo "    $CFG already exists. Leaving it alone."
    echo "    Edit it by hand, or delete it and re-run ./install.sh --setup."
    return 0
  fi
  # Non-interactive: take values from the environment if any are set, else skip.
  if [ ! -t 0 ]; then
    if [ -n "${PROJECT_NAME:-}${ATLASSIAN_SITE:-}${JIRA_PROJECT_KEY:-}${REPO_ROOT:-}${DEPLOYED_URL:-}" ]; then
      echo "    Non-interactive — taking values from the environment."
      {
        echo "# project-config.local.md"
        echo
        echo "Written non-interactively from environment variables."
        echo
        echo "## ${PROJECT_NAME:-default}"
        echo
        echo "- ATLASSIAN_SITE: $(ph ATLASSIAN_SITE "${ATLASSIAN_SITE:-}")"
        echo "- JIRA_PROJECT_KEY: $(ph JIRA_PROJECT_KEY "${JIRA_PROJECT_KEY:-}")"
        echo "- JIRA_DEV_ACCOUNT_ID: $(ph JIRA_DEV_ACCOUNT_ID "${JIRA_DEV_ACCOUNT_ID:-}")"
        echo "- JIRA_REVIEWER_ACCOUNT_ID: $(ph JIRA_REVIEWER_ACCOUNT_ID "${JIRA_REVIEWER_ACCOUNT_ID:-}")"
        echo "- JIRA_EMAIL: $(ph JIRA_EMAIL "${JIRA_EMAIL:-}")"
        echo "- GITHUB_REPO: $(ph GITHUB_REPO "${GITHUB_REPO:-}")"
        echo "- GITHUB_OWNER: $(ph GITHUB_OWNER "${GITHUB_OWNER:-}")"
        echo "- GITHUB_REVIEWER_ACCOUNT: $(ph GITHUB_REVIEWER_ACCOUNT "${GITHUB_REVIEWER_ACCOUNT:-}")"
        echo "- DEPLOYED_URL: $(ph DEPLOYED_URL "${DEPLOYED_URL:-}")"
        echo "- DESIGN_FRAME_WIDTHS: $(ph DESIGN_FRAME_WIDTHS "${DESIGN_FRAME_WIDTHS:-}")"
        echo "- STORY_POINT_FIELD: $(ph STORY_POINT_FIELD "${STORY_POINT_FIELD:-}")"
        echo "- PROJECT_NAME: $(ph PROJECT_NAME "${PROJECT_NAME:-}")"
        echo "- FIGMA_READ_PATH: ${FIGMA_READ_PATH:-bridge}"
        echo "- REPO_ROOT: ${REPO_ROOT:-<absolute path to your checkout>}"
        echo "- LOCAL_AI_BRIDGE_HOME: ${LOCAL_AI_BRIDGE_HOME:-<absolute path to the Local AI Bridge>}"
      } > "$CFG"
      echo "    Wrote $CFG"
      return 0
    fi
    echo "    Not an interactive shell and no config env vars set — skipping."
    echo "    Run ./install.sh --setup later, or re-run with e.g."
    echo "      PROJECT_NAME=web REPO_ROOT=\"\$(git rev-parse --show-toplevel)\" ./install.sh"
    return 0
  fi

  local project site key devid revid repo owner reviewer email url widths spfield root bridge
  local root_default bridge_default
  root_default="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  bridge_default=""
  [ -d "$HOME/Local AI Bridge" ] && bridge_default="$HOME/Local AI Bridge"
  read -r -p "  Project short name (e.g. web)                : " project
  read -r -p "  Atlassian site (e.g. acme.atlassian.net)     : " site
  read -r -p "  JIRA project key (e.g. ENG)                  : " key
  read -r -p "  JIRA account id assigned on In Progress      : " devid
  read -r -p "  JIRA account id assigned on Code Review/Done : " revid
  read -r -p "  Atlassian email for REST basic auth          : " email
  read -r -p "  GitHub repo (owner/repo)                     : " repo
  read -r -p "  GitHub owner                                 : " owner
  read -r -p "  GitHub review/merge account login            : " reviewer
  read -r -p "  Deployed PRODUCTION url (not a preview)      : " url
  read -r -p "  Design frame widths (e.g. 390 / 1440 / 1920) : " widths
  read -r -p "  Story-point custom field id                  : " spfield
  echo
  echo "  Filesystem paths — absolute, so recipes copy-paste and run."
  if [ -n "$root_default" ]; then
    read -r -p "  Local repo checkout [$root_default] : " root
    root="${root:-$root_default}"
  else
    read -r -p "  Local repo checkout (absolute path)          : " root
  fi
  if [ -n "$bridge_default" ]; then
    read -r -p "  Local AI Bridge home [$bridge_default] : " bridge
    bridge="${bridge:-$bridge_default}"
  else
    read -r -p "  Local AI Bridge home (absolute path)         : " bridge
  fi

  {
    echo "# project-config.local.md"
    echo
    echo "Local only. Gitignored and excluded from the bundle by sync-skills.sh."
    echo "Blank values are asked for by the skill that needs them."
    echo
    echo "## ${project:-default}"
    echo
    echo "- ATLASSIAN_SITE: $(ph ATLASSIAN_SITE "${site:-}")"
    echo "- JIRA_PROJECT_KEY: $(ph JIRA_PROJECT_KEY "${key:-}")"
    echo "- JIRA_DEV_ACCOUNT_ID: $(ph JIRA_DEV_ACCOUNT_ID "${devid:-}")"
    echo "- JIRA_REVIEWER_ACCOUNT_ID: $(ph JIRA_REVIEWER_ACCOUNT_ID "${revid:-}")"
    echo "- JIRA_EMAIL: $(ph JIRA_EMAIL "${email:-}")"
    echo "- GITHUB_REPO: $(ph GITHUB_REPO "${repo:-}")"
    echo "- GITHUB_OWNER: $(ph GITHUB_OWNER "${owner:-}")"
    echo "- GITHUB_REVIEWER_ACCOUNT: $(ph GITHUB_REVIEWER_ACCOUNT "${reviewer:-}")"
    echo "- DEPLOYED_URL: $(ph DEPLOYED_URL "${url:-}")"
    echo "- DESIGN_FRAME_WIDTHS: $(ph DESIGN_FRAME_WIDTHS "${widths:-}")"
    echo "- STORY_POINT_FIELD: $(ph STORY_POINT_FIELD "${spfield:-}")"
    echo "- PROJECT_NAME: $(ph PROJECT_NAME "${project:-}")"
    echo "- FIGMA_READ_PATH: ${FIGMA_READ_PATH:-bridge}"
    echo "- REPO_ROOT: ${root:-<absolute path to your checkout>}"
    echo "- LOCAL_AI_BRIDGE_HOME: ${bridge:-<absolute path to the Local AI Bridge>}"
  } > "$CFG"

  echo
  echo "    Wrote $CFG"
  if [ -n "$root" ] || [ -n "$bridge" ]; then
    echo
    echo "    Export the paths in any shell that runs a skill recipe:"
    [ -n "$root" ]   && echo "      export REPO_ROOT=\"$root\""
    [ -n "$bridge" ] && echo "      export LOCAL_AI_BRIDGE_HOME=\"$bridge\""
    echo "    REPO_ROOT is per-project — re-derive it with"
    echo "      export REPO_ROOT=\"\$(git rev-parse --show-toplevel)\""
  fi
  echo "    Anything you skipped stays a {{PLACEHOLDER}}; the skill will ask you for it."
}

if [ "$SETUP_ONLY" -eq 1 ]; then
  [ -d "$DEST" ] || { echo "error: $DEST does not exist — install first" >&2; exit 1; }
  run_setup
  exit 0
fi

echo "Engineering pipeline installer  (target: $TARGET)"
echo "  from: $SRC"
echo "  to:   $DEST"
echo

COUNT=$(find "$SRC" -name SKILL.md | wc -l | tr -d ' ')
echo "  $COUNT skills in this bundle:"
for f in "$SRC"/*/SKILL.md; do
  d=$(basename "$(dirname "$f")")
  if [ -f "$DEST/$d/SKILL.md" ]; then
    if diff -q "$f" "$DEST/$d/SKILL.md" >/dev/null 2>&1; then st="unchanged"; else st="UPGRADE"; fi
  else st="new"; fi
  printf '    %-32s %s\n' "$d" "$st"
done
echo

if [ "$DRY" -eq 1 ]; then
  echo "(dry run — nothing written)"
  rsync -avn --exclude '.DS_Store' --exclude '__pycache__' --exclude '*.pyc' "$SRC"/ "$DEST"/ | sed 's/^/    /'
  exit 0
fi

# Back up anything already there. Never destroy a local skill.
if [ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
  BACKUP="$HOME/.claude/skills-backup-$TARGET-$(date +%Y%m%d-%H%M%S)"
  echo "==> Backing up existing skills to $BACKUP"
  cp -R "$DEST" "$BACKUP"
fi

echo "==> Installing"
mkdir -p "$DEST"
# No --delete: skills you have that this bundle does not are left alone.
rsync -a --exclude '.DS_Store' --exclude '__pycache__' --exclude '*.pyc' "$SRC"/ "$DEST"/
find "$DEST" -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true
find "$DEST" -name '*.py' -exec chmod +x {} \; 2>/dev/null || true

[ "$SETUP" -eq 1 ] && run_setup
[ "$TARGET" = claude ] && install_bridge
[ "$TARGET" = claude ] && install_hooks

cat <<'DONE'

Installed. Restart Claude Code (or /clear) so the skills are picked up.

  Always-on rules template (copy to your repo root as AGENTS.md or CLAUDE.md):
                ~/.claude/skills/rules/AGENTS.md

  Your config:  ~/.claude/skills/project-config.local.md
                view it any time with  ./install.sh --config

  Start here:  PIPELINE.md — the lifecycle map and the invariants
  Then:        /em --standup   (board state)
               /architect      (before any multi-component epic)

No account ids, site hosts, project keys, or deployed URLs are baked into these
skills — they are {{PLACEHOLDER}} names resolved from project-config.local.md.
Anything you skipped at setup will simply be asked for by the skill that needs it,
once, and saved. Re-run ./install.sh --setup any time. See PROJECT-CONFIG.md.

Still worth a look before your first real run:
  * perf-budget/SKILL.md        — the budget table, or add perf-budget.json to your repo
  * design-system/SKILL.md      — read your frame widths from the Local AI Bridge

The Figma read path (/ba, /qa, /developer, /design-system) needs the Local AI Bridge
on localhost:47291 — its source ships in bridge/ and install.sh can set it up, but
Figma Desktop, the plugin import, and running the plugin are yours to do. JIRA skills
need Atlassian Rovo MCP. Skills whose tooling you lack are simply not invoked; the
rest work unchanged.
DONE
