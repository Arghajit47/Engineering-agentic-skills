# React/Next.js hydration mismatch detection and fix

Session-proven recipe for a class of bugs that otherwise pass normal DOM
audits: the client first render differs from the SSR HTML and React logs a
hydration mismatch.

## When to suspect

- Browser console shows `Minified React error #418` in production, or the dev
  message: "Hydration failed because the server rendered HTML didn't match the
  client."
- The page *looks* correct after a flash, and `document.querySelector` against
  the hydrated DOM shows the right content.
- A normal post-load DOM audit passes, because the audit runs after hydration
  has already reconciled.

## Detection

Always run a real production build and capture `pageerror` / `console.error`
with Playwright (or equivalent) before signing off a frontend QA round. `next
start`, not `next dev` — dev error text is clearer, but production is the
source of truth.

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("console", lambda msg: msg.type == "error" and errors.append(msg.text))
    page.goto("http://localhost:3001", wait_until="load")
    page.wait_for_timeout(3000)
    print("Hydration errors:", [e for e in errors if "Hydration" in e or "418" in e])
    browser.close()
```

## Common root cause in this codebase

Client components that use `useSWR` or similar data-fetching hooks. During SSR
SWR has no key (or returns no data), so the server renders a fallback. On the
client the first render has `isLoading=true`, so the component renders loading
skeletons instead of the same fallback. The text/content differs → React #418.

## Minimal fix: `useSyncExternalStore` mount guard

Render the same content the server rendered on the first client pass, then
switch to the dynamic SWR-driven UI after hydration.

```tsx
import { useSyncExternalStore } from "react";

const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false,
);

const showSkeleton = mounted && isLoading;

// use `showSkeleton` in the render branch, not raw `isLoading`
```

Why `useSyncExternalStore` and not `useEffect`? It is the canonical React hook
for reading a value that differs between server and client; it suppresses the
hydration warning for the mount state without extra effect timing gymnastics.

## Verification

1. `npx tsc --noEmit` clean.
2. `npm run build` clean.
3. `npx next start -p 3001` and run the Playwright detection script above.
4. Confirm zero hydration errors.
5. Confirm the component still switches to skeleton/live data after the page
   finishes mounting (a quick 0.5s throttle is enough to see the hand-off).

## Why this matters for QA

DOM-only checks miss this bug. A frontend QA pass must include a console-error
audit on a production build, or hydration mismatches will reach users.
