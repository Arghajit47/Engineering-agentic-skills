# Frontend Section Asset Extraction (Generalized)

Use this class-level recipe when preparing any [Frontend] section ticket that needs Figma assets, text, and dimensions exported via the Local AI Bridge before dispatching the Frontend Developer sub-agent. Concrete examples: BC-19 (Hero) and BC-22 (Products).

## Required pre-sub-agent artifacts

| Artifact | How to obtain | Where to place |
|----------|---------------|----------------|
| Section screenshot | `curl -s http://localhost:47291/api/node/{section-node-id}/screenshot -o /tmp/{key}-section.png` | Attach to JIRA + use for visual sanity checks |
| **Style spec (CSS)** | `curl -s "http://localhost:47291/api/node/{section-node-id}/css?format=text" -o /tmp/{key}.css` | **Paste real values into `instructions.txt`** — never let the sub-agent guess styling |
| **Structured context** | `curl -s "http://localhost:47291/api/node/{section-node-id}/context" -o /tmp/{key}-context.json` | Auto-layout → flexbox, sizing, type metrics, token + component names |
| **Design tokens** | `curl -s "http://localhost:47291/api/variables?format=css" -o /tmp/design-tokens.css` | Quote token names instead of raw hex |
| Scene tree JSON | `curl -s http://localhost:47291/api/document -o /tmp/{key}_doc.json` | Attach to JIRA + parse for text/dimensions |
| Text node list | Recursive walker over `/api/document` tree, scoped to section node | Include verbatim in `instructions.txt` |
| Icon/logo/illustration SVGs | Sequential `GET /api/node/{id}/svg` loop | `public/assets/icons/` or `public/assets/illustrations/` |

## Extract text from the section subtree

```python
import json

def find_node(node, target_id):
    if node.get('id') == target_id:
        return node
    for child in node.get('children', []):
        found = find_node(child, target_id)
        if found:
            return found
    return None

def extract_text(node, path=''):
    results = []
    name = node.get('name', '')
    text = node.get('text', '')
    full_path = (path + '/' + name).lstrip('/')
    if text:
        results.append((node.get('id'), full_path, text))
    for child in node.get('children', []):
        results.extend(extract_text(child, full_path))
    return results

with open('/tmp/{key}_doc.json') as f:
    doc = json.load(f)

section = find_node(doc['tree'], '{section-node-id}')
if section:
    for node_id, full_path, text in extract_text(section):
        print(f"[{node_id}] {full_path}: {text}")
```

## Sequential SVG export loop

Fire one request at a time; the plugin queue processes exports serially. Parallel requests stack up and each can time out after ~30s.

```bash
mkdir -p public/assets/icons public/assets/illustrations

assets=(
  "11:86874:icon_product_1.svg:icons"
  "11:86902:icon_product_2.svg:icons"
  "11:86913:icon_product_3.svg:icons"
  "11:86869:icon_product_badge_1.svg:icons"
  "101:62:icon_product_badge_2.svg:icons"
  "101:64:icon_product_badge_3.svg:icons"
)

for spec in "${assets[@]}"; do
  IFS=':' read -r node_id filename dir <<< "$spec"
  curl -s "http://localhost:47291/api/node/${node_id}/svg" \
    -o "public/assets/${dir}/${filename}"
  # quick sanity check
  if ! head -c 4 "public/assets/${dir}/${filename}" | grep -q '<svg'; then
    echo "WARN: ${filename} may not be a valid SVG"
  fi
  sleep 0.1
done
```

## Validate exported assets

- Each SVG should be > 100 bytes and start with `<svg`.
- Each screenshot PNG should be > 20 KB.
- If a node 404s or returns blank, flag it in `instructions.txt` as a known gap and continue; do not halt the workflow for a single decorative asset.

## Build the execution plan

Include in `frontend-instructions-{KEY}.txt`:
1. Section node ID and screenshot path.
2. Extracted text (heading, subheading, body, labels, CTA copy).
3. Asset table mapping each icon/badge to its exported file path and source node ID.
4. Design theme (colors, font, spacing tokens if available).
5. File create/modify list and ACs.
6. Branch/commit/PR rules and `test-automation/` prohibition.

## Sub-agent preparation

Copy the plan into the repo root so the sub-agent can read it even if JIRA attachments are unreachable:

```bash
cp /tmp/frontend-instructions-{KEY}.txt $REPO_ROOT/frontend-instructions-{KEY}.txt
```

Mention both the JIRA attachment name and the repo-local path in the sub-agent context.

## Attach to JIRA

Prefer the Jira REST v2 multipart upload for binaries and the plain-text plan. Do not source `~/.env` in a curl pipeline.

```bash
JIRA_API_KEY=$(grep '^JIRA_API_KEY=' ~/.env | cut -d'=' -f2- | tr -d '"')
JIRA_EMAIL=$(grep '^JIRA_EMAIL=' ~/.env | cut -d'=' -f2- | tr -d '"')

# Screenshot
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" -H 'X-Atlassian-Token: no-check' \
  -X POST 'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/attachments' \
  -F 'file=@/tmp/{key}-section.png'

# Scene tree JSON
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" -H 'X-Atlassian-Token: no-check' \
  -X POST 'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/attachments' \
  -F 'file=@/tmp/{key}_doc.json'

# Execution plan
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" -H 'X-Atlassian-Token: no-check' \
  -X POST 'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/attachments' \
  -F 'file=@/tmp/frontend-instructions-{KEY}.txt'
```

## Fallback if a single SVG export fails

A 404 or blank export on one node is not a full bridge failure. Continue with available data, flag the missing asset in `instructions.txt` with the node ID, and let the Frontend Developer either request it or use the next-best available node (parent frame/component).

## Sanity-check list before dispatching sub-agent

- [ ] Local AI Bridge health check passes on `http://localhost:47291/`
- [ ] `/api/document` contains the target section node
- [ ] Section screenshot is a valid PNG
- [ ] Every required SVG starts with `<svg` and is non-empty
- [ ] `public/assets/icons/` (and `illustrations/` if used) contains the exported files
- [ ] `frontend-instructions-{KEY}.txt` is attached to JIRA and copied to repo root
- [ ] JIRA comment references the plan, assets, and fallback local path
- [ ] Ticket transitioned to `In Progress` and assigned to Developer before dispatch
