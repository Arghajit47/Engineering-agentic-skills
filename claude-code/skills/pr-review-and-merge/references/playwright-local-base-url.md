# Playwright Pre-Merge Verification: Use a Local Server, Not the Deployed URL

> **Scope — read this before applying the recipe.** This is a **pre-merge** recipe and it
> is the *only* stage that runs against a local server. It does not contradict the
> deployed-URL-only gate; it precedes it.
>
> | Stage | Target | Why |
> |---|---|---|
> | `/pr-review-and-merge` (pre-merge) | **local build of the branch** | the branch is not deployed yet — the deployed site still carries the old build, so it cannot be evidence for this diff |
> | `/release`, `/quality-analyst`, `/perf-budget`, `/sre` (post-merge) | **deployed URL only — never localhost** | absolute gate; a local run hides missing untracked assets, image optimisation, and font loading |
>
> Never cite a local run as QA evidence, and never cite a deployed run as pre-merge
> evidence for an unmerged branch.

## Problem

Many test-automation packages hardcode `BASE_URL` to the production deployment in
`test-automation/constants/index.ts` or `.env`:

```ts
export const BASE_URL = process.env.BASE_URL || "{{DEPLOYED_URL}}";
```

If you run Playwright for pre-merge verification using the default value, the
browser hits the deployed site, which still carries the old build. The test may
pass when the bug is already fixed locally, or fail because the deployed code is
stale. Neither outcome is valid evidence for the MR under review.

## Recipe

1. Build and start the local app on the branch being reviewed:

```bash
cd /path/to/repo
npm run build
npm start -- --port 3000
```

2. In a separate terminal, run the automation suite with `BASE_URL` overridden:

```bash
cd test-automation
BASE_URL=http://localhost:3000 npx playwright test specs/frontend-integration-test/home-page.spec.ts --reporter=line
```

3. Capture the real pass/fail count in the review comment and state the override
explicitly:

```markdown
| Check | Result |
|---|---|
| Playwright home-page.spec.ts (BASE_URL=http://localhost:3000) | 5/5 PASS |
```

## When the deployed URL is acceptable

Only after the MR is merged and the deployment has finished building. For the
code-review verdict, the local server is the only valid target.

## Common pitfall

Running Playwright without `BASE_URL` and assuming the default URL exercises the
branch. It does not — it exercises whatever was deployed before the branch.

## Origin

This was missed during the KAN-52 review until a re-run against localhost
revealed the actual hydration behavior. The KAN-82 fix was verified correctly
only after overriding `BASE_URL`.
