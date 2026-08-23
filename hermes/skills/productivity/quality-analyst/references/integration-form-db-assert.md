# Integration Form Submit + DB Assertion Recipe

Use this when an integration QA ticket involves a form posting to a backend endpoint.
A real browser submit followed by a DB read is stronger evidence than unit tests alone.

## When to use

- Form integration tickets (contact, inquiry, newsletter, booking).
- You need to prove the full data shape lands in the database.
- The repo is Next.js + Prisma + SQLite and runs locally with `npm run build && npm start`.

## Steps

1. **Start the production server** on a free port.
   ```bash
   cd <repo>
   lsof -ti:3000 | xargs kill -9 2>/dev/null || true
   npm run build
   npm start
   ```

2. **Submit the form via Playwright** (headless).
   ```python
   from playwright.sync_api import sync_playwright

   with sync_playwright() as p:
       browser = p.chromium.launch(headless=True)
       page = browser.new_page(viewport={"width": 1920, "height": 1080})
       page.goto("http://localhost:3000/properties", wait_until="domcontentloaded")
       page.fill('[data-testid="input-firstName"]', "QA")
       # ... fill remaining fields ...
       page.check('[data-testid="input-agreeToTerms"]')
       page.click('[data-testid="submit-button"]')
       page.wait_for_timeout(2000)
       browser.close()
   ```

3. **Capture the network request** for evidence.
   ```python
   requests = []
   page.on("requestfinished", lambda req: requests.append({
       "url": req.url, "method": req.method,
       "status": req.response().status if req.response() else None
   }))
   ```

4. **Read the inserted row from SQLite.**
   Next.js copies `prisma/dev.db` to `/tmp/dev.db` on startup. Query `/tmp/dev.db`
   for the row inserted by the running server.
   ```python
   import sqlite3
   with sqlite3.connect("/tmp/dev.db") as conn:
       row = conn.execute(
           "SELECT firstName, lastName, email FROM ContactSubmission WHERE email = ?",
           ("qa.tester@example.com",)
       ).fetchone()
   ```

5. **Stop the server**.
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

## Pitfalls

- Querying `prisma/dev.db` while `npm start` is running may show stale data because
  the server copied the file to `/tmp/dev.db`. Query `/tmp/dev.db` instead.
- Playwright selectors that include `input` may fail for selects/textareas.
  Use the outer `data-testid` wrapper and `.fill()` on text inputs/textareas,
  `.select_option()` on `<select>`, and `.check()` on checkboxes.
- Use a unique marker email/phone per QA run so you can identify the inserted row.

## Evidence to post

Include in the QA subtask comment:
- HTTP status of the POST request.
- Key fields from the DB row.
- Any page errors or console errors captured.
