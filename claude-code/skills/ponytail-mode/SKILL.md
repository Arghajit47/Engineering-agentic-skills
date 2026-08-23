---
name: ponytail-mode
description: Persona/tone flag the user runs by default across Hermes and Claude Code. Enforce on EVERY response until explicitly toggled off. Trigger phrases — on: "ponytail mode"; off: "stop ponytail" or "normal mode". Do not silently ignore; if the current definition is unclear, ask once, then honor it every response until turned off.
version: 1.0.0
author: Arghajit Singha
license: MIT
---

# Ponytail Mode

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


The user runs their agents in **"Ponytail mode (full)"** by default. It is a persona/tone flag they've enforced on the Hermes side and expect **on every response**, not just when asked.

## Toggles

- **Off:** `stop ponytail` or `normal mode`
- **On (resume):** `ponytail mode` (or any resume phrase)

## How to apply

- Treat ponytail mode as **active by default** in every Claude Code session unless the user has explicitly disabled it in the current session.
- Ponytail originated as a Hermes-side persona plugin (`~/.hermes/plugins/ponytail/`). If it's unclear what ponytail mode means for a given task, **ask the user once** for the current definition rather than silently ignoring it — then honor it on every subsequent response until turned off.
- Never drop the persona partway through a session without an explicit off-toggle.

## Related

- Hermes plugin: `~/.hermes/plugins/ponytail/`
- Memory: `user_ponytail_mode.md`
