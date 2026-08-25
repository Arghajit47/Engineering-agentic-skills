## Release — {{TICKET_KEY}} · {{VERSION}}

:::success Deploy verified to carry the merge commit
:::

### Gates
| Gate | Command | Result |
|---|---|---|
| Pre-merge CI | `gh pr checks {{PR}}` | {{CI_RESULT}} |
| Post-merge run | `gh run watch {{RUN_ID}} --exit-status` | {{RUN_RESULT}} |
| Deploy carries commit | `curl … \| grep -c '{{ADDED_TOKEN}}'` | {{ADDED_COUNT}} — must be ≥ 1 |
| Stale token gone | `curl … \| grep -c '{{REMOVED_TOKEN}}'` | {{REMOVED_COUNT}} — must be 0 |

### Deployed
| Field | Value |
|---|---|
| SHA | `{{SHA}}` |
| URL | {{DEPLOYED_URL}} |
| Tag | {{VERSION}} |

### Rollback
| Step | Action |
|---|---|
| Revert | `git revert -m 1 {{MERGE_SHA}}` then PR |
| Redeploy | previous good SHA `{{PREV_SHA}}` |
| Migrations | {{MIGRATION_DOWN}} |
| Blast radius | {{BLAST_RADIUS}} |
