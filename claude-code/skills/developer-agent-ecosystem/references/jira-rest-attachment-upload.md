# JIRA REST Attachment Upload Notes

When attaching files to a JIRA ticket during the developer workflow, the MCP server's attachment tools may use an account that does not have write access or resolves to the wrong identity. This reference documents the direct REST fallback.

## When to use

Use the direct JIRA REST API when:
- `mcp__jira__jira_upload_attachment` returns "Issue does not exist or you do not have permission" or a 401
- `mcp__jira__confluence_upload_attachment` returns 401 against a JIRA issue ID (Confluence and JIRA attachment endpoints are not interchangeable)
- You need to attach screenshots or `.txt` instruction files from a script/sub-agent
- The attachment must be authored by the dev account so the sub-agent pipeline can read it back

## Required credentials

Read from `~/.env`:

```bash
JIRA_EMAIL=$(grep '^JIRA_EMAIL=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
JIRA_API_KEY=$(grep '^JIRA_API_KEY=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
```

The dev account for this project is `{{JIRA_EMAIL}}` with the corresponding `JIRA_API_KEY`.

## Upload a single file

```bash
KEY="KAN-12"
FILE="/tmp/instructions.txt"

curl -s -X POST "https://{{ATLASSIAN_SITE}}/rest/api/3/issue/${KEY}/attachments" \
  -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
  -H "X-Atlassian-Token: no-check" \
  -F "file=@${FILE};filename=$(basename ${FILE});type=text/plain"
```

For PNG screenshots use `type=image/png`. For text plans use `type=text/plain`.

## Upload multiple files

Loop the same command over a list of local paths. Never print the JIRA token value.

## Verification

Confirm with:

```bash
curl -s -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
  -H "Accept: application/json" \
  "https://{{ATLASSIAN_SITE}}/rest/api/3/issue/${KEY}?fields=attachment" | python3 -m json.tool
```

## Fallback when REST upload is unavailable

If both the MCP upload and the direct REST call fail (401, missing credentials, or consent guard blocks sourcing `~/.env`), paste the instruction file contents directly into a JIRA comment via `mcp__jira__jira_add_comment`. Do not block the developer pipeline on attachment mechanics; the sub-agent can read the plan from the comment body.

## Security

- Treat `JIRA_API_KEY` as a secret; do not echo it, pass it as a bare CLI argument, or include it in JIRA comments/MR descriptions.
- Use shell variables (`$JIRA_API_KEY`) in curl commands rather than interpolating the literal token into the command string where possible.

## Related

- `figma-screenshot-render-fallback.md` — produces the PNG files this upload consumes
- `business-analyst-workflow` skill — BA-side attachment handling
