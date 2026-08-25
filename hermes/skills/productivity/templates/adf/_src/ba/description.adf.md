## {{TICKET_KEY}} — {{TITLE}}

:::info Scope: {{SCOPE}} · Story points: {{POINTS}} · Epic: {{EPIC_KEY}}
:::

### 1. User story
As a {{ROLE}}, I want {{CAPABILITY}}, so that {{BENEFIT}}.

### 2. Acceptance criteria
| # | Given | When | Then |
|---|---|---|---|
| AC-1 | {{GIVEN}} | {{WHEN}} | {{THEN}} |

### 3. Figma design references
| Resolution | Frame | Node ID | Bridge endpoint |
|---|---|---|---|
| {{WIDTH}} | {{FRAME_NAME}} | {{NODE_ID}} | `/api/node/{{NODE_ID}}/context` |

### 4. Design theme
| Element | Token | Value | Contrast |
|---|---|---|---|
| {{ELEMENT}} | {{TOKEN_NAME}} | {{RGB}} | {{RATIO}} — {{AA_STATUS}} |

### 5. Logos and icons
| Asset | Node ID | Format | Export |
|---|---|---|---|
| {{ASSET_NAME}} | {{NODE_ID}} | SVG | `/api/node/{{NODE_ID}}/svg` |

### 6. Interactive states
| Element | Default | Hover | Focus | Active | Disabled | Loading |
|---|---|---|---|---|---|---|
| {{ELEMENT}} | {{S1}} | {{S2}} | {{S3}} | {{S4}} | {{S5}} | {{S6}} |

### 7. API data contract
```ts
{{TYPE_DEFINITIONS}}
```

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| {{METHOD}} | `{{ROUTE}}` | {{REQ}} | {{RES}} | {{ERR}} |

### 8. Responsive behaviour
| Frame width | Layout | Notes |
|---|---|---|
| {{WIDTH}} | {{LAYOUT}} | {{NOTES}} |

### 9. Out of scope
- {{NON_GOAL}}

### 10. Definition of done
- {{DOD_ITEM}}
