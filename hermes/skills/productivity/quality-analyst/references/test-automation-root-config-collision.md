# test-automation Package — Root Config Collision Recipe

When a repo has a Next.js (or similar) root project and a separate `test-automation/` package with its own path aliases, the root `tsconfig.json` and `eslint.config.*` can accidentally compile/lint the sub-package. This causes `Cannot find module '@pages/...'` errors and Husky pre-commit failures.

## Symptom

- `npx tsc --noEmit` from the root reports:
  ```
  test-automation/pages/frontend/home-page.ts(4,35): error TS2307: Cannot find module '@locators/homepage-locators' or its corresponding type declarations.
  test-automation/specs/backend-test/api-endpoints.spec.ts(1,22): error TS2307: Cannot find module '@fixtures/api-fixtures' or its corresponding type declarations.
  ```
- ESLint pre-commit fails on `test-automation/base/api-base.ts` with `Unexpected any` because the root Next.js/TypeScript rules apply to the sub-package.

## Root cause

- Root `tsconfig.json` has `"include": ["**/*.ts", ...]` and only maps `"@/*": ["./src/*"]`.
- `test-automation/tsconfig.json` maps `"@pages/*": ["./pages/*"]`, `"@base/*": ["./base/*"]`, etc.
- When the root compiler includes `test-automation/**/*.ts`, it tries to resolve sub-package aliases against the root `paths`, which fail.

## Fix

1. **Exclude `test-automation/` from root `tsconfig.json`:**
   ```json
   {
     "exclude": ["node_modules", "test-automation"]
   }
   ```

2. **Exclude `test-automation/` from root ESLint config:**
   ```js
   import { globalIgnores } from "eslint/config";

   const eslintConfig = defineConfig([
     ...nextVitals,
     ...nextTs,
     globalIgnores([
       ".next/**",
       "out/**",
       "build/**",
       "next-env.d.ts",
       "test-automation/**",
     ]),
     ...storybook.configs["flat/recommended"]
   ]);
   ```

3. **Type-check and lint the sub-package inside its own directory:**
   ```bash
   cd test-automation
   npx tsc --noEmit
   # run Playwright tests here too
   BASE_URL={{DEPLOYED_URL}} npm run test
   ```

## When to apply

- Any repo where `test-automation/` has its own `tsconfig.json` with different `paths` than the root.
- When adding the first automation spec to a project that previously had no root `test-automation/` exclude.
- When Husky pre-commit starts flagging `any` types or unused variables in pre-existing automation skeleton files.

## Related

- See `references/bc6-automation-skeleton-reuse.md` for the broader BC-6 automation lesson (domain-constant drift, branch naming, skeleton reuse).
- See `pr-review-and-merge/references/bulk-github-pr-review-comment-resolution.md` for resolving the 30+ review comments that domain-constant drift can trigger.
