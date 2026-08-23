#!/usr/bin/env python3
"""Validate a BA-generated JIRA ticket against the business-analyst-workflow rules.

Usage:
  python3 validate-ba-ticket.py KAN-123

Reads JIRA_EMAIL, JIRA_API_KEY, and JIRA_BASE from ~/.env.
Exit 0 if all critical checks pass, 1 otherwise.
"""

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import certifi


def _load_env(path: Path = Path.home() / ".env") -> dict[str, str]:
    env: dict[str, str] = dict(os.environ)
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")

    # If JIRA_BASE is missing but JIRA_URL is a full Atlassian URL, derive the base.
    if not env.get("JIRA_BASE") and env.get("JIRA_URL"):
        url = env["JIRA_URL"]
        m = re.match(r"(https?://[^/]+)", url)
        if m:
            env["JIRA_BASE"] = m.group(1)
    return env


def _request(base: str, email: str, token: str, endpoint: str) -> dict:
    url = f"{base}/rest/api/3{endpoint}"
    ctx = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Authorization": f"Basic {_basic_auth(email, token)}",
    })
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _basic_auth(email: str, token: str) -> str:
    import base64
    return base64.b64encode(f"{email}:{token}".encode()).decode()


def _die(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(2)


def _extract_scope_from_title(title: str) -> str | None:
    match = re.match(r"^\[(Frontend|Backend|Integration)\]", title)
    return match.group(1) if match else None


def _extract_text_from_adf(node: Any) -> str:
    """Flatten an Atlassian Document Format (ADF) node to plain text."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "\n".join(_extract_text_from_adf(child) for child in node if child)
    if not isinstance(node, dict):
        return ""
    text = node.get("text", "")
    content = node.get("content")
    if content:
        return text + "\n" + _extract_text_from_adf(content)
    return text


def _get_description_text(fields: dict) -> str:
    desc = fields.get("description", "")
    if isinstance(desc, str):
        return desc
    if isinstance(desc, dict):
        return _extract_text_from_adf(desc)
    return ""


def _has_section(description: str, header: str) -> bool:
    # Strip emoji if present in the passed header so we can match the text part flexibly
    text_part = re.sub(r"[^\w\s&-]", "", header).strip()
    if not text_part:
        return False
    # Match Atlassian wiki markup headers (h2. Header) and plain markdown/emoji headers
    patterns = [
        rf"^\s*#+\s*{re.escape(text_part)}",
        rf"^\s*h\d+\.\s*(?:[^\w]*\s*)?{re.escape(text_part)}",
        rf"^\s*[^\w]*\s*{re.escape(text_part)}",
    ]
    for line in description.splitlines():
        line_stripped = line.strip()
        if any(re.search(p, line_stripped, re.IGNORECASE) for p in patterns):
            return True
    return False


def main() -> int:
    if len(sys.argv) != 2:
        _die("Usage: validate-ba-ticket.py <JIRA_KEY>")

    key = sys.argv[1].strip().upper()
    env = _load_env()

    email = env.get("JIRA_EMAIL")
    token = env.get("JIRA_API_KEY")
    base = env.get("JIRA_BASE", "https://your-domain.atlassian.net")

    if not email or not token:
        _die("Missing JIRA_EMAIL or JIRA_API_KEY in ~/.env")

    try:
        data = _request(base, email, token, f"/issue/{key}")
    except urllib.error.HTTPError as e:
        _die(f"JIRA request failed: {e.code} {e.reason}")
    except Exception as e:
        _die(f"JIRA request error: {e}")

    fields = data.get("fields", {})
    summary = fields.get("summary", "")
    description = _get_description_text(fields)
    labels = fields.get("labels", [])
    _sp_env = [f.strip() for f in os.environ.get("STORY_POINT_FIELD", "").split(",") if f.strip()]
    story_points = next((fields.get(f) for f in _sp_env if fields.get(f) is not None), None)
    attachments = fields.get("attachment", [])
    attachment_names = {a.get("filename", "") for a in attachments}

    scope = _extract_scope_from_title(summary)

    results: list[tuple[str, str, str]] = []  # (check, status, detail)

    # 1. Title scope prefix
    if scope:
        results.append(("Title scope prefix", "PASS", f"[{scope}]"))
    else:
        results.append(("Title scope prefix", "FAIL", "Title must start with [Frontend], [Backend], or [Integration]"))

    # 2. Native label
    if scope and scope in labels:
        results.append(("Native scope label", "PASS", f"label = {scope}"))
    elif scope:
        results.append(("Native scope label", "FAIL", f"missing '{scope}' in labels; found {labels}"))
    else:
        results.append(("Native scope label", "FAIL", "cannot validate without title scope"))

    # 3. Story points (soft check if field not configured)
    # Story-point field id varies per JIRA instance. Resolve it at setup, never hardcode:
    # export STORY_POINT_FIELD=customfield_XXXXX  (see PROJECT-CONFIG.md).
    # Comma-separate to try several ids in order.
    _sp_ids = [f.strip() for f in os.environ.get("STORY_POINT_FIELD", "").split(",") if f.strip()]
    if not _sp_ids:
        print("WARN: STORY_POINT_FIELD is not set — ask the user for the story-point "
              "custom field id and save it to project-config.local.md. "
              "Skipping the story-point check.", file=sys.stderr)
    story_points_field = next((fields.get(f) for f in _sp_ids if fields.get(f) is not None), None)
    try:
        sp = float(story_points_field) if story_points_field is not None else None
    except (TypeError, ValueError):
        sp = None
    if sp is not None and 0 < sp <= 8:
        expected = {"Frontend": 5, "Backend": 3, "Integration": 3}.get(scope)
        if expected is None:
            results.append(("Story points", "PASS", str(int(sp) if sp == int(sp) else sp)))
        elif int(sp) == expected:
            results.append(("Story points", "PASS", f"{int(sp)} (matches {scope} expectation {expected})"))
        else:
            results.append(("Story points", "FAIL", f"{int(sp)} does not match {scope} expectation {expected}"))
    elif story_points_field is None:
        results.append(("Story points", "WARN", "story point custom field not configured on this project"))
    elif sp is not None:
        results.append(("Story points", "FAIL", f"{sp} exceeds max 8"))
    else:
        results.append(("Story points", "FAIL", "invalid story point value"))

    # 4. Description sections
    required_frontend_sections = ["📬 User Story", "🔆 Scope", "🎨 Figma Design References", "🌈 Design Theme", "🖼️ Logos & Icons", "📷 Figma Screenshots", "✅ Acceptance Criteria", "💻 Technical Notes", "🔌 Local AI Bridge Endpoints", "📊 Story Points"]
    required_backend_sections = ["📬 User Story", "🔆 Scope", "✅ Acceptance Criteria", "💻 Technical Notes", "📊 Story Points"]
    required_integration_sections = required_frontend_sections

    required_sections = {
        "Frontend": required_frontend_sections,
        "Backend": required_backend_sections,
        "Integration": required_integration_sections,
    }

    if scope:
        missing = [h for h in required_sections[scope] if not _has_section(description, h)]
        if missing:
            results.append(("Description sections", "FAIL", f"missing: {', '.join(missing)}"))
        else:
            results.append(("Description sections", "PASS", f"all {len(required_sections[scope])} present"))
    else:
        results.append(("Description sections", "FAIL", "cannot validate without title scope"))

    # 5. AC presence
    ac_header_match = re.search(r"^(.*\s)?Acceptance Criteria\s*(.*)", description, re.DOTALL | re.IGNORECASE | re.MULTILINE)
    if ac_header_match:
        ac_body = ac_header_match.group(2).strip()
        # Jira wiki markup items: # item and #* sub-item
        ac_items = [l for l in ac_body.splitlines() if re.match(r"^\s*#\*?\s", l.strip())]
        if ac_items:
            results.append(("Acceptance criteria items", "PASS", f"{len(ac_items)} items"))
        else:
            results.append(("Acceptance criteria items", "FAIL", "section exists but no #/#* items"))
    else:
        results.append(("Acceptance criteria items", "FAIL", "no Acceptance Criteria section"))

    # 6. Attachments
    has_screenshot = any(fn.lower().endswith(".png") or fn.lower().endswith(".jpg") for fn in attachment_names)
    has_json_spec = any(fn.lower().endswith(".json") for fn in attachment_names)
    has_backend_doc = "backend-structure-source.txt" in attachment_names
    screenshot_fallback_note = "screenshots could not be rendered" in description.lower() or "figma api rate" in description.lower()

    if scope == "Backend":
        if has_backend_doc:
            results.append(("Attachments", "PASS", "backend-structure-source.txt attached"))
        else:
            results.append(("Attachments", "FAIL", "missing backend-structure-source.txt"))
    elif scope in ("Frontend", "Integration"):
        attachment_issues = []
        if not has_screenshot:
            if screenshot_fallback_note:
                attachment_issues.append("no screenshot PNG/JPG (documented Figma API rate-limit fallback)")
            else:
                attachment_issues.append("no screenshot PNG/JPG")
        if scope == "Integration" and not has_backend_doc:
            attachment_issues.append("missing backend-structure-source.txt")
        if attachment_issues:
            # If only issue is documented screenshot fallback, it's a WARN; otherwise FAIL
            if len(attachment_issues) == 1 and "documented Figma API rate-limit fallback" in attachment_issues[0]:
                results.append(("Attachments", "WARN", attachment_issues[0]))
            else:
                results.append(("Attachments", "FAIL", "; ".join(attachment_issues)))
        else:
            results.append(("Attachments", "PASS", f"scope={scope} attachments OK"))
    else:
        results.append(("Attachments", "FAIL", "cannot validate without title scope"))

    # Print report
    print(f"# BA Ticket Validation: {key}")
    print(f"**Summary:** {summary}")
    print(f"**Scope:** {scope or 'UNKNOWN'}")
    print(f"**Labels:** {', '.join(labels) if labels else 'none'}")
    print()
    print("| Check | Status | Detail |")
    print("|-------|--------|--------|")
    for check, status, detail in results:
        print(f"| {check} | {status} | {detail} |")

    failures = [r for r in results if r[1] == "FAIL"]
    warnings = [r for r in results if r[1] == "WARN"]
    print()
    if failures:
        print(f"**Result: FAIL** ({len(failures)} critical issue{'s' if len(failures) > 1 else ''})")
        return 1
    if warnings:
        print(f"**Result: PASS with warnings** — ticket meets hard gates, but review warnings.")
        return 0
    print("**Result: PASS** — ticket meets BA workflow hard gates.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
