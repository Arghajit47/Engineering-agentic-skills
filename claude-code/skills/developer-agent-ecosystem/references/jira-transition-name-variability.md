# JIRA Transition Name Variability

## Problem

The `developer-agent-ecosystem` skill uses a canonical JIRA Status Transitions table with names like "Code Review" and "In Testing". However, JIRA projects can use custom workflow transition names. For example, the Banking Company project (`BC`) on `{{ATLASSIAN_SITE}}` uses "In Review" instead of "Code Review".

If you call `mcp_jira_jira_transition_issue` with the canonical name and get:

```
Transition 'Code Review' not available. Available: To Do, In Progress, In Review, Done
```

## Fix

Use the exact transition name the target project exposes. Do not retry the canonical name. Query available transitions when in doubt.

```bash
# Via JIRA REST API
JIRA_EMAIL=...
JIRA_API_KEY=...
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  "https://{{ATLASSIAN_SITE}}/rest/api/3/issue/{KEY}/transitions" \
  | python3 -c "import sys,json; [print(t['name']) for t in json.load(sys.stdin)['transitions']]"
```

Then transition with the matching name:

```ts
mcp_jira_jira_transition_issue({ issue_key: "BC-64", transition_name: "In Review" });
```

## BC project workflow specifics (observed 2026-08-08)

For the Banking Company project, the complete workflow is:

```
To Do → In Progress → In Review → In Testing → Done
```

| Logical state | BC transition name | Notes |
|---|---|---|
| MR raised / ready for review | `In Review` | NOT `Code Review`. |
| QA handoff after merge | `In Testing` | Reachable from `In Review`. |
| Final state after QA pass | `Done` | Do NOT move directly from `In Review` to `Done`; it skips QA. |

## Assignee rules per transition

- In Progress / In Testing → Developer (`{{JIRA_DEV_ACCOUNT_ID}}`)
- In Review / Done → Reviewer (`{{JIRA_REVIEWER_ACCOUNT_ID}}`)

Always update assignee immediately after a transition, even when the transition itself failed on the first attempt.

## Practice

When the canonical transition name fails once, immediately switch to the project-specific name. Do not assume the skill table is authoritative for the current project. After code-review merge, transition the parent to `In Testing` and invoke `Skill(skill="quality-analyst", args="{JIRA_KEY}")`. Only move to `Done` after QA passes.
