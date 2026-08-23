# Fix Sub-Agent: Parent Agent Responsibilities

When a code review REQUEST_CHANGES dispatches a fix sub-agent, the parent
must do more than hand off the findings. These are the steps that are easy
to skip but required for clean pipeline handoff.

## 1. After fix sub-agent pushes — verify build AND tests

The fix sub-agent may exhaust its tool calls fixing TS errors and pushing,
leaving tests unverified. The parent must then:

```bash
# Pull latest and verify build
git checkout <branch> && git pull origin <branch>
npm run build

# Verify tests (not just build)
npm test -- --run
```

Common case: sub-agent fixes `SearchFilterBar.tsx` string escaping → build
passes, but a test still expects the old value (e.g. the old heading text).
Parent catches and fixes the test before approving MR.

If tests fail and sub-agent is out of calls: parent fixes the test, commits,
pushes, then approves.

## 2. Screenshot directory path is not guaranteed

When sampling Figma screenshots for design theme extraction:

```bash
# DON'T assume /tmp/kan-{N}-screenshots/ exists
ls /tmp/kan-{N}-screenshots/     # check first
find /tmp -name "*.png" | head -20 # fallback probe

# Valid PNGs are > 1KB. 94-byte files are broken Figma API placeholders.
```

If screenshots are broken/missing and no Figma API fallback exists:
- Use the JIRA ticket description's Design Theme table (RGB values stated there)
- Extract text strings from the description's Text Content Inventory
- Do NOT block — proceed with stated design values and note the gap

## 3. Pre-existing MR arriving at code review

Some bug fixes arrive with an MR already open (reported by a previous agent or
manual discovery). Check its current state before assuming it's ready:

```bash
# Verify build still passes on the branch
git checkout <branch> && git pull origin <branch>
npm run build

# Check for common diff artifacts
gh pr diff <PR_NUMBER> --name-only
```

Common diff artifact: string literals in the diff contain `\\"` (escaped
double-quotes) that become invalid JSX when applied. Build fails with
"Unterminated string constant". Fix sub-agent resolves these; parent
verifies the fix landed cleanly.
