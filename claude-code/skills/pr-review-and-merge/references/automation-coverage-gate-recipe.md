# Automation Coverage Gate — KAN-37 Reproduction

When reviewing a PR that wires new API-driven UI behavior, verify the automation suite actually exercises that behavior, not just the page that contains it.

## Reproduction from KAN-37

Ticket: `[Integration] Property Details Pricing & Contact`
Repo: `{{GITHUB_REPO}}`

### What changed
PR #61 wired `/api/properties/{slug}/pricing` into the property details page.

### What the initial review missed
The existing `property-details-page.spec.ts` already had 4 tests:
- live API data validation
- inquiry form submission
- responsive layout
- no console/image errors

None asserted the pricing API call or the rendered pricing breakdown values.

### Required verification
Run the spec against a local server:

```bash
cd test-automation
BASE_URL=http://localhost:3000 npx playwright test specs/frontend-integration-test/property-details-page.spec.ts --project=frontend-integration-test
```

### Missing coverage test (added in follow-up PR #62)

1. Add pricing endpoint path in `constants/api-constants.ts`:
   - `PROPERTY_PRICING: (slug) => /api/properties/${slug}/pricing`
   - `propertyPricingSchema` Zod schema

2. Add pricing locators in `locators/propertydetails-locators.ts`:
   - `pricingBreakdown`, `pricingListing`, `pricingPlatformFee`, etc.

3. Add page method in `pages/frontend/property-details-page.ts`:
   - `assertPricingBreakdownFromApi()` calls the pricing API, validates schema, navigates to the page, and asserts each rendered amount.

4. Add spec test:
   - `test("Property details pricing breakdown loads from API", ...)`

### Result
Follow-up Playwright run: 5 passed.

## Checklist

- [ ] Identify the new API-driven behavior in the PR diff.
- [ ] Find the existing automation spec for the affected page.
- [ ] Confirm the spec calls the live API endpoint and asserts rendered data.
- [ ] If missing, request changes before approving.
- [ ] If the repo has no automation package, document the skip explicitly.
