||Resolution||Figma Node URL||
|1920px (Desktop)|[https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}|Figma — {Section 1} 1920px]|
...

Use the Jira REST API `description` field with Atlassian Document Format (ADF), `type: "table"` nodes — see the template below. Do NOT use `||` or `|` wiki markup, and do NOT use HTML `&lt;table&gt;` tags.

### Native ADF table example

```json
{
  "type": "table",
  "attrs": {"isNumberColumnEnabled": false, "layout": "default", "localId": "figma-ref-table"},
  "content": [
    {
      "type": "tableRow",
      "content": [
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Resolution", "marks": [{"type": "strong"}]}]}]},
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma Node URL", "marks": [{"type": "strong"}]}]}]}
      ]
    },
    {
      "type": "tableRow",
      "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1920px (Desktop)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section 1} 1920px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]
    }
  ]
}
```

## Frontend Ticket Template

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📬 User Story"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "As a {role}"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "I want {action}"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "So that {benefit}"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🔆 Scope"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "— {scope-specific text}"}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🎨 Figma Design References — {Section}"}]},
    {"type": "table", "attrs": {"isNumberColumnEnabled": false, "layout": "default"}, "content": [
      {"type": "tableRow", "content": [
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Resolution", "marks": [{"type": "strong"}]}]}]},
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma Node URL", "marks": [{"type": "strong"}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1920px (Desktop)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 1920px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1440px (Laptop)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 1440px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1024px (Tablet HD)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 1024px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "768px (Tablet/Mobile HD)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 768px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "375px (Mobile)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 375px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🌈 Design Theme"}]},
    {"type": "table", "attrs": {"isNumberColumnEnabled": false, "layout": "default"}, "content": [
      {"type": "tableRow", "content": [
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Property", "marks": [{"type": "strong"}]}]}]},
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Value", "marks": [{"type": "strong"}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Page background"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "{dark|light}, rgb({R},{G},{B})"}]}]}
      ]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📷 Figma Screenshots (Attached)"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Screenshots for all 5 resolutions are attached to this ticket as PNG files."}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "✅ Acceptance Criteria"}]},
    {"type": "orderedList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "{Component} renders heading \"{Heading Text}\" and subheading (static text placeholder)"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "{Component} renders correctly at all 5 breakpoints matching Figma designs"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "💻 Technical Notes"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Tech Stack: Next.js 14+ App Router, TypeScript strict, Tailwind CSS"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Component Paths: src/components/{path}/{ComponentName}.tsx"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📊 Story Points"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "{N}"}]}
  ]
}
```

## Backend Ticket Template

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📬 User Story"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "As a backend developer"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "I want to build the API endpoints for {Component Name}"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "So that the frontend can fetch and display data for {Component Name}"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🔆 Scope"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "— {scope-specific text}"}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🎨 Figma Design References — {Section Name}"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "These Figma nodes show what data fields the UI expects. The backend must return data matching these field structures."}]},
    {"type": "table", "attrs": {"isNumberColumnEnabled": false, "layout": "default"}, "content": [
      {"type": "tableRow", "content": [
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Resolution", "marks": [{"type": "strong"}]}]}]},
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma Node URL", "marks": [{"type": "strong"}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1920px (Desktop)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 1920px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📷 Figma Screenshots (Attached)"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Screenshots for all 5 resolutions are attached to this ticket as PNG files."}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "✅ Acceptance Criteria"}]},
    {"type": "orderedList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "GET /api/{endpoint} returns {N} items with correct field structure"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "💻 Technical Notes"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "API Path: /api/{endpoint}"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Prisma model: {ModelName}"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📊 Story Points"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "{N}"}]}
  ]
}
```

## Integration Ticket Template

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📬 User Story"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "As a full-stack developer"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "I want to wire the frontend components to backend API endpoints for {Component Name}"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "So that {Component Name} displays live data from the API"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🔆 Scope"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "— {scope-specific text}"}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🎨 Figma Design References — {Section}"}]},
    {"type": "table", "attrs": {"isNumberColumnEnabled": false, "layout": "default"}, "content": [
      {"type": "tableRow", "content": [
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Resolution", "marks": [{"type": "strong"}]}]}]},
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma Node URL", "marks": [{"type": "strong"}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1920px (Desktop)"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Figma — {Section} 1920px", "marks": [{"type": "link", "attrs": {"href": "https://www.figma.com/file/{FILE_KEY}?node={NODE_ID_DASH}"}}]}]}]}
      ]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "🌈 Design Theme"}]},
    {"type": "table", "attrs": {"isNumberColumnEnabled": false, "layout": "default"}, "content": [
      {"type": "tableRow", "content": [
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Property", "marks": [{"type": "strong"}]}]}]},
        {"type": "tableHeader", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Value", "marks": [{"type": "strong"}]}]}]}
      ]},
      {"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Page background"}]}]},
        {"type": "tableCell", "attrs": {}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "{dark|light}, rgb({R},{G},{B})"}]}]}
      ]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📷 Figma Screenshots (Attached)"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Screenshots for all 5 resolutions are attached to this ticket as PNG files."}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "✅ Acceptance Criteria"}]},
    {"type": "orderedList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Frontend fetches data from GET /api/{endpoint} on component mount"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "💻 Technical Notes"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Dependencies: {Frontend ticket key} (UI), {Backend ticket key} (API)"}]}]}
    ]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "📊 Story Points"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "{N}"}]}
  ]
}
```

## Notes

- `{NODE_ID_DASH}` = Figma node ID with colons replaced by dashes (e.g., `87:1301` → `87-1301`)
- `{FILE_KEY}` = Figma file key from the Figma URL
- Tables must be `type: "table"` with `tableRow`, `tableHeader`, and `tableCell` children.
- Use `marks: [{"type": "link", "attrs": {"href": "..."}}]` for clickable links inside table cells.
- For components with a single section, use only one `h2. 🎨` block
- For components with 3+ sections, add additional `h2. 🎨` blocks as needed