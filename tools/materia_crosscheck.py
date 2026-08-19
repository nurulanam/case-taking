#!/usr/bin/env python3
"""Cross-check the materia medica data against oorep.sql.

Three datasets have to agree and currently do not:

  assets/data/repatories/remedies.json      the master roster (725, order is
                                            load-bearing: a rubric's "r" field
                                            indexes into it)
  assets/data/materia/boericke/*.json       scraped Boericke source text
  oorep.sql                                 the OOREP Postgres dump, whose
                                            mminfo 20 is the same Boericke

materia.js resolves a remedy's source text by the *roster id*
(srcEntry(src, id) -> shard[id]), so a Boericke entry filed under the wrong id
does not fail loudly — it silently shows one remedy's drug picture on another
remedy's page. That is the class of error this checks for.

Run:  python3 tools/materia_crosscheck.py
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "oorep.sql"
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
BOERICKE = ROOT / "assets" / "data" / "materia" / "boericke"
CLARKE = ROOT / "assets" / "data" / "materia" / "clarke"
BOERICKE_MMINFO = "20"


def copy_block(name):
    rows, cap = [], False
    with SQL.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if not cap:
                if line.startswith(f"COPY public.{name} "):
                    cap = True
                continue
            if line.startswith("\\."):
                break
            rows.append(line.rstrip("\n").split("\t"))
    return rows


# Share the builder's folding so the two tools agree on when two spellings are
# the same remedy. Comparing raw names reported 89 false "missing" entries,
# because the roster writes Natrum/Kali where the dump writes Natrium/Kalium.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from materia_boericke_build import fold as norm, match_heading  # noqa: E402


def load_shards(d):
    out = {}
    if not d.exists():
        return out
    for f in sorted(d.glob("*.json")):
        for eid, e in json.loads(f.read_text(encoding="utf-8")).items():
            out[eid] = e
    return out


def entry_chars(e):
    n = sum(len(r.get("t", "")) for r in e.get("lead", []))
    for s in e.get("sections", []):
        n += sum(len(r.get("t", "")) for r in s.get("runs", []))
    return n


def main():
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]
    by_id = {r["id"]: r for r in roster}
    boe = load_shards(BOERICKE)
    cla = load_shards(CLARKE)

    rem = {f[0]: {"abbrev": f[1], "long": f[2]}
           for f in copy_block("remedy") if len(f) >= 3}
    chapters = {f[0]: {"heading": f[2], "remedy_id": f[3]}
                for f in copy_block("mmchapter")
                if len(f) >= 4 and f[1] == BOERICKE_MMINFO}
    secs = defaultdict(list)
    for f in copy_block("mmsection"):
        if len(f) >= 7 and f[1] in chapters:
            secs[f[1]].append(f)

    print("=" * 68)
    print("COUNTS")
    print("=" * 68)
    print(f"  roster (remedies.json)   : {len(roster)}")
    print(f"  boericke json entries    : {len(boe)}")
    print(f"  clarke json entries      : {len(cla)}")
    print(f"  oorep boericke chapters  : {len(chapters)}")
    print(f"  oorep remedy table       : {len(rem)}")
    print("  NOTE: oorep.sql carries only ONE materia medica (Boericke);")
    print("        Clarke is not in the dump and cannot be checked against it.")

    # ── 1. duplicate remedies inside the roster ────────────────────────────
    print("\n" + "=" * 68)
    print("1. ROSTER INTEGRITY")
    print("=" * 68)
    seen_ids = defaultdict(list)
    seen_names = defaultdict(list)
    for i, r in enumerate(roster):
        seen_ids[r["id"]].append(i)
        seen_names[norm(r["name"])].append((i, r["id"]))
    dup_id = {k: v for k, v in seen_ids.items() if len(v) > 1}
    dup_nm = {k: v for k, v in seen_names.items() if len(v) > 1}
    print(f"  duplicate ids            : {len(dup_id)}")
    for k, v in list(dup_id.items())[:10]:
        print(f"     {k} at {v}")
    print(f"  same name, different id  : {len(dup_nm)}")
    for k, v in list(dup_nm.items())[:10]:
        print(f"     {k!r} -> {v}")

    # ── 2. boericke entries filed under a roster id that is a different
    #       remedy. This is the silent one: the page renders, wrongly.
    print("\n" + "=" * 68)
    print("2. BOERICKE ENTRY vs ROSTER IDENTITY  (mis-linked = wrong text shown)")
    print("=" * 68)
    mismatched, orphan = [], []
    for eid, e in sorted(boe.items()):
        r = by_id.get(eid)
        if not r:
            orphan.append((eid, e.get("name", "")))
            continue
        a, b = norm(r["name"]), norm(e.get("name", ""))
        if a and b and a != b and not (a.startswith(b) or b.startswith(a)):
            mismatched.append((eid, r["name"], e.get("name", "")))
    print(f"  boericke ids not in roster: {len(orphan)}")
    for x in orphan[:12]:
        print(f"     {x[0]:14} {x[1]}")
    print(f"  NAME MISMATCH             : {len(mismatched)}")
    for eid, rn, bn in mismatched:
        print(f"     id={eid:12} roster={rn:32} boericke={bn}")

    # ── 3. oorep chapters with no boericke json counterpart ────────────────
    print("\n" + "=" * 68)
    print("3. CONTENT PRESENT IN oorep BUT MISSING FROM THE JSON")
    print("=" * 68)
    # Resolve a chapter the same way the builder does, then ask whether that
    # entry actually reached the shards. Comparing names alone reported 66
    # false misses, because a linked entry is stored under the roster's
    # spelling ("Pulsatilla Nigricans") not the dump's ("Pulsatilla
    # Pratensis").
    boe_names = {norm(e.get("name", "")) for e in boe.values()}
    roster_idx = {}
    for i, r in enumerate(roster):
        roster_idx.setdefault(norm(r["name"]), (i, r["id"], r["name"]))
    missing = []
    for cid, c in chapters.items():
        rid = c["remedy_id"]
        long = rem.get(rid, {}).get("long", "")
        hit, _rank = match_heading(c["heading"], roster_idx)
        if hit and hit[1] in boe:
            continue
        if norm(long) in boe_names or norm(c["heading"]) in boe_names:
            continue
        chars = sum(len(f[6]) for f in secs.get(cid, []))
        missing.append((long or c["heading"], rem.get(rid, {}).get("abbrev", ""),
                        len(secs.get(cid, [])), chars))
    missing.sort(key=lambda x: -x[3])
    print(f"  remedies in oorep with no json entry: {len(missing)}")
    for long, ab, ns, ch in missing:
        in_roster = any(norm(r["name"]) == norm(long) for r in roster)
        flag = "IN ROSTER" if in_roster else "not in roster"
        print(f"     {long:30} {ab:10} {ns:3} sections {ch:6,} chars   [{flag}]")

    # ── 4. json entries whose text is materially shorter than oorep's ──────
    print("\n" + "=" * 68)
    print("4. TEXT COMPLETENESS  (json vs oorep, matched by name)")
    print("=" * 68)
    oorep_by_name = {}
    for cid, c in chapters.items():
        long = rem.get(c["remedy_id"], {}).get("long", "") or c["heading"]
        oorep_by_name[norm(long)] = sum(len(f[6]) for f in secs.get(cid, []))
    thin, tot_j, tot_o = [], 0, 0
    for eid, e in boe.items():
        key = norm(e.get("name", ""))
        if key not in oorep_by_name:
            continue
        j, o = entry_chars(e), oorep_by_name[key]
        tot_j += j
        tot_o += o
        if o and j < o * 0.75:
            thin.append((e.get("name", ""), o, j))
    print(f"  matched text: json {tot_j:,} chars vs oorep {tot_o:,} "
          f"({tot_j / tot_o * 100:.1f}%)")
    print(f"  entries under 75% of oorep's text: {len(thin)}")
    for nm, o, j in sorted(thin, key=lambda x: x[1] - x[2], reverse=True)[:15]:
        print(f"     {nm[:32]:34} oorep={o:6,} json={j:6,}")

    # ── 5. roster remedies with no source text at all ──────────────────────
    print("\n" + "=" * 68)
    print("5. ROSTER COVERAGE")
    print("=" * 68)
    no_src = [r for r in roster if r["id"] not in boe and r["id"] not in cla]
    only_bn = [r for r in roster
               if r["id"] not in boe and r["id"] not in cla and r.get("keynotes")]
    print(f"  roster remedies with NO source text (boericke or clarke): {len(no_src)}")
    print(f"     ...of which already carry Bangla materia medica       : {len(only_bn)}")
    print(f"  roster remedies with a boericke entry : "
          f"{sum(1 for r in roster if r['id'] in boe)}")
    print(f"  roster remedies with a clarke entry   : "
          f"{sum(1 for r in roster if r['id'] in cla)}")
    print(f"  roster with full bangla MM (keynotes) : "
          f"{sum(1 for r in roster if r.get('keynotes'))}")


if __name__ == "__main__":
    main()
