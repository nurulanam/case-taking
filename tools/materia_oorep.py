#!/usr/bin/env python3
"""Extract the authoritative remedy table and Boericke chapter map from oorep.sql.

oorep.sql is a Postgres dump of the OOREP project. Its Boericke text is
character-for-character the same as the shards under
assets/data/materia/boericke/ (verified against Sulphur), but the dump carries
three things the scrape does not:

  * remedy.nameabbrev — the standard homeopathic abbreviation, from the
    database rather than inferred. The brief is explicit that an existing
    abbreviation must be used and never invented, and this replaces the
    rubric-dominance guess that tools/materia_bn.py had to fall back on.
  * mmchapter.remedy_id — each materia medica chapter's remedy identity, so a
    chapter never has to be matched to a remedy by its title.
  * namealt — alternative spellings, which widen cross-reference detection.

Writes tools/materia_bn_remedies.json.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "oorep.sql"
OUT = Path(__file__).resolve().parent / "materia_bn_remedies.json"
BOERICKE_MMINFO = "20"


def copy_block(name):
    """Rows of one COPY ... FROM stdin block, streamed (the dump is 42MB)."""
    rows, capture = [], False
    with SQL.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if not capture:
                if line.startswith(f"COPY public.{name} "):
                    capture = True
                continue
            if line.startswith("\\."):
                break
            rows.append(line.rstrip("\n").split("\t"))
    return rows


def pg_array(v):
    """Postgres text[] literal -> list. \\N is SQL NULL."""
    if not v or v == "\\N":
        return []
    v = v.strip()
    if v.startswith("{") and v.endswith("}"):
        v = v[1:-1]
    return [x.strip().strip('"') for x in v.split(",") if x.strip()]


def main():
    remedies = {}
    for f in copy_block("remedy"):
        if len(f) < 3:
            continue
        rid, abbrev, long = f[0], f[1], f[2]
        alt = pg_array(f[3] if len(f) > 3 else "")
        remedies[rid] = {"abbrev": abbrev, "long": long, "alt": alt}

    chapters = {}
    for f in copy_block("mmchapter"):
        if len(f) < 4 or f[1] != BOERICKE_MMINFO:
            continue
        cid, heading, rid = f[0], f[2], f[3]
        chapters[cid] = {"heading": heading,
                         "remedy_id": None if rid == "\\N" else rid}

    # long name -> abbreviation, for matching the scraped entries by name
    by_long = {}
    for rid, r in remedies.items():
        by_long[r["long"].strip().lower()] = r["abbrev"]
        for a in r["alt"]:
            by_long.setdefault(a.strip().lower(), r["abbrev"])

    # The book's own bibliographic record, so a generated entry can state
    # where it came from instead of it being assumed. There is no edition
    # column in mminfo, so edition stays empty rather than being guessed at.
    src = {}
    for f in copy_block("mminfo"):
        if len(f) < 11 or f[0] != BOERICKE_MMINFO:
            continue
        first, last = f[5], f[4]
        src = {
            "author": (f"{first} {last}".strip() if first != "\\N" else last),
            "work": f[3] if f[3] != "\\N" else "",
            "edition": "",
            "publisher": f[6] if f[6] != "\\N" else "",
            "year": f[7] if f[7] != "\\N" else "",
            "access": f[9],
            "$edition_note": ("mminfo carries no edition column, so the edition "
                              "is left empty rather than inferred"),
        }

    linked = sum(1 for c in chapters.values() if c["remedy_id"])
    doc = {
        "$generated_by": "tools/materia_oorep.py — from oorep.sql",
        "source": "OOREP dump, mminfo 20 = Boericke, Pocket Manual, 1906, Public",
        "source": src,
        "remedies": remedies,
        "boericke_chapters": chapters,
        "abbrev_by_long_name": by_long,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"remedies            : {len(remedies)}")
    print(f"boericke chapters   : {len(chapters)} ({linked} linked to a remedy)")
    print(f"name -> abbreviation: {len(by_long)}")
    print(f"written             : {OUT.relative_to(ROOT)} "
          f"({OUT.stat().st_size/1024:.0f}KB)")


if __name__ == "__main__":
    main()
