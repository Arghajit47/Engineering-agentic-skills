## ADR {{NUMBER}} — {{TITLE}}

:::info Status: {{STATUS}} · Epic {{EPIC_KEY}} · {{DATE}}
:::

### Context
{{CONTEXT}}

### Options considered
| Option | Cost | Benefit | Rollback |
|---|---|---|---|
| {{OPTION}} | {{COST}} | {{BENEFIT}} | {{ROLLBACK}} |

### Decision
We will {{DECISION}}.

### Consequences
- Positive: {{POSITIVE}}
- Negative: {{NEGATIVE}}
- Follow-up: {{FOLLOWUP}}

### Frozen contracts — copy verbatim into every child ticket

```prisma
{{DATA_MODEL}}
```

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| {{METHOD}} | `{{ROUTE}}` | {{REQ}} | {{RES}} | {{ERR}} |

```ts
{{SHARED_TYPES}}
```

### State ownership
| Concern | Owner |
|---|---|
| Server-rendered | {{SERVER}} |
| Client hook | {{CLIENT}} |
| Hydration guard required | {{GUARD}} |

### Error model
{{ERROR_MODEL}}

### Out of scope for this epic
- {{NON_GOAL}}
