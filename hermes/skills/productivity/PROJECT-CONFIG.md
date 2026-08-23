# Project Configuration

Skills in this pipeline contain **no** account IDs, site URLs, project keys, or deployed
URLs. Every such value is a `{{PLACEHOLDER}}` resolved at setup time.

## How resolution works

1. A skill needing a value looks for **`project-config.local.md`** in this directory.
2. If the file is missing, or the value it needs is absent or still `{{...}}`, the skill
   **stops and asks the user** for it — once — then offers to save it here so it is never
   asked again.
3. A skill **never guesses** one of these values, never carries one over from another
   project in the same session, and never invents a plausible-looking account ID.

`project-config.local.md` is **local only**: gitignored, and excluded from the shareable
bundle by `sync-skills.sh`. Your values never travel with the skills.

## Values

Copy this table into `project-config.local.md` and fill it in — or run
`./install.sh --setup` from the bundle and answer the prompts.

| Placeholder | What it is | How to find it | Asked by |
|---|---|---|---|
| `{{ATLASSIAN_SITE}}` | Your Atlassian site host, e.g. `acme.atlassian.net` | the host in any JIRA URL | `ba`, `developer-agent-ecosystem`, `qa` |
| `{{JIRA_PROJECT_KEY}}` | Board key, e.g. `ENG` | the prefix on any ticket id | `eng-manager`, `agent-eval`, `ba` |
| `{{JIRA_DEV_ACCOUNT_ID}}` | Atlassian account id assigned on `In Progress` / `In Testing` | `lookupJiraAccountId`, or the `accountId` in a profile URL | `jira-workflow` and every skill that transitions |
| `{{JIRA_REVIEWER_ACCOUNT_ID}}` | Atlassian account id assigned on `Code Review` / `Done` | as above | as above |
| `{{GITHUB_REPO}}` | `owner/repo` | `gh repo view --json nameWithOwner` | `pr-review-and-merge`, `release-engineer` |
| `{{DEPLOYED_URL}}` | **Production** URL — never a preview alias | your host's dashboard | `qa`, `release-engineer`, `sre-watch`, `perf-budget`, `test-strategy` |
| `{{DESIGN_FRAME_WIDTHS}}` | The design's real frame widths, e.g. `390 / 1440 / 1920` | read from the Local AI Bridge — do not invent | `design-system`, `qa`, `perf-budget`, `test-strategy` |
| `{{STORY_POINT_FIELD}}` | JIRA custom field id for story points, e.g. `customfield_10016` | `getJiraIssueTypeMetaWithFields` | `ba` |
| `{{JIRA_EMAIL}}` | Atlassian account email for REST-API basic auth | the account that owns `JIRA_API_KEY` | `developer-agent-ecosystem`, `ba` |
| `{{GITHUB_OWNER}}` | GitHub org or user that owns the repo | `gh repo view --json owner` | `pr-review-and-merge`, `developer-agent-ecosystem` |
| `{{GITHUB_REVIEWER_ACCOUNT}}` | GitHub login used for review/merge (pairs with `GITHUB_REVIEWER_TOKEN`) | your review account | `pr-review-and-merge`, `release-engineer` |
| `{{PROJECT_NAME}}` | Repo / project short name used in paths and examples | the repo directory name | most skills, in examples |
| `$REPO_ROOT` | **Absolute path to your local checkout** of the project repo | `git rev-parse --show-toplevel` from inside it | `developer-agent-ecosystem`, `qa`, `release-engineer`, `refactor-debt` |
| `FIGMA_READ_PATH` | **`bridge`** or **`figma-mcp`** — which Figma read path this machine uses. Set automatically at install; change it by hand if you switch. | see **Figma read path** below | `ba`, `qa`, `developer-agent-ecosystem`, `design-system` |
| `$LOCAL_AI_BRIDGE_HOME` | Absolute path to the Local AI Bridge install (a **separate app**, not shipped here — see the `local-ai-bridge` skill) | the directory containing its `server/` | `ba`, `qa`, `design-system`, `developer-agent-ecosystem`, `local-ai-bridge` |

## Paths

Two values are **absolute filesystem paths** and so use shell-variable form
(`$REPO_ROOT`, `$LOCAL_AI_BRIDGE_HOME`) rather than `{{...}}`, so a copy-pasted command
works the moment they are exported.

**No skill may ever hardcode an absolute path.** A path beginning `/Users/`, `/home/`, or
`C:\Users\` in a skill is a defect — it leaks the author's username and breaks for
everyone else. Use:

- `$REPO_ROOT` — the project checkout (`git rev-parse --show-toplevel`)
- `$LOCAL_AI_BRIDGE_HOME` — the bridge install
- `$HOME` — anything else under the home directory
- `/tmp/...` — scratch, which is portable already

`sync-skills.sh` refuses to publish the bundle if an absolute `/Users/<name>` path
reappears anywhere in it.

Export them before running any recipe that references them:

```bash
export REPO_ROOT="$(git rev-parse --show-toplevel)"
export LOCAL_AI_BRIDGE_HOME="$HOME/Local AI Bridge"
```

`$REPO_ROOT` is per-project: derive it from the repo you are actually working in rather
than trusting a stale saved value. If a skill needs it and it is unset, **ask** — or run
`git rev-parse --show-toplevel` when a checkout is already the working directory.

## Figma read path

`FIGMA_READ_PATH` decides how design facts are read, and **a skill must never ask which
to use** — it reads this key and proceeds.

| Value | Meaning | Set when |
|---|---|---|
| `bridge` | Local AI Bridge on `localhost:47291` | you installed the bridge |
| `figma-mcp` | the official `plugin:figma` MCP server | you declined the bridge at install |

Endpoint equivalence — the same facts, different transport:

| Need | `bridge` | `figma-mcp` |
|---|---|---|
| Design tokens / variables | `GET /api/variables` | `get_variable_defs` |
| Frame list and structure | `GET /api/frames`, `/api/document` | `get_metadata` |
| Per-node CSS, layout, fills | `GET /api/node/:id/context`, `/css` | `get_design_context` |
| Vector asset export | `GET /api/node/:id/svg` | `download_assets` |
| Rendered image | bridge screenshot endpoints | `get_screenshot` |

**Switching.** Edit the key in `project-config.local.md`. Set it to `bridge` after
installing the bridge manually, or `figma-mcp` to stop using the bridge. Nothing else
needs changing, and no skill re-prompts.

**If the key is missing entirely**, prefer `bridge` when
`curl -s --max-time 2 http://localhost:47291/api/whoami` succeeds, otherwise `figma-mcp`
— then tell the user which you chose and offer to record it. Do not interrogate them.

**Neither available** — bridge unreachable and no Figma MCP configured: **halt and say
so.** Never estimate a design value. That is invariant 13.

## How a skill must ask

When a value is unresolved, ask plainly, once, and only for what the current task needs:

> I need `{{DEPLOYED_URL}}` before I can run this — QA/soak/perf evidence comes from the
> deployed production URL only, never localhost or a preview alias. What is it?
> (I'll save it to `project-config.local.md` so I stop asking.)

Rules:

- **Ask only for what this run needs.** Do not interrogate the user through the whole
  table to answer one question.
- **Batch when several are needed at once** — one message, not five round trips.
- **Never proceed on a guess.** A wrong account id silently misassigns tickets; a wrong
  URL silently grades the wrong site. Both are worse than stopping.
- **`{{DESIGN_FRAME_WIDTHS}}` is read from the Local AI Bridge, not from the user's
  memory.** Ask only if the bridge is unreachable, and label the answer as unverified.
- **Offer to save, do not save silently.** Writing a config file is a side effect the
  user should see.

## Template

```markdown
# project-config.local.md   (local only — never committed, never bundled)

- ATLASSIAN_SITE: acme.atlassian.net
- JIRA_PROJECT_KEY: ENG
- JIRA_DEV_ACCOUNT_ID: 000000:00000000-0000-0000-0000-000000000000
- JIRA_REVIEWER_ACCOUNT_ID: 000000:00000000-0000-0000-0000-000000000000
- GITHUB_REPO: acme/web
- DEPLOYED_URL: https://acme.example.com
- DESIGN_FRAME_WIDTHS: 390 / 1440 / 1920
- STORY_POINT_FIELD: customfield_10016
- JIRA_EMAIL: you@example.com
- GITHUB_OWNER: acme
- GITHUB_REVIEWER_ACCOUNT: acme-reviewer
- PROJECT_NAME: web
- FIGMA_READ_PATH: bridge          # or figma-mcp
- REPO_ROOT: /absolute/path/to/your/checkout
- LOCAL_AI_BRIDGE_HOME: /absolute/path/to/Local AI Bridge
```

Multiple projects: keep one block per project under a `## <project>` heading and tell
the skill which project you are working on.
