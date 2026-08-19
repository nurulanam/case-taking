#!/usr/bin/env python3
"""Split the one merged Boericke entry in the scraped shards.

The scrape ran two consecutive Boericke entries together: Juniperus Communis's
Dose paragraph continues straight into "JUSTICIA ADHATODA ..." and Justicia's
whole entry (Head, Throat, Respiratory, Relationship, Dose) follows inside the
same object. The blob was then filed twice — once under `jun` (named Juniperus)
and once under `~juni-c` (named Justicia) — so BOTH entries claim both remedies'
symptoms.

That is exactly the failure the source-separation rule forbids: read `jun` as it
stands and you would write Justicia's cough, hoarseness and whooping-cough into
Juniperus's Bangla profile.

This splits the blob at the printed heading:
    jun      -> Juniperus lead + the four Juniperus sections, Dose truncated at
                the heading
    ~juni-c  -> Justicia's lead (the text after the heading) + its five sections

Nothing is invented and nothing is deleted: every run of text ends up under the
remedy whose printed heading introduced it.

Run:  python3 tools/materia_fix_boericke_runon.py [--write]
"""
import copy
import json
import re
import sys
from pathlib import Path

SHARD = Path(__file__).resolve().parent.parent / "assets/data/materia/boericke/j.json"
HEADING = "JUSTICIA ADHATODA"
JUNIPER_SECTIONS = 4          # sections 0-3 belong to Juniperus


def main():
    write = "--write" in sys.argv
    doc = json.loads(SHARD.read_text(encoding="utf-8"))
    jun, jus = doc.get("jun"), doc.get("~juni-c")
    if not jun or not jus:
        print("nothing to do: one of the entries is absent")
        return

    dose = jun["sections"][JUNIPER_SECTIONS - 1]
    runs = dose["runs"]
    hit = next((i for i, r in enumerate(runs) if HEADING in r.get("t", "")), None)
    if hit is None:
        print("nothing to do: the run-on heading is not present")
        return

    text = runs[hit]["t"]
    before, after = text.split(HEADING, 1)

    # Juniperus keeps only its own dose sentence(s) and its own sections.
    new_jun = copy.deepcopy(jun)
    new_jun["sections"] = new_jun["sections"][:JUNIPER_SECTIONS]
    new_jun["sections"][-1] = {**dose, "runs": runs[:hit] + [{"t": before.strip()}]}

    # Justicia keeps the text the heading introduces as its lead, plus the
    # sections that followed it.
    lead_text = re.sub(r"\s+", " ", (HEADING + after)).strip()
    new_jus = copy.deepcopy(jus)
    new_jus["name"] = jus.get("name") or "Justicia Adhatoda"
    new_jus["lead"] = [{"t": lead_text}]
    new_jus["sections"] = jun["sections"][JUNIPER_SECTIONS:]

    print(f"jun      : {len(jun['sections'])} -> {len(new_jun['sections'])} sections"
          f"  (dose now: {before.strip()[:60]}...)")
    print(f"~juni-c  : {len(jus['sections'])} -> {len(new_jus['sections'])} sections"
          f"  (lead now: {lead_text[:60]}...)")

    if not write:
        print("\n(dry run — pass --write to save)")
        return
    doc["jun"], doc["~juni-c"] = new_jun, new_jus
    SHARD.write_text(json.dumps(doc, ensure_ascii=False,
                                separators=(",", ":")), encoding="utf-8")
    print("\nwritten")


if __name__ == "__main__":
    main()
