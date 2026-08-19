#!/usr/bin/env python3
"""Mark remedies whose Bangla content cannot be verified against any source.

19 roster remedies carry Bangla materia medica but have no bound source in
docs/materia-identity.json, so there is nothing to check their claims against.
§26 says what cannot be verified must be marked `unverified` rather than
presented as established fact — and equally, it must not be "cleaned up" by
guessing, which would just replace unverifiable content with invented content.

So this only labels. It writes no clinical content, which is why it is separate
from materia_bn_rebuild.py — that tool refuses an unbound remedy outright, and
should keep refusing.

The marker is `verification`, which materia.js does not render (it draws from
its own field list), so this stays internal as §29 asks.

Run:  python3 tools/materia_bn_mark.py [--write]
"""
import json
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
IDENTITY = ROOT / "docs" / "materia-identity.json"

LIST_FIELDS = ("keynotes", "mental", "general", "modalities", "clinical_uses")


def main():
    write = "--write" in sys.argv
    doc = json.loads(ROSTER.read_text(encoding="utf-8"),
                     object_pairs_hook=OrderedDict)
    roster = doc["remedies"]
    before = [r["id"] for r in roster]

    bound = set()
    if IDENTITY.exists():
        for b in json.loads(IDENTITY.read_text(encoding="utf-8"))["bindings"]:
            if any(v.get("entry") for v in b.get("sources", {}).values()):
                bound.add(b["id"])

    marked, cleared = [], []
    for r in roster:
        has_content = bool(r.get("bangla_intro") or
                           any(r.get(f) for f in LIST_FIELDS))
        if has_content and r["id"] not in bound:
            if r.get("verification") != "unverified":
                r["verification"] = "unverified"
                r["verification_note"] = (
                    "কোনো bound source নেই — এই ভুক্তির দাবিগুলি যাচাই করা যায়নি")
                marked.append((r["id"], r["name"]))
        elif r.get("verification") == "unverified" and r["id"] in bound:
            # a source was bound later; the marker no longer applies
            del r["verification"]
            r.pop("verification_note", None)
            cleared.append((r["id"], r["name"]))

    assert [r["id"] for r in roster] == before, "ROSTER ORDER CHANGED"
    assert len(roster) == len(before), "ROSTER LENGTH CHANGED"
    doc["metadata"]["remedies_unverified"] = sum(
        1 for r in roster if r.get("verification") == "unverified")

    print(f"marked unverified : {len(marked)}")
    for rid, nm in marked:
        print(f"   {rid:12} {nm}")
    if cleared:
        print(f"marker cleared (source since bound): {len(cleared)}")
    if not write:
        print("\n(dry run — pass --write to save)")
        return
    ROSTER.write_text(json.dumps(doc, ensure_ascii=False,
                                 separators=(",", ":")), encoding="utf-8")
    print(f"\nwritten: roster intact at {len(roster)}, order unchanged")


if __name__ == "__main__":
    main()
