#!/usr/bin/env python3
"""Create dashboard signal-scanner tables."""

import argparse

from sqlalchemy import inspect

from database.signal_scanner_db import engine, init_db

TABLES = {"signal_scanner_settings", "signal_scanner_events"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Create dashboard signal-scanner tables.")
    parser.add_argument(
        "--status",
        action="store_true",
        help="Report whether the scanner tables exist without creating them.",
    )
    args = parser.parse_args()

    existing = set(inspect(engine).get_table_names())
    missing = TABLES - existing
    if args.status:
        if missing:
            print(f"Signal scanner migration pending; missing tables: {', '.join(sorted(missing))}")
            return 1
        print("Signal scanner migration already applied.")
        return 0

    init_db()
    existing = set(inspect(engine).get_table_names())
    missing = TABLES - existing
    if missing:
        print(f"Signal scanner migration failed; missing tables: {', '.join(sorted(missing))}")
        return 1
    print("Signal scanner tables are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
