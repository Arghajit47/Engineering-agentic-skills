# Using Vision Tools for Figma Screenshot Analysis

## When to use this

The main agent's model may not have native image input, but the runtime provides `vision_analyze`. For Frontend or bug-fix tickets that come with Figma screenshot PNGs, use `vision_analyze` to extract exact layout, text, and color details before writing instructions or code.

## Workflow

1. Download the Figma screenshot(s) from JIRA or the ticket description to a local path.
2. Call `vision_analyze` with a specific question about the image:
   - "What is the exact button text and position in this section?"
   - "Describe the testimonial card stack order: stars, title, body, avatar, name, location."
   - "What are the visible card borders, background colors, and star colors?"
3. Cross-check with PIL pixel sampling for exact RGB values where needed.
4. Fold the extracted values into `instructions.txt` / JIRA comment and the code itself.

## Why not just dispatch a sub-agent?

Sub-agents inherit the main agent's text-only toolset in many runtimes. They cannot call `vision_analyze`. If the fix depends on visual details that the main agent can see but a sub-agent cannot, doing the work directly avoids:
- Lost visual nuance in text-only context.
- Sub-agent guessing colors/layout/spacing.
- Extra turn overhead for a small change.

## Combining with the Direct-Fix Shortcut

If the ticket is a small UI bug or design tweak (≤5 files, no new architecture), and the main agent has vision access, use the Direct-Fix Shortcut even if the ticket is not a re-run. Follow the same branch + MR + QA workflow; just skip sub-agent dispatch. See the Direct-Fix Shortcut section in the main skill.

## Real case

KAN-90 in the Estatein repo: a bug report with attached Figma screenshots. `vision_analyze` revealed the correct button text ("View All Properties"), card layout (stars → title → body → avatar/name/location), and missing avatars. The main agent applied the fixes directly across component, schema, seed, API, and tests.
