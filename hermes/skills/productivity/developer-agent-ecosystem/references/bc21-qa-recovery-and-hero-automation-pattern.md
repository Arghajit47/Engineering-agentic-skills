# BC-21 QA Recovery + Hero Section Automation Pattern

Session artifact: BC-21 [Integration] Home Page Hero Section.

## Why this reference exists

- The `quality-analyst` sub-agent falsely claimed the terminal was blocked and could not start `npm run dev` or run Playwright. Terminal access was fine; the sub-agent hallucinated the blocker.
- This reference captures the exact recovery steps the parent agent used to finish QA and the minimal architecture-compliant automation commit added to the `Automation/BC-90/Home-Hero-Integration` branch.
- It also records the concrete pattern for adding an integration test for a new SWR-backed section that replaces hardcoded content with `/api/home/hero` data.

## QA recovery when the QA sub-agent halts on a false terminal blocker

1. Verify terminal access directly: `cd {repo} && echo "terminal access OK"`.
2. Start the dev server as a background process: `terminal(background=True)` with `npm start -- --port 3001`.
3. Wait briefly, then hit the endpoint:
   ```bash
   curl -s http://localhost:3001/api/home/hero | python3 -m json.tool
   ```
4. Run manual QA checks:
   - API returns 200 with expected shape (`headline`, `subtext`, `ctaLabel`, `stats`).
   - Load `http://localhost:3001/` in a browser (or use Playwright) and confirm the hero headline matches the API response.
   - Confirm loading skeleton renders before data arrives and is `aria-hidden`.
   - Confirm CTA button is visible and clickable.
   - Confirm no hydration mismatch console errors.
5. Add Playwright coverage in `test-automation/` (see pattern below) and run `BASE_URL=http://localhost:3001 npm run test` inside `test-automation/`.
6. Kill the dev server background process when done.

## Hero Section automation pattern

For an SWR-backed section where the real DOM excludes the skeleton via `aria-hidden="true"`, use real-content selectors:

```typescript
// locators/homepage-locators.ts
heroHeadingReal: '[data-testid="hero-heading"]:not([aria-hidden="true"])',
heroParagraphReal: '[data-testid="hero-paragraph"]:not([aria-hidden="true"])',
heroOpenAccountReal: '[data-testid="hero-open-account"]:not([aria-hidden="true"])',
```

Add Zod schema + endpoint constants in `constants/api-constants.ts`:

```typescript
export const API_PATHS = {
  // ...existing
  HERO: "/api/home/hero",
} as const;

export const heroResponseSchema = z.object({
  headline: z.string().min(1),
  subtext: z.string().min(1),
  ctaLabel: z.string().min(1),
  stats: z.object({
    transactions: z.array(z.object({ id: z.number(), name: z.string(), amount: z.string() })),
    exchangeRates: z.array(z.object({ id: z.number(), code: z.string(), name: z.string(), value: z.string(), icon: z.string() })),
    currencies: z.array(z.object({ icon: z.string() })),
    monthlyIncome: z.object({ icon: z.string(), value: z.string(), label: z.string() }),
  }),
});

export const HERO_ENDPOINTS = { HOME: API_PATHS.HERO };
export const HERO_SCHEMA_LABELS = { HERO_RESPONSE: "hero response schema" } as const;
```

Add UI text constants in `constants/homepage-constants.ts`:

```typescript
export const HERO_TEXT = {
  BADGE: "No LLC Required, No Credit Check.",
  TRANSACTIONS_HEADING: "Your Transactions",
  EXCHANGE_HEADING: "Money Exchange",
  // ...
} as const;
```

Add page-object methods in `pages/frontend/home-page.ts`:

```typescript
async assertHeroSectionFromApi(): Promise<void> {
  await this.initializationPage.goto(UI_ROUTES.HOME);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroSection);

  const heroResponse = (await this.apiHelper.getRequest(HERO_ENDPOINTS.HOME)) as HeroResponse;
  const validation = heroResponseSchema.safeParse(heroResponse);
  this.apiHelper.assertSchemaValid(validation, HERO_SCHEMA_LABELS.HERO_RESPONSE);

  await this.initializationPage.expectTextContains(HOMEPAGE_LOCATORS.heroBadge, HERO_TEXT.BADGE);
  await this.initializationPage.expectTextContains(HOMEPAGE_LOCATORS.heroHeadingReal, heroResponse.headline);
  await this.initializationPage.expectTextContains(HOMEPAGE_LOCATORS.heroParagraphReal, heroResponse.subtext);
  await this.initializationPage.expectTextContains(HOMEPAGE_LOCATORS.heroOpenAccountReal, heroResponse.ctaLabel);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroMockup);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroMonthlyIncomeReal);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroTransactionsCardReal);
  await this.initializationPage.expectTextContains(HOMEPAGE_LOCATORS.heroTransactionsHeading, HERO_TEXT.TRANSACTIONS_HEADING);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroExchangeCard);
  await this.initializationPage.expectTextContains(HOMEPAGE_LOCATORS.heroExchangeHeading, HERO_TEXT.EXCHANGE_HEADING);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroSupportedCurrencyReal);
}

async assertHeroCtaClickable(): Promise<void> {
  await this.initializationPage.goto(UI_ROUTES.HOME);
  await this.initializationPage.expectVisible(HOMEPAGE_LOCATORS.heroOpenAccountReal);
  await this.initializationPage.clickOnElement(HOMEPAGE_LOCATORS.heroOpenAccountReal);
}
```

Add thin spec in `specs/frontend-integration-test/home-page.spec.ts`:

```typescript
test.describe("Home Page Hero Section", () => {
  test("hero section renders with API-driven headline, subtext, and CTA", async ({ homepage }) => {
    await homepage.assertHeroSectionFromApi();
  });

  test("hero CTA button is visible and clickable", async ({ homepage }) => {
    await homepage.assertHeroCtaClickable();
  });
});
```

## Verification commands

Inside `test-automation/`:
```bash
PATH=/usr/local/bin:$PATH npx tsc --noEmit
BASE_URL=http://localhost:3001 npm run test   # runs test:api + test:ui
```

Root repo:
```bash
PATH=/usr/local/bin:$PATH npx tsc --noEmit
npm run build
```

## Merge fallback for Automation PRs

If `{{GITHUB_REVIEWER_ACCOUNT}}` approves but lacks merge permission:

```bash
cd $REPO_ROOT
gh auth switch --hostname github.com --user {{GITHUB_OWNER}}
gh pr merge <PR> --squash --delete-branch
gh auth switch --hostname github.com --user {{GITHUB_REVIEWER_ACCOUNT}}   # optional
```

This exact sequence was used for PR #36 (Automation/BC-90/Home-Hero-Integration).

## Pitfalls to avoid

- Do **not** trust a sub-agent claim that the terminal is blocked without running a trivial command yourself.
- Do **not** place schema labels in `homepage-constants.ts` if `api-constants.ts` already exports `*_SCHEMA_LABELS`; barrel exports will collide.
- Do **not** use raw locators in page-object methods — all selectors must live in `locators/*.ts`.
- Do **not** merge an Automation PR with `GITHUB_REVIEWER_TOKEN`; switch to the author `gh` account after reviewer approval.
