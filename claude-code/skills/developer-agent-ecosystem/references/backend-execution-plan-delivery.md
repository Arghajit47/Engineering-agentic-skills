# Backend Execution Plan Delivery — False /ba-reply Prevention

Backend Developer sub-agents can also post a premature `/ba-reply` if they try to read JIRA attachments via `web_extract` and get 403, or if they cannot locate the execution plan. Prevent this by delivering the plan through two channels and explicitly instructing the sub-agent to use the local file fallback.

## Delivery checklist

- [ ] Generate `backend-execution-plan-bc{KEY}.txt`.
- [ ] Attach it to the JIRA ticket via the Jira REST v2 multipart recipe (verify returned attachment size).
- [ ] Copy the plan to the repo root: `cp /tmp/backend-execution-plan-bc20.txt $REPO_ROOT/backend-execution-plan-bc20.txt`.
- [ ] Add a JIRA comment referencing the attachment and noting the local path.
- [ ] In the sub-agent context, provide both the JIRA attachment name and the repo-local file path.

## Sub-agent context template

```
JIRA: BC-20 [Backend] Home Page Hero Section
Backend execution plan attached as backend-execution-plan-bc20.txt.
Local copy: $REPO_ROOT/backend-execution-plan-bc20.txt
If JIRA attachments return 403 via web_extract, read the local file above.
Pattern route handlers you can inspect directly:
  src/app/api/faq/route.ts
  src/app/api/faq/route.test.ts
  src/app/api/config/cta/route.ts
  src/app/api/config/cta/route.test.ts
```

## False-halt recovery

If the Backend Developer sub-agent still halts with `/ba-reply` due to attachment access:
1. Verify the local plan file exists.
2. Post a JIRA comment overriding the /ba-reply.
3. Re-dispatch with an even more explicit local path and instructions to ignore the prior /ba-reply.
4. Do not implement the route yourself.
