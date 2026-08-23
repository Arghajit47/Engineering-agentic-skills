# Developer-Agent Pitfalls — Post-Session Additions

This file captures real-world failures from production sprints that were not already covered by the main skill body. Refer to it when running `/developer` on any ticket.

## Sub-agent leaves work incomplete or on the wrong branch

Even when a sub-agent is dispatched, the main agent must verify the actual state of the repo before assuming the pipeline is done. In practice the sub-agent may exit early, leave changes uncommitted, push to a different branch, or fail silently. The main agent MUST:

1. Check the current branch (`git branch --show-current`) and working tree (`git status --short`) after the sub-agent returns.
2. If the sub-agent did not create the expected feature branch, check out `main`, pull latest, and create it manually.
3. If code exists but is uncommitted, run the verification gates (`tsc --noEmit`, `npm test`, `npm run build`, `npx eslint`) and commit/push/MR yourself.
4. Do NOT transition the JIRA ticket to Code Review until the branch, commit, push, and MR URL are confirmed.

Treat any incomplete handoff the same way: the main agent owns the final DOD and MR gate.

Real case: KAN-37 integration ticket. The Integration Developer sub-agent was dispatched but did not finish commit/push/MR. The main agent found itself on a stale `Automation/KAN-84/...` branch with uncommitted changes. It had to switch to `main`, create `KAN-37-Property-Details-Pricing-Contact-Integration`, verify the integration code, fix the tests, and raise the MR.

## Integration tests with multiple `fetch` endpoints need URL-aware mocks

When a page or component calls more than one HTTP endpoint (e.g. one SWR fetcher for property details + a second `fetch` for pricing + a third `fetch` for a form submission), mocking `global.fetch` with a single return value or `mockResolvedValueOnce` causes endpoints to receive each other's response shapes. This manifests as a React error-boundary crash deep inside a component that expects `data.breakdown` but receives `{ success, data: { id: 1 } }` from the wrong mock.

Fix: make the `global.fetch` mock route by URL:

```ts
global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
  const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
  if (urlString.includes("/api/contact/property")) {
    return Promise.resolve({ ok: true, json: async () => ({ success: true, message: "Submitted" }) });
  }
  if (urlString.includes("/api/properties/") && urlString.endsWith("/pricing")) {
    return Promise.resolve({ ok: true, json: async () => MOCK_PRICING });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
});
```

Real case: KAN-37 `src/app/properties/[slug]/__tests__/page.test.tsx`. The inquiry-form tests overrode `global.fetch` to return the contact submission response, but the pricing SWR call fired afterward and received that shape, crashing `PricingBreakdown` with `Cannot read properties of undefined (reading 'listing')`.

## Other durable reminders

- Always run `git branch --show-current` before assuming the sub-agent's branch is checked out.
- Always run the full verification gate (tsc, test, build, eslint) yourself before raising the MR.
- Never transition a ticket to Code Review without a confirmed MR URL.
