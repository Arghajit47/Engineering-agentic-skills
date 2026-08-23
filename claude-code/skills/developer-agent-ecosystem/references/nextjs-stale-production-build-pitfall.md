# Stale Next.js Production Build Pitfall

## Problem

`npm start` serves the contents of `.next/`, the directory produced by the last `npm run build`. If you change a component, run unit tests, and then launch `npm start` without rebuilding, the local server returns the **old** production build. Playwright tests against `http://localhost:3000` then exercise stale HTML/CSS/JS, even though the source files are correct.

Symptoms:
- Playwright selectors for new classes/elements timeout (the old build doesn't have them).
- The page visually looks like the pre-change version in screenshots.
- `assertNoConsoleErrors` may fail because the old build's hydration logic is still running.

## Reproduction

1. Build once: `npm run build`.
2. Edit a component (add a class, change layout, add a data-testid).
3. Run `npm start` and open `http://localhost:3000`.
4. Observe the change is missing until `npm run build` is rerun.

## Fix

Always rebuild before serving the local production server for Playwright or manual visual verification:

```bash
npm run build
npm start
```

If you already have a server running:

```bash
# kill the running server, then:
npm run build
npm start
```

`next dev` does not have this problem (it recompiles on the fly), but Playwright pre-merge evidence should run against a production build to catch build-only issues like image allowlist errors, static generation failures, or hydration mismatches that `next dev` hides.

## Real case

KAN-82 and KAN-90 in the Estatein repo: after patching `FeaturedProperties`/`Testimonials`, the first Playwright run against `npm start` failed because `.next/` still contained the pre-fix build. After `npm run build` the suite passed 5/5.

## Checklist

- [ ] `npm run build` executed after the final source change.
- [ ] Server started only after the build completed.
- [ ] Playwright `BASE_URL=http://localhost:3000` run uses the freshly built output.
