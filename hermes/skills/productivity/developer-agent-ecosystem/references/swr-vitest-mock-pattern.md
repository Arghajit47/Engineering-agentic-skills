# SWR Vitest Mock Pattern

Session: BC-6 integration — wiring `Navbar.tsx` to `useAuthStatus` SWR hook.
Problem: `vi.mock("@/lib/auth", () => ({ useAuthStatus: vi.fn(() => ...) }))` fails with hoisting/timing errors because `vi.fn()` is referenced before initialization.

## Working Pattern

Keep a mutable mock object declared at module top level, let `vi.mock` return a closure that reads it, and mutate the object per test.

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";
import { Navbar } from "./Navbar";

const mockAuthLoggedOut = {
  data: { isLoggedIn: false, user: null },
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
};

const mockAuthLoggedIn = {
  ...mockAuthLoggedOut,
  data: { isLoggedIn: true, user: { name: "Jane", avatarUrl: null } },
};

let currentMock = mockAuthLoggedOut;

vi.mock("@/lib/auth", () => ({
  useAuthStatus: () => currentMock,
}));

const renderWithSWR = (ui: React.ReactNode) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), suspense: false }}>
      {ui}
    </SWRConfig>
  );

afterEach(() => {
  cleanup();
  currentMock = mockAuthLoggedOut;
});

describe("auth state", () => {
  it("shows login when logged out", () => {
    renderWithSWR(<Navbar />);
    expect(screen.getByTestId("nav-login")).toBeTruthy();
  });

  it("shows user info when logged in", () => {
    currentMock = mockAuthLoggedIn;
    renderWithSWR(<Navbar />);
    expect(screen.getByTestId("nav-user")).toBeTruthy();
    expect(screen.getByText("Jane")).toBeTruthy();
  });
});
```

## Why this works

- `vi.mock` is hoisted; the factory must not reference variables defined later in the file. The factory references `currentMock`, which is declared before `vi.mock`.
- Per-test mutation happens before render, so each test sees its desired state.
- `afterEach` resets `currentMock` to avoid leakage.
- `SWRConfig` with `provider: () => new Map()` isolates SWR cache between tests.

## Pitfalls

- `vi.mocked(useAuthStatus).mockReturnValue(...)` is clean only when the module is imported after the mock. With path aliases (`@/lib/auth`), use the mutable-object pattern instead.
- Do not put `vi.fn()` return values with complex shapes directly inside the `vi.mock` factory if they are defined below; hoisting breaks it.
- If the hook returns more fields (e.g. SWR's full `mutate`, `isValidating`), mirror them in the mock object to keep TypeScript happy.
