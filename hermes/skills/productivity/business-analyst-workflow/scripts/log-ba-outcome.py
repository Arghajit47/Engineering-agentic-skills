#!/usr/bin/env python3
"""Log a BA workflow outcome to a local SQLite audit database.

Usage:
  python3 log-ba-outcome.py KAN-123 PASS --missing-screenshots 0 --missing-labels 0
  python3 log-ba-outcome.py KAN-124 FAIL --failure-reason "missing backend-structure-source.txt"

The database lives at ~/.hermes/audit/ba-outcomes.db.
"""

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

DB_DIR = Path.home() / ".hermes" / "audit"
DB_PATH = DB_DIR / "ba-outcomes.db"


def init_db() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_key TEXT NOT NULL,
            scope TEXT,
            result TEXT NOT NULL,
            failure_reason TEXT,
            missing_screenshots INTEGER DEFAULT 0,
            missing_json_specs INTEGER DEFAULT 0,
            missing_labels INTEGER DEFAULT 0,
            missing_acs INTEGER DEFAULT 0,
            story_points INTEGER,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def log_outcome(args: argparse.Namespace) -> int:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        INSERT INTO outcomes (
            ticket_key, scope, result, failure_reason,
            missing_screenshots, missing_json_specs, missing_labels,
            missing_acs, story_points, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            args.ticket_key.upper(),
            args.scope,
            args.result.upper(),
            args.failure_reason,
            args.missing_screenshots,
            args.missing_json_specs,
            args.missing_labels,
            args.missing_acs,
            args.story_points,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    print(f"Logged {args.result.upper()} for {args.ticket_key.upper()}")
    return 0


def report(args: argparse.Namespace) -> int:
    if not DB_PATH.exists():
        print("No outcomes recorded yet.")
        return 0
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        """
        SELECT
            result,
            COUNT(*) AS count,
            SUM(missing_screenshots) AS missing_screenshots,
            SUM(missing_json_specs) AS missing_json_specs,
            SUM(missing_labels) AS missing_labels,
            SUM(missing_acs) AS missing_acs
        FROM outcomes
        GROUP BY result
        """
    )
    rows = cur.fetchall()
    conn.close()
    print("| Result | Count | Missing Screenshots | Missing JSON Specs | Missing Labels | Missing ACs |")
    print("|--------|-------|---------------------|--------------------|----------------|-------------|")
    for row in rows:
        print(f"| {row[0]} | {row[1]} | {row[2] or 0} | {row[3] or 0} | {row[4] or 0} | {row[5] or 0} |")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Log/report BA workflow outcomes")
    sub = parser.add_subparsers(dest="command", required=True)

    log = sub.add_parser("log", help="Log an outcome")
    log.add_argument("ticket_key")
    log.add_argument("result", choices=["PASS", "FAIL"])
    log.add_argument("--scope")
    log.add_argument("--failure-reason")
    log.add_argument("--missing-screenshots", type=int, default=0)
    log.add_argument("--missing-json-specs", type=int, default=0)
    log.add_argument("--missing-labels", type=int, default=0)
    log.add_argument("--missing-acs", type=int, default=0)
    log.add_argument("--story-points", type=int)
    log.set_defaults(func=log_outcome)

    rep = sub.add_parser("report", help="Show aggregate outcomes")
    rep.set_defaults(func=report)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
