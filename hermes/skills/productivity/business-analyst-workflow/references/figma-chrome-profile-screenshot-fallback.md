# Chrome Profile Screenshot Fallback for Figma (/ba-reply)

Use this when Figma's `/v1/files` and `/v1/images` endpoints both return HTTP 429 and the developer needs screenshots to unblock a Frontend/Integration ticket.

If the user has already supplied local PNG screenshots, use them directly instead of Chrome capture — that is the fastest and most reliable fallback. Only use this Chrome recipe when user-provided screenshots are not available.

## When to use

- Figma API is rate-limited (confirmed 429 from curl/Local AI Bridge).
- The user explicitly asks the BA agent to "open the Figma nodes and take screenshots" using a named Chrome profile.
- A ticket's attached screenshots are missing, stale, or point to the wrong component.

## Goal

Launch Chrome with the requested profile, navigate to each Figma node URL, resize the viewport to the target breakpoint, and save a PNG. Then attach those PNGs to the JIRA ticket and post the `/ba-reply` comment.

## Step-by-step

### 1. Identify the Chrome profile directory

On macOS, profiles live under `~/Library/Application Support/Google Chrome/`. Inspect `Local State` or the profile folder names:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path.home() / 'Library/Application Support/Google/Chrome/Local State'
state = json.loads(p.read_text())
for k, v in state.get('profile_info_cache', {}).items():
    print(k, 'name:', v.get('name'), 'email:', v.get('email'))
PY
```

If the profile name alone doesn't reveal the email, check the profile's `Preferences` file for `email` or `gaia_name`.

### 2. Launch Chrome with that profile on a remote-debugging port

Copy the profile to `/tmp` so the launch doesn't race with an already-running Chrome instance, then start it on a dedicated port. Remove any previous copy first to avoid `cp -R` nesting:

```bash
PROFILE_EMAIL="{{JIRA_EMAIL}}"   # set to the requested profile email
SOURCE_DIR="/Users/$USER/Library/Application Support/Google Chrome/Profile 3"
DEST_DIR="/tmp/chrome-profile-${PROFILE_EMAIL}"
rm -rf "$DEST_DIR"
cp -R "$SOURCE_DIR" "$DEST_DIR"

/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \
  --remote-debugging-port=9223 \
  --user-data-dir="$DEST_DIR" \
  --no-default-browser-check \
  --no-first-run \
  --disable-features=OfferMigrationToDiceUsers,OptGuideOnDeviceModel \
  >/tmp/chrome-9223.log 2>&1 &
```

Verify the CDP endpoint is up:

```bash
curl -s http://localhost:9223/json/version
```

### 3. Capture screenshots programmatically

Use Playwright connected over CDP so the script can resize the viewport and take clean screenshots. Install Playwright if not present:

```bash
python3 -c "import playwright" 2>/dev/null || pip install playwright
playwright install chromium 2>/dev/null || true
```

Capture script (replace placeholder node IDs with the verified IDs for the component):

```python
import os, subprocess, json
from pathlib import Path
from playwright.sync_api import sync_playwright

FIGMA_FILE_KEY = "mkozkfJX2EGUIFcbl43EuD"
BREAKPOINTS = {
    "1920": (1920, 1080),
    "1440": (1440, 900),
    "1024": (1024, 768),
    "768":  (768,  1024),
    "375":  (375,  812),
}
# VERIFY these node IDs before capturing — stale node IDs in ticket descriptions
# often point to a different section from a prior ticket.
NODE_IDS = {
    "hero": {
        "1920": "NODE-ID-1920",
        "1440": "NODE-ID-1440",
        "1024": "NODE-ID-1024",
        "768":  "NODE-ID-768",
        "375":  "NODE-ID-375",
    },
}

out_dir = Path("/tmp/figma-screenshots")
out_dir.mkdir(exist_ok=True)

version = json.loads(subprocess.run(
    ["curl", "-s", "http://localhost:9223/json/version"],
    capture_output=True, text=True, check=True).stdout)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(version["webSocketDebuggerUrl"])
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
    page = ctx.pages[0] if ctx.pages else ctx.new_page()

    for section, nodes in NODE_IDS.items():
        for bp, node_id in nodes.items():
            url = f"https://www.figma.com/design/{FIGMA_FILE_KEY}/?node-id={node_id}"
            page.set_viewport_size({"width": BREAKPOINTS[bp][0], "height": BREAKPOINTS[bp][1]})
            page.goto(url, wait_until="networkidle", timeout=120000)
            page.wait_for_timeout(5000)   # let Figma render fully
            page.screenshot(path=str(out_dir / f"{section}-{bp}.png"), full_page=False)

    browser.close()
```

### 4. Verify the screenshot content before attaching

Open each PNG or run a quick vision check to confirm it shows the expected component, not a different section from a stale node URL. If a node URL renders the wrong component, do not attach it — flag the stale node ID and ask for the correct one.

### 5. Attach to JIRA and post /ba-reply

Upload the verified PNGs using the JIRA REST API:

```bash
JIRA_BASE="https://{{ATLASSIAN_SITE}}"
JIRA_EMAIL=$(grep '^JIRA_EMAIL=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
JIRA_API_KEY=$(grep '^JIRA_API_KEY=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
ISSUE_KEY="KAN-15"

for f in /tmp/figma-screenshots/*.png; do
  curl -s -X POST "$JIRA_BASE/rest/api/3/issue/$ISSUE_KEY/attachments" \
    -u "$JIRA_EMAIL:$JIRA_API_KEY" \
    -H "X-Atlassian-Token: no-check" \
    -F "file=@$f;filename=$(basename $f);type=image/png"
done
```

Then post the `/ba-reply` comment documenting which fallback was used and what each screenshot contains.

## Notes

- Prefer Playwright over browser automation snapshots for precise viewport control and full-page-height screenshots.
- Figma's public files can usually be viewed without login, but a logged-in profile may be needed for private files or comment access.
- If Chrome is already running with the same profile on the default port, a separate `--user-data-dir` copy avoids profile-lock conflicts.
- Always name files consistently, e.g. `{section}-{breakpoint}px.png`, so the Frontend Developer sub-agent can map them to breakpoints.
- Never attach unverified screenshots. Node IDs copied from an old ticket may point to a different section; verify visually first.
