# Sub-agent runtime failure fallback

## Problem

A sub-agent (review, QA, or implementation) is dispatched successfully via `delegate_task` but fails mid-execution due to provider/model errors — e.g. Ollama Cloud 402 "extra usage balance empty", rate limits, or model unavailability. The sub-agent returns an error instead of a completed result.

## Detection

The delegation result contains an error message from the model provider rather than the expected output (MR URL, QA verdict, merge SHA, etc.). Common signals:
- `HTTP 402: this model uses extra usage only`
- `rate limit exceeded`
- `model not available`

## What to do

1. **Do NOT re-dispatch into the same failing provider.** It will fail again.
2. **The main agent picks up the work directly.** This is NOT a HARD DELEGATION violation — the sub-agent was properly dispatched; it just couldn't complete due to infrastructure failure. The main agent is performing recovery, not bypassing delegation.
3. **Execute the work inline:**
   - For QA: run tsc, eslint, vitest, curl-test the API, verify ACs, transition QA subtask + parent to Done.
   - For review: run the review workflow manually (fetch PR, review diff, approve/merge).
   - For implementation: re-dispatch with a different model if available, or execute directly as last resort.
4. **Document the fallback** in a JIRA comment on the parent ticket: "QA sub-agent failed due to provider error (Ollama Cloud 402). Manual QA executed by main agent. Results: [summary]."
5. **Do NOT leave the ticket stranded** in In Testing or In Review waiting for a sub-agent that will never complete.

## Example from BC-11

QA sub-agent dispatched for BC-11, returned `HTTP 402: this model uses extra usage only (not included plan usage) and your extra usage balance is empty`. Main agent:
- Ran `npx tsc --noEmit` (clean)
- Ran `npx eslint` on changed files (clean)
- Ran `npx vitest run` (47/47 passed)
- Curl-tested `/api/config/cta?page=home` and `?page=careers` (both 200, correct shape)
- Transitioned BC-76 (QA subtask) to Done
- Transitioned BC-11 to Done, assignee Reviewer
- Posted QA results comment on BC-11
