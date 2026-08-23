# Playwright + SQLite QA Pitfalls

Session: KAN-8 integration QA, 2026-07-17.

## 1. Per-test reseed races under parallel workers

**Symptom:** Playwright integration tests flake with SQLite locked/busy or data missing in worker B because worker A is still reseeding.

**Rule:** Seed once for the whole Playwright run, not per test.

Implementation:

```js
// test-automation/global-setup.js (CommonJS)
const { execSync } = require("child_process");
module.exports = async function globalSetup() {
  execSync("npm run seed", { cwd: "..", stdio: "inherit" });
};
```

```ts
// playwright.ui.config.ts
export default defineConfig({
  globalSetup: require.resolve("./global-setup.js"),
  // ...
});
```

Remove any `BaseAPI.reseed()` or `execSync("npm run seed")` calls from fixtures.

## 2. Dev DB wiped by unit tests

**Symptom:** After `npm test`, `localhost:3000` shows the wrong data, too few records, or broken images. The API returns test data instead of seeded data.

**Root cause:** `npm run dev` and `npm test` share the same SQLite file, and tests call `prisma.property.deleteMany()` in `beforeEach`.

**Fix in package.json:**

```json
{
  "scripts": {
    "test": "DATABASE_URL='file:./prisma/test.db' npx prisma db push --force-reset && DATABASE_URL='file:./prisma/test.db' vitest run"
  }
}
```

After any test run, re-seed the dev DB and restart the dev server before visual QA:

```bash
npm run seed
npm run dev
```

## 3. Localhost blocked by browser automation tools

**Symptom:** `browser_navigate("http://localhost:3000")` returns "Blocked: private or internal address".

**Fallback:** Use Playwright headless for local visual verification:

```bash
npx playwright screenshot --browser=chromium --viewport-size=1440,900 \
  --wait-for-selector='[data-testid="property-card"]' \
  http://localhost:3000 /tmp/homepage.png
```

Then load the screenshot with the vision tool.

## 4. External images in headless Playwright

**Symptom:** `naturalWidth > 0` assertion fails for Unsplash/remote images because of lazy loading or network blocking.

**Options (pick one):**

- **Local images:** copy a handful of real images into `public/images/` and reference them from seed.
- **Stub with Playwright route:**

```ts
await page.route(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i, route =>
  route.fulfill({
    contentType: "image/png",
    body: Buffer.from(STUB_IMAGE, "base64"),
  })
);
```

- **Scroll lazy images into view** before asserting:

```ts
await page.evaluate(() =>
  document.querySelectorAll("img[loading='lazy']").forEach(img => img.scrollIntoView())
);
```

## 5. DB schema mismatch between API and component

**Symptom:** Component renders empty/undefined fields (e.g. missing `description`, `propertyType`) when consuming API data.

**Fix at the source:** add the missing columns to `prisma/schema.prisma`, seed them, and return them in the API response. Do not synthesize them in the component or page.

After a schema change:

```bash
npx prisma db push --force-reset
npm run seed
```

Then restart the dev server.

## 6. Verifying data volume on the website

Always curl the real endpoints after seeding and before declaring QA pass:

```bash
curl -s http://localhost:3000/api/properties/featured | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
curl -s http://localhost:3000/api/reviews/featured | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
```

Then take a Playwright screenshot of the rendered page and confirm images are visible, not alt text.
