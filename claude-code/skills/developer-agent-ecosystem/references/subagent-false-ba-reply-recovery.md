# Sub-Agent False /ba-reply Recovery

Sometimes a dispatched Frontend/Backend/Integration Developer sub-agent posts a premature `/ba-reply` because it mistakenly believes a design source is unreachable, when in fact the parent agent has already made it available locally (e.g., Figma scene tree downloaded, assets exported, execution plan copied to the repo root). The parent agent must detect the false halt and resume the sub-agent with corrected, concrete local paths rather than treating the ticket as genuinely blocked.

## Detecting a false halt

Signals that the /ba-reply is likely false:
- The sub-agent reports JIRA attachments are 403 via `web_extract`, but the parent already uploaded those same assets via the Jira REST v2 API.
- The sub-agent claims the Local AI Bridge is down, but `curl -s http://localhost:47291/` returns healthy.
- The sub-agent says it cannot read a plan attachment, but the parent copied the plan text to a repo-local file path.
- No actual missing requirement is named — the halt is framed around access rather than a design gap.

## Recovery steps

1. **Verify the claimed blocker is false without re-dispatching yet.**
   - Check Local AI Bridge health.
   - Confirm local files exist (`/tmp/hero-section.png`, `/tmp/bc19_doc.json`, `$REPO_ROOT/frontend-instructions-bc19.txt`, etc.).
   - Confirm exported assets are already in `public/assets/`.

2. **Add a JIRA comment overriding the /ba-reply.**
   State explicitly that the design source is reachable and that the previous /ba-reply should be ignored. This preserves the decision trail.

3. **Copy the execution plan to a repo-local file if it isn't already.**
   Sub-agents can read local files reliably even when MCP/web tools fail:
   ```bash
   cp /tmp/frontend-instructions-bc19.txt $REPO_ROOT/frontend-instructions-bc19.txt
   ```

4. **Re-dispatch the sub-agent with explicit local paths in the context.**
   Include concrete file paths and a direct instruction to ignore the prior /ba-reply:
   - `Read the file $REPO_ROOT/frontend-instructions-bc19.txt for full instructions`
   - `Inspect /tmp/hero-section.png and /tmp/bc19_doc.json if needed`
   - `Use the already-exported SVG assets in public/assets/`
   - `If genuinely blocked after trying, then halt with /ba-reply`

5. **Do not perform the implementation yourself.**
   The recovery is a re-dispatch, not a direct-fix shortcut. The sub-agent still owns the component code.

## Prevention

When dispatching a sub-agent that depends on attachments or a running bridge:
- Provide local file paths, not just JIRA attachment names.
- Remind the sub-agent that the Local AI Bridge is running and where the scene tree/assets are cached.
- Keep a copy of the execution plan in the repo root so the sub-agent can read it via `read_file` instead of relying on JIRA MCP/web tools.

## Example from BC-19

The Frontend Developer sub-agent halted after 31 seconds because `web_extract` returned 403 on JIRA attachments and it concluded the Local AI Bridge was down. In reality:
- `/tmp/hero-section.png` (245 KB) existed.
- `/tmp/bc19_doc.json` (1.2 MB scene tree) existed.
- All SVG assets were already in `public/assets/icons/` and `public/assets/illustrations/`.
- The bridge was healthy on port 47291.

Recovery:
- Verified health and local files.
- Copied instructions to repo root.
- Posted a JIRA comment overriding the /ba-reply.
- Re-dispatched the same Frontend Developer task with explicit local paths.
- The second run completed successfully in ~3 minutes.

## Backend variant: BC-20

The same false-halt pattern can occur for Backend Developer sub-agents. When dispatching a Backend Developer:
- Attach the `backend-execution-plan.txt` to JIRA via the Jira REST v2 multipart recipe.
- Also copy the plan to a repo-local path (e.g. `$REPO_ROOT/backend-execution-plan-bc20.txt`).
- In the sub-agent context, provide both the JIRA attachment name and the local file path.
- Tell the sub-agent to read the local file first if JIRA attachments are 403 via `web_extract`.
- Reference existing route handlers in the repo (`src/app/api/faq/route.ts`, `src/app/api/config/cta/route.ts`) as pattern sources they can read directly.
