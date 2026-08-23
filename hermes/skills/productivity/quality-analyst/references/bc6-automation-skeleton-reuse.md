# BC-6 Automation Lesson — Reusing a Pre-existing `test-automation/` Skeleton

## Context

Ticket BC-6 was an Integration ticket: wire the existing Navbar to consume the new `GET /api/auth/status` endpoint via SWR. After the manual Integration QA pass, the Automation SDET step had to add Playwright coverage.

The repo already contained a `test-automation/` package with base classes, constants, fixtures, and path aliases. The correct approach was to extend that skeleton rather than invent a parallel structure.

## Mistakes made

1. Did not inspect the skeleton first. Initially created files without reading `base/ui-base.ts`, `base/api-base.ts`, or the existing `fixtures/api-fixtures.ts`. This led to writing fixture functions with parameter names that the repo's ESLint `react-hooks/rules-of-hooks` flagged (`use`, `useFn`).
2. Did not follow the local POM layering immediately. Tried to use generic Playwright patterns instead of the existing `InitializationPage` helpers and `ApiHelper` assertions.
3. Almost pushed to `main`. Created and committed on `main` before realizing the Automation SDET rule requires a branch.
4. Copied real-estate property/review/service schemas into the banking project because they were in the template. The user left 30+ review comments flagging them as irrelevant. Had to strip `api-constants.ts`, `homepage-constants.ts`, and `constants/index.ts` down to banking-only values and set `BASE_URL` to `{{DEPLOYED_URL}}`.
5. Skipped In Testing / Automation SDET workflow and moved BC-6 directly to Done. The user forced a revert back to In Testing and proper Automation PR flow.
6. Replied to review comments but did not mark them resolved. A reply alone leaves GitHub review threads open; they must be resolved via GraphQL `resolveReviewThread` (see `pr-review-and-merge/references/resolve-review-threads-graphql.md`).

## Correct pattern

1. Verify parent ticket is in **In Testing** before starting Automation SDET work.
2. Read `test-automation/INSTRUCTIONS.md`.
3. List the package skeleton: `find test-automation -type f | sort`.
4. Read existing base classes (`base/ui-base.ts`, `base/api-base.ts`).
5. Extend only the missing layers (locators, pages, specs, fixtures) using the repo's conventions and path aliases.
6. Strip any pre-existing irrelevant domain constants from the template/project skeleton; set `BASE_URL` to the current project's live deployment URL; verify `/api/*` with `curl`.
7. Name fixture callbacks `fixtureUse` to avoid `react-hooks/rules-of-hooks` false positives.
8. Check root `tsconfig.json` / `eslint.config.*`: if the root Next.js config includes `test-automation/**/*.ts` with `@/*` aliases only, exclude `test-automation/**` from root and type-check/lint inside the sub-package.
9. Run `npx tsc --noEmit` (in `test-automation/`) and `BASE_URL=http://localhost:3000 npm run test`.
10. Create branch `Automation/{QA_SUBTASK_KEY}/{feature}` (never the parent key), open PR, halt for approval.

## Resolving many PR review comments via GitHub API

When a PR accumulates 20+ inline comments, the browser UI is impractical. Use the two GitHub endpoints and reply programmatically:

```python
import requests, json, os

with open(os.path.expanduser('~/.env')) as f:
    token = [l.split('=',1)[1].strip() for l in f if l.startswith('GITHUB_TOKEN=')][0]

headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': f'Bearer {token}',
    'X-GitHub-Api-Version': '2022-11-28'
}

owner, repo, pr = '{{GITHUB_OWNER}}', '{{PROJECT_NAME}}', 10

# Conversation comments (PR is an issue under the hood)
conv = requests.get(
    f'https://api.github.com/repos/{owner}/{repo}/issues/{pr}/comments',
    headers=headers
).json()

# Inline code-review comments
review = requests.get(
    f'https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/comments',
    headers=headers
).json()

reply_body = "Resolved: ..."
for c in review:
    requests.post(
        f'https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/comments',
        headers=headers,
        json={'in_reply_to': c['id'], 'body': reply_body}
    )
```

Then resolve every thread via GraphQL. See `pr-review-and-merge/references/resolve-review-threads-graphql.md`.

## Verification commands

```bash
cd test-automation
npx tsc --noEmit
BASE_URL=http://localhost:3000 npx playwright test --project=backend-test
BASE_URL=http://localhost:3000 npx playwright test --project=frontend-integration-test
BASE_URL={{DEPLOYED_URL}} npm run test
```

## Root config collision

If root Next.js `tsconfig.json` or `eslint.config.mjs` covers `test-automation/` but lacks the sub-package aliases, exclude it:

```json
// tsconfig.json
"exclude": ["node_modules", "test-automation"]
```

```ts
// eslint.config.mjs
globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "test-automation/**"])
```

Then run all validation inside `test-automation/` using its own `tsconfig.json`.
