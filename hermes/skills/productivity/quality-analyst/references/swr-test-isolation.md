# SWR Test Isolation for Integration QA

When a page under test uses `useSWR` from `swr`, the global SWR cache is shared across renders by default. In React Testing Library, this causes state leakage between tests: a previous test's fetched data can reappear in a later test, or a mocked error can persist past `vi.clearAllMocks()`.

## Symptom

- Error-state test passes in isolation but fails when run after a happy-path test.
- `screen.getByText()` finds duplicate text because cached data from a prior render is still mounted.
- `fetcher` mock call counts are higher than expected because SWR revalidates cached keys.

## Fix

Wrap the component under test in an `SWRConfig` with a fresh provider per test:

```tsx
import { SWRConfig } from "swr";
import { render } from "@testing-library/react";

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PropertyDetailsPage />
    </SWRConfig>
  );
}
```

Use `renderPage()` in every test instead of rendering the component directly.

## Additional rules

- Use `vi.resetAllMocks()` in `beforeEach`, not just `vi.clearAllMocks()`, so mocked `fetcher` implementations are fully replaced between tests.
- For duplicate text queries, prefer `getByTestId` on the specific container (e.g. the page header) instead of `getByText`.
- For retry tests, assert on the presence/absence of test IDs rather than exact text strings shared between components.

## Example test skeleton

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/lib/api", () => ({ fetcher: vi.fn() }));
import { fetcher } from "@/lib/api";
const mockFetcher = vi.mocked(fetcher);

describe("SWR-backed page integration", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => cleanup());

  it("loads", async () => {
    mockFetcher.mockResolvedValue({ title: "Home" });
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Page />
      </SWRConfig>
    );
    await waitFor(() => expect(screen.getByTestId("page-title")).toHaveTextContent("Home"));
  });
});
```
