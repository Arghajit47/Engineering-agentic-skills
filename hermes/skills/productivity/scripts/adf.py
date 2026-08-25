#!/usr/bin/env python3
"""
Markdown subset -> Atlassian Document Format (ADF) v3, plus a validator.

Every JIRA description, comment and reply in this pipeline must be ADF. Hand-writing
ADF is tedious and error-prone, so skills author in the Markdown subset they already
use for templates and convert here.

    python3 adf.py --in body.md --out body.adf.json
    python3 adf.py --in body.md                    # to stdout
    python3 adf.py --validate body.adf.json
    echo "# Hi" | python3 adf.py

Supported: headings, paragraphs, bullet/ordered lists, tables, fenced code blocks,
blockquotes, horizontal rules, panels (see below), and inline `code`, **bold**,
*italic*, [links](url).

Panels — a line of the form:

    :::success Verdict: PASS
    Optional extra paragraph.
    :::

becomes an ADF panel. Types: info, note, success, warning, error.
"""
import argparse
import json
import re
import sys

PANEL_TYPES = {"info", "note", "success", "warning", "error"}
INLINE = re.compile(
    r"(?P<code>`[^`]+`)"
    r"|(?P<bold>\*\*[^*]+\*\*)"
    r"|(?P<italic>(?<!\*)\*(?!\*)[^*]+\*(?!\*))"
    r"|(?P<link>\[[^\]]+\]\([^)]+\))"
)


# ----------------------------------------------------------------- inline
def text_nodes(s):
    """Split a string into ADF text nodes, applying marks. Never emits empty text."""
    out, pos = [], 0

    def plain(t):
        if t:
            out.append({"type": "text", "text": t})

    for m in INLINE.finditer(s):
        plain(s[pos:m.start()])
        if m.group("code"):
            out.append({"type": "text", "text": m.group()[1:-1],
                        "marks": [{"type": "code"}]})
        elif m.group("bold"):
            out.append({"type": "text", "text": m.group()[2:-2],
                        "marks": [{"type": "strong"}]})
        elif m.group("italic"):
            out.append({"type": "text", "text": m.group()[1:-1],
                        "marks": [{"type": "em"}]})
        else:
            label, href = re.match(r"\[([^\]]+)\]\(([^)]+)\)", m.group()).groups()
            out.append({"type": "text", "text": label,
                        "marks": [{"type": "link", "attrs": {"href": href}}]})
        pos = m.end()
    plain(s[pos:])
    return out or [{"type": "text", "text": " "}]


def para(s):
    return {"type": "paragraph", "content": text_nodes(s)}


def cell(kind, s):
    # A table cell needs a block child; bare text is invalid.
    return {"type": kind, "attrs": {}, "content": [para(s.strip() or " ")]}


# ----------------------------------------------------------------- blocks
def convert(md):
    lines = md.replace("\r\n", "\n").split("\n")
    content, i = [], 0

    while i < len(lines):
        ln = lines[i]
        s = ln.strip()

        if not s:
            i += 1
            continue

        # fenced code
        if s.startswith("```"):
            lang = s[3:].strip() or None
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            node = {"type": "codeBlock", "content": [{"type": "text", "text": "\n".join(buf) or " "}]}
            if lang:
                node["attrs"] = {"language": lang}
            content.append(node)
            continue

        # panel
        if s.startswith(":::"):
            head = s[3:].strip().split(None, 1)
            ptype = head[0] if head and head[0] in PANEL_TYPES else "info"
            first = head[1] if len(head) > 1 else ""
            i += 1
            body = []
            if first:
                body.append(para(first))
            while i < len(lines) and lines[i].strip() != ":::":
                if lines[i].strip():
                    body.append(para(lines[i].strip()))
                i += 1
            i += 1
            content.append({"type": "panel", "attrs": {"panelType": ptype},
                            "content": body or [para(" ")]})
            continue

        # horizontal rule
        if re.fullmatch(r"-{3,}|\*{3,}|_{3,}", s):
            content.append({"type": "rule"}); i += 1
            continue

        # heading
        m = re.match(r"(#{1,6})\s+(.*)", s)
        if m:
            content.append({"type": "heading",
                            "attrs": {"level": min(len(m.group(1)), 6)},
                            "content": text_nodes(m.group(2).strip())})
            i += 1
            continue

        # table: header row then a separator of ---
        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            def cells(row):
                return [c.strip() for c in row.strip().strip("|").split("|")]
            rows = [{"type": "tableRow",
                     "content": [cell("tableHeader", c) for c in cells(lines[i])]}]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append({"type": "tableRow",
                             "content": [cell("tableCell", c) for c in cells(lines[i])]})
                i += 1
            content.append({"type": "table",
                            "attrs": {"isNumberColumnEnabled": False, "layout": "default"},
                            "content": rows})
            continue

        # blockquote
        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip()); i += 1
            content.append({"type": "blockquote",
                            "content": [para(x) for x in buf if x] or [para(" ")]})
            continue

        # lists
        m = re.match(r"([-*+]|\d+[.)])\s+(.*)", s)
        if m:
            ordered = not m.group(1) in ("-", "*", "+")
            items = []
            while i < len(lines):
                mm = re.match(r"\s*([-*+]|\d+[.)])\s+(.*)", lines[i])
                if not mm:
                    break
                is_ord = mm.group(1) not in ("-", "*", "+")
                if is_ord != ordered:
                    break
                items.append({"type": "listItem", "content": [para(mm.group(2).strip())]})
                i += 1
            content.append({"type": "orderedList" if ordered else "bulletList",
                            "content": items})
            continue

        # paragraph — join until a blank line or a new block starts
        buf = [s]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (not nxt or nxt.startswith(("#", "|", ">", "```", ":::"))
                    or re.match(r"([-*+]|\d+[.)])\s+", nxt)
                    or re.fullmatch(r"-{3,}|\*{3,}|_{3,}", nxt)):
                break
            buf.append(nxt); i += 1
        content.append(para(" ".join(buf)))

    return {"type": "doc", "version": 1, "content": content or [para(" ")]}


# ----------------------------------------------------------------- validate
WIKI = [
    (re.compile(r"^\s*h[1-6]\.\s", re.M), "Jira wiki heading (h2.)"),
    (re.compile(r"\|\|"), "Jira wiki table header (||)"),
    (re.compile(r"\{code[:}]|\{panel[:}]|\{quote\}"), "Jira wiki macro ({code}, {panel})"),
    (re.compile(r"<(table|tr|td|th|b|i|br|div|p)\b", re.I), "raw HTML"),
    (re.compile(r"^\s*#{1,6}\s", re.M), "raw Markdown heading"),
    (re.compile(r"^\s*\|[^|\n]*\|", re.M), "raw Markdown table"),
    (re.compile(r"\*\*[^*\n]+\*\*"), "raw Markdown bold"),
    (re.compile(r"`[^`\n]+`"), "raw Markdown inline code"),
]
BLOCKS = {"paragraph", "heading", "table", "codeBlock", "bulletList", "orderedList",
          "blockquote", "panel", "rule", "mediaSingle", "mediaGroup", "expand"}


def validate(doc):
    errs = []
    if not isinstance(doc, dict):
        return ["top level is not an object"]
    if doc.get("type") != "doc":
        errs.append('top level "type" must be "doc"')
    if doc.get("version") != 1:
        errs.append('top level "version" must be 1')
    if not isinstance(doc.get("content"), list) or not doc["content"]:
        errs.append('"content" must be a non-empty array')
        return errs

    def walk(n, path):
        if not isinstance(n, dict) or "type" not in n:
            errs.append(f"{path}: node is not an object with a type"); return
        t = n["type"]
        if t == "text":
            if not isinstance(n.get("text"), str) or n["text"] == "":
                errs.append(f"{path}: empty text node (invalid ADF — the API rejects the whole request)")
            for pat, label in WIKI:
                if pat.search(n.get("text", "")):
                    errs.append(f"{path}: text contains {label} — convert it to real ADF nodes")
            return
        if t in ("tableCell", "tableHeader"):
            kids = n.get("content") or []
            if not kids or any(k.get("type") == "text" for k in kids):
                errs.append(f"{path}: {t} must contain block nodes (wrap text in a paragraph)")
        if t == "codeBlock":
            for k in n.get("content") or []:
                if k.get("marks"):
                    errs.append(f"{path}: codeBlock text must not carry marks")
        for idx, k in enumerate(n.get("content") or []):
            walk(k, f"{path}.{t}[{idx}]")

    for idx, n in enumerate(doc["content"]):
        if n.get("type") not in BLOCKS:
            errs.append(f"content[{idx}]: '{n.get('type')}' is not a valid top-level block")
        walk(n, f"content[{idx}]")
    return errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp")
    ap.add_argument("--out", dest="out")
    ap.add_argument("--validate", dest="val")
    a = ap.parse_args()

    if a.val:
        doc = json.load(open(a.val, encoding="utf-8"))
        errs = validate(doc)
        if errs:
            print("INVALID ADF — do not post this:", file=sys.stderr)
            for e in errs:
                print("  - " + e, file=sys.stderr)
            return 1
        print("valid ADF")
        return 0

    md = open(a.inp, encoding="utf-8").read() if a.inp else sys.stdin.read()
    doc = convert(md)
    errs = validate(doc)
    if errs:
        print("conversion produced invalid ADF:", file=sys.stderr)
        for e in errs:
            print("  - " + e, file=sys.stderr)
        return 1
    out = json.dumps(doc, indent=2, ensure_ascii=False)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(out + "\n")
        print(f"wrote {a.out}")
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
