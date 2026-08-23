# When the `Skill` tool is unavailable

Some Hermes runtimes (e.g., Ollama Cloud gateway) do not expose a `Skill` tool. The `developer-agent-ecosystem` workflow instructs auto-invoking `pr-review-and-merge` and `quality-analyst` via `Skill(...)`, but this call fails in those environments.

## Symptom

Calling `Skill(skill="pr-review-and-merge", args="{MR_URL}")` or `Skill(skill="quality-analyst", args="{JIRA_KEY}")` returns:

```
Tool 'Skill' does not exist. Available tools: browser_back, browser_cdp, ..., delegate_task, ...
```

## The `Bash(command="compact")` gate may also be missing

The skill mandates running `Bash(command="compact")` before/after every dispatch and handoff to keep the context payload small. In some Hermes runtimes the shell command `compact` does not exist.

**Fallback:** if `compact` returns `command not found`, skip it and continue. Do not block the pipeline on a context-compression helper. The dispatch/handoff still proceeds. Use the other fallback mechanisms below if the `Skill` tool is also unavailable.

## Fallbacks when auto-invocation helpers are missing, in order of preference

1. **Use `delegate_task` with a self-contained prompt** as the preferred path. Load the relevant skill first, then dispatch a leaf sub-agent to execute the workflow:
   ```
   Load the pr-review-and-merge (or quality-analyst) skill and execute its workflow for the MR URL / JIRA key below. Repo path, JIRA credentials, and GitHub context are included.
   ```

2. **Run the workflow directly in the main agent only as a narrow exception** when (a) `delegate_task` is unavailable in the runtime, (b) the work has already been verified by the main agent through tooling (not code authorship), or (c) the sequence is purely mechanical and unavoidable. This is not a lazy shortcut: document the exception in a JIRA comment before proceeding.

3. **Use `execute_code` with a Python script** only for mechanical, stateless sequences where no skill judgment is required.

## Hard delegation reminder

The `developer-agent-ecosystem` skill defines Frontend Developer, Backend Developer, and Integration Developer as sub-agent roles. The main agent must never implement code that belongs to those roles, even if `Skill(...)` is unavailable. The fallback mechanisms above apply only to handoff skills (`pr-review-and-merge`, `quality-analyst`), not to implementation work.