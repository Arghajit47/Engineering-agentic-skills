# Contact Form QA: Reviewer-Convention Override of `waitForResponse` + DB Evidence

## Context

During KAN-43 QA, the automation SDET first implemented the skill's recommended
form-submission evidence:

- `page.waitForResponse` for the POST to `/api/contact/general`
- response status/body assertions
- SQLite DB read from `/tmp/dev.db` to confirm the `GeneralInquiry` row

Reviewer comments on the automation MR requested:

1. Modular helper methods in the page object (no inline `page.locator(...).selectOption()` or `.check()`).
2. No network interception (`page.waitForResponse`).
3. No direct API assertions.
4. No DB query ("dummy submit anyway").
5. All test data moved to `constants/`.

## Resolution

The comments were resolved by:

- Adding `InitializationPage.selectOption()` (already existed) and `InitializationPage.checkCheckbox()` helpers.
- Moving all form values into `CONTACT_FORM_TEST_DATA` in `contact-constants.ts`.
- Replacing the `submitGeneralContactFormAndAssertDbRow` method with a cleaner
  `submitGeneralContactForm` that fills the form via page-object helpers and
  asserts the success UI.
- Removing the `execSync` import and `LIVE_DB_PATH` constant.

## Trade-off note

This weaker assertion level cannot independently prove the POST reached the DB.
It validates that the UI wiring is intact and the backend returns a success state.
If the ticket's AC explicitly requires proving the row was created, the QA
subtask comment should flag that this automation was adjusted per reviewer
preference.

## Pattern to reuse

When reviewer comments ask to remove network/DB assertions from a form test:

1. Extract select/checkbox helpers to the base page object if missing.
2. Move literals to a `*_FORM_TEST_DATA` constant object.
3. Keep the test minimal: fill → submit → assert success UI.
4. Post a resolution comment on the MR and a note in the QA subtask.
