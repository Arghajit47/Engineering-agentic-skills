# npm audit: forcing patched transitive versions with `overrides`

Sometimes `npm audit fix` wants to bump a major version or reports a "fix available" that doesn't actually resolve the finding. `package.json` `overrides` lets you force a specific version of a transitive dependency without editing the lockfile by hand.

## When to use

- `npm audit` reports high/critical in a transitive dep (e.g., `sharp` or `postcss` pulled in by `next`).
- The parent package hasn't released a patched version yet, but the vulnerable transitive package has.
- You want the smallest possible change: one JSON block instead of a full dependency upgrade.

## Pattern

```json
{
  "overrides": {
    "sharp": "^0.35.0",
    "postcss": "^8.5.10"
  }
}
```

Then run `npm install`. npm will re-resolve the lockfile so every package in the tree that depends on `sharp` or `postcss` gets at least the specified version.

## Caveats

- **Test the build.** Forcing a transitive version can break the parent package if its API changed. Run `npm run build` and your test suite after applying overrides.
- **Check the actual installed version:** `npm ls sharp postcss` to confirm.
- **Re-run audit:** `npm audit` should now report zero high/critical. If it still reports the same package, the override range may be too loose or the advisory data is stale.
- **Pin carefully.** Use exact versions only if a caret range lets in another vulnerable version. Prefer caret ranges to reduce future lockfile churn.

## When not to use

- The vulnerable package is directly listed in `dependencies` — bump it there instead.
- The parent package's next patch release already fixes it — prefer `npm update <parent>`.
- The override causes runtime errors. In that case, upgrade the parent package or wait for a patch.
