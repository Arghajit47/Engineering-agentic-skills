# Integration QA: hydration mismatch check

Integration tickets that wire a client component to a new SWR-backed API hook are a repeated source of React hydration mismatches. This reference records the detection recipe and the expected fix shape so future QA passes catch it before signing off.

## When to run this check

- Integration scope ticket.
- The implementation introduces or uses `useSWR`, `useQuery`, `useEffect`-driven fetch, or any hook whose initial state differs between server render and first client paint.
- The page is statically rendered or server-rendered (not a pure CSR route).

## Detection recipe

Use Playwright against the **live deployment** or a local production build (`npm run build && npx next start`). `next dev` suppresses or softens some hydration checks.

```ts
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];

page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', err => errors.push(err.message));

await page.goto(TARGET_APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(3000);

const hydrationErrors = errors.filter(e => e.includes('418') || e.toLowerCase().includes('hydration'));
console.log({ hydrationErrors, totalErrors: errors.length });
```

A result containing `Minified React error #418` is a FAIL for the "no console errors" / "no hydration errors" test case.

## Why the mismatch happens

SWR returns `isLoading: false` with `data: undefined` during SSR because the SWR key is `null` (or the fetcher never runs server-side). On the first client render the key becomes a real URL, so SWR returns `isLoading: true`. The component then renders a skeleton instead of the server-rendered fallback content. React sees different HTML/text and raises #418.

## Expected fix shape

The integration developer should add a mount guard so the first client paint matches the server output. After mount, the real SWR state takes over.

```tsx
import { useSyncExternalStore } from "react";

const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false,
);

const heroData = mounted ? hero : null;
const heroIsLoading = mounted ? isLoading : false;
```

This is the same pattern used to fix hydration mismatches in `Navbar.tsx`/`Footer.tsx` for KAN-14/KAN-15 and in `src/app/page.tsx` for KAN-16.

## Verification after fix

1. Re-run the Playwright hydration check — zero #418 / hydration errors.
2. Confirm the component still shows the loading skeleton shortly after mount (throttle the connection or use a slow 3G preset if you want visual confirmation).
3. Confirm live API data still appears once SWR resolves.
4. Run the full verification stack: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, ESLint on changed files.

## Note on transient 404s

Next.js may prefetch RSC payloads for routes that do not exist (`/contact`, `/services`, `/about`). These show as `Failed to load resource: 404` in the console but are not actual broken assets. Verify by checking the failing URLs: if they are `?_rsc=...` fetch payloads for missing routes, they are unrelated to the integration ticket. The real console-error test case should still focus on #418, uncaught exceptions, and broken image/assets.
