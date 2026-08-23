# Husky branch + commit-message guard

This project's Husky hooks enforce strict branch and commit conventions. The
senior-dev workflow must create branches and commits that pass these hooks,
otherwise commits and pushes are blocked.

## Branch name template (mandatory)

Branches must match one of:

- `Fix/<JIRA_KEY>/<Component_name>`
- `Automation/<JIRA_KEY>/<Component_name>`

Examples:

- `Fix/BC-64/Initial-Project-Setup`
- `Fix/KAN-9/Login-Form`
- `Automation/KAN-15/Dashboard-Header`

Rules:

- `<JIRA_KEY>` is uppercase letters, hyphen, digits (e.g. `BC-64`).
- `<Component_name>` is PascalCased; use hyphens inside the name if needed.
- No spaces, no underscores, no legacy `<JIRA_KEY>-<PAGE>-<SECTION>-<SCOPE>` format.

## Commit message template (mandatory)

The commit message must match:

```
<JIRA_KEY> <lowercase summarized message>
```

Examples:

- `BC-64 initial project setup`
- `KAN-9 add login form with email validation`

Rules:

- Must start with the same `<JIRA_KEY>` extracted from the current branch name.
- Single space after the key.
- Message body starts with a lowercase letter.
- No period at the end.
- Single line; no multi-line commit bodies unless explicitly needed.

## Where the guard lives

- `.husky/pre-commit` validates branch name + first commit message line, then runs `lint-staged`.
- `.husky/pre-push` blocks pushes from `main`, validates branch name, then runs `lint-staged`.

## Practical workflow impact

When the project has these hooks installed:

1. Create a compliant branch immediately after analyzing the ticket — before any file changes are committed. The branch name is validated at commit time, so creating it early avoids a later rename.
2. Use the legacy `git checkout -b <JIRA_KEY>-<PAGE>-<SECTION>-<SCOPE>` format only if the project has NOT adopted this Husky guard.
3. On every commit, run:
   ```bash
   git commit -m "<JIRA_KEY> <lowercase summarized message>"
   ```
4. If a branch was created with the wrong name, rename it before committing:
   ```bash
   git branch -m Fix/<JIRA_KEY>/<Component_name>
   git push -u origin Fix/<JIRA_KEY>/<Component_name>
   ```
5. If a GitHub PR already points to the old branch head, update the PR head via the GitHub API:
   ```bash
   gh api repos/<owner>/<repo>/pulls/<PR_NUMBER> -X PATCH -f head=Fix/<JIRA_KEY>/<Component_name>
   ```
   The `gh pr edit --head` CLI flag does not reliably change the PR head; use the REST API call above. This was confirmed during BC-1 when `gh pr edit 1 --head Fix/BC-64/Initial-Project-Setup` returned help text while the REST API call succeeded.
6. After renaming a branch and updating the PR head, verify the PR reflects the new branch:
   ```bash
   gh pr view <PR_NUMBER> --json url,headRefName,baseRefName,reviewRequests
   ```
7. Ensure the new branch name is pushed to origin before updating the PR head, otherwise GitHub will show a "missing head" error.

## Common pitfall: branch renamed after an open PR

If you commit and push on a non-compliant branch, then realize the branch name is wrong and rename it, the existing PR still points at the old branch name. Pushing the renamed branch alone will not move the PR head. You must explicitly update the PR head via the GitHub REST API (step 5 above). The CLI `gh pr edit --head <new_branch>` often silently fails or returns help text; always use the API call.

## Common pitfall: pre-commit hook tested manually without a commit message file

`husky/pre-commit` receives the commit message file path as `$1` from Git. When testing the hook by running `sh .husky/pre-commit` with no argument, `$commit_msg_file` is empty and the script must skip commit-message validation to avoid `head: : No such file or directory`. The templates handle this by setting `commit_msg=""` when the file is missing. Do NOT assume the file is always present.

## When the guard was introduced

Introduced in the Banking Company (`{{PROJECT_NAME}}`) repo for BC-64. Treat this
as the canonical project convention unless a later project explicitly uses a
different format.

## Files in the skill library

- `templates/husky-pre-commit.sh` — ready-to-drop pre-commit hook
- `templates/husky-pre-push.sh` — ready-to-drop pre-push hook
- `templates/package-lint-staged.json` — snippet for `package.json` scripts/config
