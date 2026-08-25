## QA Results — {{TICKET_KEY}} ({{SCOPE}})

:::success Verdict: {{VERDICT}}
Deployed URL {{DEPLOYED_URL}} · commit `{{SHA}}`
:::

### Test cases
| TC | Description | Expected | Actual | Result |
|---|---|---|---|---|
| {{TC_ID}} | {{TC_DESC}} | {{EXPECTED}} | {{ACTUAL}} | {{PASS_FAIL}} |

### Measured evidence
| Route | Width | Property | Figma | Measured | Δ |
|---|---|---|---|---|---|
| {{ROUTE}} | {{WIDTH}} | {{PROPERTY}} | {{FIGMA}} | {{MEASURED}} | {{DELTA}} |

### Accessibility
| Check | Result |
|---|---|
| Contrast (painted background) | {{CONTRAST}} |
| Lighthouse accessibility | {{LH_A11Y}} |
| prefers-reduced-motion | {{PRM}} |

### Defects
1. **{{DEFECT}}** — {{LOCATION}}, expected {{EXPECTED}}, measured {{MEASURED}}

### Informational only — no action
- {{OBSERVATION}}
