# Fixing TypeScript/Build Errors on MR Branches

Bad diffs from AI-generated code changes leave structural damage that looks correct in a diff but fails to compile. LSP diagnostics may also disagree with the real TypeScript compiler state.

## Common bad-diff patterns

| Pattern | What it looks like | What it should be |
|---------|-------------------|-------------------|
| Escaped quotes in JSX | `className=\"relative\""` | `className="relative"` |
| Truncated string prefix | `slug: la"cozy-forest-cottage"` | `slug: "cozy-forest-cottage"` |
| Literal `\n` in string attrs | `...-mt-12\">\n        <form\n` | `...-mt-12">\n        <form` (real newlines only) |
| Garbage at end of string | `imageUrl: "...S de a- la l l v l a r..."` | Full Unsplash URL |
| Duplicate/broken closing tags | Two `</div>` blocks where one tag closed wrong | Valid JSX tree |

## Investigation first

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Read the actual file with `read_file` (shows raw bytes + line count). If line count is wildly wrong or the file looks structurally broken, the file needs a full rewrite — `replace_all` on damaged content amplifies corruption.

## Rewriting a damaged file

When the file is structurally broken:
1. `read_file` the damaged file — note the correct content from context
2. `write_file` the corrected version — replaces the entire file
3. `npm run build` to verify
4. `git diff <file>` to confirm only intended changes

## Discarding unintended uncommitted changes

After a fix, `git status` may show changes you didn't make — often LSP auto-formatting on file open, or a partial rewrite that reverted something in the same file:

```bash
git diff src/mocks/properties-listings.ts  # confirm what changed
git checkout -- src/mocks/properties-listings.ts  # discard unintended
```

## The `replace_all` trap

`patch(..., replace_all=true)` with a simple string substitution (e.g. `\"` → `"`) is safe only when:
- The entire file uses the same wrong pattern uniformly
- The file is structurally intact (no embedded literal `\n`, no truncated strings)

If either condition is uncertain, rewrite with `write_file` instead.

## Verification order

1. `npm run build` — catches TypeScript/Next.js errors (stricter than LSP)
2. `npm test -- --run` — regression check (failures here may be pre-existing; compare against main)
3. `git status` — clean working tree before declaring done
