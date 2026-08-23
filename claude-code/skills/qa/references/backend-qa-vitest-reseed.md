# Backend QA — Vitest mutates the DB; re-seed before manual validation

Session: KAN-7 Backend QA (2026-07-17). Generalizes to any Prisma/SQLite +
Vitest project where the test suite uses `deleteMany()` + reseed in
`beforeEach`.

## The trap

`src/__tests__/api.test.ts` does:

```ts
beforeEach(async () => {
  await prisma.property.deleteMany();
  await prisma.review.deleteMany();
  await prisma.siteSetting.deleteMany();
  // ... reseed minimal fixtures (3 properties, 3 reviews, 5 settings)
});
```

After `npm test` finishes, the DB holds the LAST `beforeEach`'s minimal
fixtures — 3 properties (2 featured), 3 reviews, 5 settings — NOT the
canonical seed (`prisma/seed.ts` → 6 properties, 5 reviews, 14 settings).

Manual curl validation of seed-count TCs (e.g. TC-011 "6 properties, 5
featured") against this truncated state returns wrong counts → false negative.

## The fix (run in this order)

```bash
# 1. Run the suite — covers empty-DB, 500-path, array-type, schema TCs
npm test
# → 18/18 passed. Record this as evidence for TC-004/005/006/007/008.

# 2. Re-seed to restore canonical state BEFORE any manual curl/DB validation
npm run seed
# → "Seed complete: 6 properties, 5 reviews, 14 settings"

# 3. Verify canonical counts before trusting manual curl output
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Property; SELECT COUNT(*) FROM Property WHERE isFeatured=1; SELECT COUNT(*) FROM Review; SELECT COUNT(*) FROM Review WHERE propertyTitle IS NULL; SELECT COUNT(*) FROM SiteSetting;"
# Expect: 6 / 5 / 5 / 1 / 14

# 4. NOW run manual curl for happy-path + boundary TCs
curl -s -w "\n[HTTP %{http_code}]\n" http://localhost:3000/api/properties/featured
curl -s -w "\n[HTTP %{http_code}]\n" http://localhost:3000/api/reviews/featured
curl -s -w "\n[HTTP %{http_code}]\n" http://localhost:3000/api/settings
```

## Which TCs the suite covers (endorse, don't redo)

| TC pattern | Suite assertion | Don't redo manually |
|---|---|---|
| Empty DB → `[]` | `deleteMany()` → `expect(body).toEqual([])` | yes |
| Empty DB → `{}` | `deleteMany()` → `expect(body).toEqual({})` | yes |
| 500 error path | `mockRejectedValueOnce(new Error("DB down"))` → `status 500`, `typeof body.error === 'string'` | yes |
| Array fields parsed | `expect(body[0].galleryUrls).toEqual([...])` | yes |
| Field schema valid | `expect(schema.safeParse(item).success).toBe(true)` | yes |
| Take-limit (≤6 / ≤5) | seed >limit rows, `expect(body.length).toBeLessThanOrEqual(N)` | yes |
| Nullable field | `expect(body.find(r => r.field === null)).toBeDefined()` | yes |

## Which TCs need manual curl (suite can't cover)

- Happy path against the LIVE dev server (not just the route handler in
  isolation) — re-verify even if the suite passes, to confirm wiring.
- Unauthorized / rate-limit / malformed-JSON error paths not mockable in
  `beforeEach`.
- Seed-data counts (TC-011) — the suite reseeds minimal fixtures, so counts
  must be validated against the canonical seed, not the test DB.

## Security scan: parse npm audit JSON

```bash
npm audit --json 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin); m=d.get('metadata',{}).get('vulnerabilities',{}); print('vulns:',m)"
```

If the consent guard blocks `--json` (some environments reject JSON audit but allow plain output), fall back to:
```bash
npm audit 2>&1 | tail -20
```
A passing scan prints `found 0 vulnerabilities`. If it reports counts, capture the severity counts from the human-readable output (`X moderate`, `Y high`, etc.) and document them. Zero high/critical is still the gate.

Moderate/low advisories are observations, not blockers (unless AC says
otherwise). Record: count by severity, advisory IDs, CVSS, whether fix is
breaking. Zero high/critical is the gate.

Example (KAN-7): 2 moderate (postcss XSS via next, GHSA-qx2v-qp2m-jg93,
CVSS 6.1, fix is next major bump — breaking) → PASS, backlog tech-debt.
Example (KAN-47): `npm audit` returned `found 0 vulnerabilities` after JSON output was blocked → PASS.