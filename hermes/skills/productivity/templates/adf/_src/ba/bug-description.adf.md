## {{TICKET_KEY}} — {{BUG_TITLE}}

:::error Measured deviation from Figma on a shipped build
Deployed {{DEPLOYED_URL}} · commit `{{SHA}}` · measured {{DATE}}
:::

### Summary
{{SUMMARY}}

### Findings grouped by kind
| # | Kind | Element | Figma | Deployed | Δ | Frame width |
|---|---|---|---|---|---|---|
| {{N}} | {{KIND}} | {{ELEMENT}} | {{FIGMA}} | {{DEPLOYED}} | {{DELTA}} | {{WIDTH}} |

### How each value was measured
| Value | Method |
|---|---|
| {{VALUE}} | {{METHOD}} |

### Protected values — MUST NOT CHANGE
These are correct on the deployed build and are recorded so a fix does not regress them.

| Element | Property | Correct value |
|---|---|---|
| {{ELEMENT}} | {{PROPERTY}} | {{VALUE}} |

### Cleared suspicions
| Checked | Verdict |
|---|---|
| {{SUSPICION}} | {{VERDICT}} |

### Out of scope
- {{NON_GOAL}}
