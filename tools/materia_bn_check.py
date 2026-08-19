#!/usr/bin/env python3
"""Dry-run the write-time gate on a payload without touching remedies.json.

Same checks, same source sizing, no side effects — so a payload can be
corrected before it is applied rather than after. This does not weaken the
gate: apply still re-runs every check itself, and this tool cannot write.

Run:  python3 tools/materia_bn_check.py <payload.json>
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from materia_bn_rebuild import (ROSTER, SOURCE_DIRS, bindings, load_source,  # noqa: E402
                                source_body, preflight, keynote_cap,
                                CONTENT_FIELDS, IDENTITY_FIELDS)


def main():
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    roster = {r["id"]: r for r in
              json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]}
    sources = {k: load_source(v) for k, v in SOURCE_DIRS.items()}
    bind = bindings()

    problems = 0
    for rid, fields in payload.items():
        if rid.startswith("$"):
            continue
        if rid not in roster:
            print(f"  {rid}: not in roster")
            problems += 1
            continue
        if not bind.get(rid):
            print(f"  {rid}: no bound source")
            problems += 1
            continue
        bad = set(fields) & IDENTITY_FIELDS
        if bad:
            print(f"  {rid}: identity field(s) {sorted(bad)}")
            problems += 1
            continue
        unknown = set(fields) - CONTENT_FIELDS
        if unknown:
            print(f"  {rid}: unknown field(s) {sorted(unknown)}")
            problems += 1
            continue
        chars = sum(len(source_body(sources[s].get(e)))
                    for s, e in bind[rid].items())
        for p in preflight(rid, fields, chars):
            print(f"  {rid}: {p}")
            problems += 1
        if "keynotes" not in fields:
            print(f"  {rid}: note - no keynotes in payload "
                  f"(cap would be {keynote_cap(chars)} for {chars:,} chars)")
    print(f"{'PROBLEMS: ' + str(problems) if problems else 'clean'}"
          f"  ({len(payload)} entries)")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
