# Running two implementation agents in parallel with git worktrees

Used through BC-165 → BC-188 to work two tickets at once in one repo without the agents
colliding on the index or on each other's files.

## Setup

```bash
cd ~/Code/{{PROJECT_NAME}}
git worktree add /tmp/bcA-wt -b Fix/BC-186/Hero-Sections main
git worktree add /tmp/bcB-wt -b Fix/BC-188/Page-Padding  main

# node_modules is large and identical — symlink, don't reinstall
ln -s ~/Code/{{PROJECT_NAME}}/node_modules /tmp/bcA-wt/node_modules
ln -s ~/Code/{{PROJECT_NAME}}/node_modules /tmp/bcB-wt/node_modules
```

Give each agent its worktree path and tell it explicitly not to `cd` to the main checkout.

## The one real gotcha: the `storybook` vitest project fails inside a worktree

`vitest.config.ts` defines multiple projects. The `storybook` project resolves its Vite root
relative to the real repo path and fails from a worktree. Run the unit project only:

```bash
npx vitest run --project unit        # ✅ inside a worktree
npx vitest run                       # ❌ storybook project errors
```

Full-suite runs stay on the main checkout. Note in the PR which command produced the count
so the reviewer compares like with like (589 `--project unit` vs a full-suite number are
different figures and the discrepancy will otherwise read as a regression).

## Teardown — before removing, unlink node_modules

```bash
rm -f /tmp/bcA-wt/node_modules /tmp/bcB-wt/node_modules   # remove the SYMLINK first
git worktree remove --force /tmp/bcA-wt
git worktree remove --force /tmp/bcB-wt
git worktree list                                          # confirm only the main checkout
```

Removing the worktree with the symlink in place risks the removal following it into the real
`node_modules`. Unlink first, always.

## Husky branch-name guard interacts with this

The repo's hook enforces `Fix/<JIRA_KEY>/<Component_name>`. Two consequences:

- A PR covering **two** tickets still gets one key in the branch name — pick the primary and
  say so in the PR body (`Fix/BC-186/Hero-Sections` carried BC-186 + BC-187).
- Never commit on a temporary `pr-<N>` review branch; the hook rejects the name.

## Keeping long agent runs alive

Two dispatched agents stalled mid-run when the machine slept. Arm caffeinate before long
parallel work:

```bash
caffeinate -dimsu -t 5400 &
```

If an agent stalls anyway, do not re-dispatch the whole ticket — verify what already landed
(`git log`, `gh api .../pulls`) and resume from the first incomplete step.
