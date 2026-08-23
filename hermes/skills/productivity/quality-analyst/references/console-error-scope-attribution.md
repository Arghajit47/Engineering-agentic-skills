# Console Error Scope Attribution

When a Frontend or Integration QA run reports console errors on the live page, the QA agent MUST determine whether the error originates from the ticket under test or from a pre-existing component.

## Fast triage

1. Reproduce the page load with Playwright and capture failing URLs:
   ```ts
   page.on('response', res => { if (res.status() === 404) failingUrls.push(res.url()); });
   page.on('requestfailed', req => failingUrls.push(req.url()));
   ```
2. If the failing URL is an RSC prefetch (`?_rsc=...`) for a route linked by the global Navbar/Footer (e.g. `/about`, `/services`, `/contact`), it is a pre-existing navigation-scope defect, not a defect in the section under test.
3. If the error is tied to a new asset, fetch, or DOM node introduced by the ticket under test, it is in-scope.

## How to report

- In-scope error: FAIL the relevant test case, transition ticket back to In Progress, file bug report.
- Out-of-scope error: PASS the test case with a note naming the originating component/ticket, the failing URLs, and the recommended owner ticket. Do not block the current ticket for another component's missing pages.

## Example note for QA comment

> TC-007 PASS with note: 3 RSC prefetch 404s for `/about`, `/services`, `/contact` originate from pre-existing Navbar links (KAN-14 scope), not from KAN-17. Current ticket anchors use `#services/...` and do not trigger 404s.

## Reference

Next.js App Router prefetches RSC payloads for `<Link>` components. When the target page does not exist, the prefetch request returns 404 and logs a console error. The fix is to create the missing pages or remove the links — both are outside the scope of a section-level Frontend ticket that does not own the navigation bar.
