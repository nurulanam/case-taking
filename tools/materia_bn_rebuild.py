#!/usr/bin/env python3
"""Per-remedy Bangla materia medica recreation.

Two modes, matching the instruction's remedy-by-remedy workflow:

    read <id> [<id> ...]     print every bound source's complete text for
                             those remedies, so the source can be read before
                             anything is written
    apply <file.json>        merge recreated Bangla content into remedies.json

Identity is not this tool's business. Bindings come from
docs/materia-identity.json and are treated as settled; `read` will refuse an
id that has no binding rather than guess which source to show.

`apply` can only write the content fields listed in CONTENT_FIELDS. The
identity fields are rejected outright if a payload tries to set them, and the
roster length and order are asserted unchanged before the file is saved —
a rubric's "r" value is an index into this array, so a reorder would silently
repoint every repertory reference in the app.

The input file for `apply` is {remedy_id: {field: value}}. A field set to null
is deleted; a field absent is left alone.
"""
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
IDENTITY = ROOT / "docs" / "materia-identity.json"
SOURCE_DIRS = {
    "boericke": ROOT / "assets" / "data" / "materia" / "boericke",
    "clarke": ROOT / "assets" / "data" / "materia" / "clarke",
}

# Only these may be written.
CONTENT_FIELDS = {
    "bangla_intro", "keynotes", "mental", "general", "modalities",
    "clinical_uses", "cravings_aversions", "sleep", "relationships",
    "potency_notes", "thermal", "thermal_en", "miasm", "family",
    "content_status", "bangla_name",
}
# Never, under any circumstances.
IDENTITY_FIELDS = {"id", "name", "abbr", "in_rubrics", "mm_volume"}

BN = re.compile(r"[ঀ-৿]")


def load_source(dirpath):
    out = {}
    if not dirpath.exists():
        return out
    for f in sorted(dirpath.glob("*.json")):
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def source_body(entry):
    """All the source text for one entry, for sizing purposes."""
    if not entry:
        return ""
    parts = [r.get("t", "") for r in entry.get("lead", [])]
    parts += [r.get("t", "") for r in entry.get("provenance", [])]
    for sec in entry.get("sections", []):
        parts += [r.get("t", "") for r in sec.get("runs", [])]
    return " ".join(parts)


def bindings():
    if not IDENTITY.exists():
        return {}
    doc = json.loads(IDENTITY.read_text(encoding="utf-8"))
    return {b["id"]: {k: v["entry"] for k, v in b.get("sources", {}).items()
                      if v.get("entry")}
            for b in doc.get("bindings", [])}


def runs_text(runs):
    """Flatten runs, marking the source's own emphasis with * so that what
    Boericke and Clarke chose to stress stays visible while reading. That
    emphasis is the source telling us what is characteristic, which is exactly
    what the keynote rules ask us to follow rather than invent."""
    out = []
    for r in runs or []:
        t = r.get("t", "")
        out.append(f"*{t}*" if r.get("em") else t)
    return "".join(out)


# Clarke's entries run to thousands of words because he reproduces the full
# proving symptom by symptom. Those repeat what Boericke already states in
# condensed form; what Clarke uniquely adds is the Clinical list, the
# Characteristics essay, Relations and Causation. --brief keeps Boericke whole
# and narrows Clarke to those, so a remedy can be read without losing anything
# only Clarke has.
# "dose" belongs here too: leaving it out meant Pulsatilla was written up with
# an empty potency_notes while Clarke plainly states "Third to thirtieth
# attenuation" — the audit caught it, but the reading mode caused it.
CLARKE_DISTINCTIVE = ("clinical", "characteristics", "relations", "causation",
                      "dose")


def dump_entry(src, entry, brief=False):
    print(f"\n  ── {src.upper()}: {entry.get('name', '?')} "
          f"{'— ' + entry['common'] if entry.get('common') else ''}")
    if entry.get("provenance"):
        print(f"     [provenance] {runs_text(entry['provenance']).strip()}")
    if entry.get("lead"):
        print(f"     [lead] {runs_text(entry['lead']).strip()}")
    for sec in entry.get("sections", []):
        head = sec.get("h") or ""
        if brief and src == "clarke" and not head.lower().startswith(CLARKE_DISTINCTIVE):
            continue
        bn = f" / {sec['hbn']}" if sec.get("hbn") else ""
        print(f"     [{head}{bn}] {runs_text(sec.get('runs')).strip()}")


def cmd_read(ids, brief=False):
    roster = {r["id"]: r for r in
              json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]}
    sources = {k: load_source(v) for k, v in SOURCE_DIRS.items()}
    bind = bindings()

    for rid in ids:
        r = roster.get(rid)
        if not r:
            print(f"\n### {rid}: NOT IN ROSTER")
            continue
        b = bind.get(rid, {})
        print("\n" + "=" * 72)
        print(f"### {rid}  {r['name']}   [{', '.join(b) or 'NO BOUND SOURCE'}]")
        print("=" * 72)
        if not b:
            print("  no bound source — nothing may be written for this remedy")
            continue
        for src, entry_id in b.items():
            e = sources[src].get(entry_id)
            if e:
                dump_entry(src, e, brief=brief)
        print("\n  ── EXISTING BANGLA (reference only, not authority)")
        for f in ("bangla_name", "family", "thermal", "miasm", "bangla_intro",
                  "keynotes", "mental", "general", "modalities",
                  "clinical_uses", "cravings_aversions", "sleep",
                  "relationships", "potency_notes"):
            if r.get(f):
                print(f"     {f}: {json.dumps(r[f], ensure_ascii=False)[:400]}")


# Checked before writing, not after. Every batch so far has tripped one of
# these — a causation restated as a general symptom, or a keynote list grown
# past the point where it still answers "what makes this remedy
# recognisable?" — and finding out from the audit afterwards means the bad
# data has already been in the file.
KEYNOTE_MAX = 12
LIST_FIELDS = ("keynotes", "mental", "general", "modalities", "clinical_uses")

# ── proportional thinness, enforced at write time ──────────────────────────
# Rubia Tinctorum taught this: Clarke's entire entry for it is four lines, so a
# single keynote is the honest answer and §19 forbids inventing symptoms to make
# the record look complete. Left as an audit check that lesson can be bypassed —
# the next batch just writes twelve keynotes over a four-line source and nobody
# notices until afterwards. So the ceiling is derived from how much source
# actually exists and refused before the write:
#
#     max keynotes = clamp(3, 12, source_chars / 250)
#
# Verified against the 25 remedies already recreated from full Boericke+Clarke
# text: every one sits at or under its cap. It bites only where the source is
# genuinely small.
KEYNOTE_CHARS_EACH = 250
KEYNOTE_FLOOR = 3


def keynote_cap(source_chars):
    return max(KEYNOTE_FLOOR, min(KEYNOTE_MAX, source_chars // KEYNOTE_CHARS_EACH))


def _claim_key(v):
    return " ".join(re.sub(r"[^ঀ-৿a-zA-Z ]+", " ", str(v)).lower().split())


def preflight(rid, fields, source_chars=None):
    """Problems that would make this payload worse than what it replaces."""
    bad = []
    kn = fields.get("keynotes")
    if isinstance(kn, list):
        cap = KEYNOTE_MAX if source_chars is None else keynote_cap(source_chars)
        if len(kn) > cap:
            extra = ("" if source_chars is None
                     else f" for {source_chars:,} chars of source")
            bad.append(f"{len(kn)} keynotes exceeds the cap of {cap}{extra}")
    seen = {}
    for f in LIST_FIELDS:
        for item in (fields.get(f) or []):
            k = _claim_key(item)
            if not k:
                continue
            if k in seen and seen[k] != f:
                bad.append(f"same claim in {seen[k]} and {f}: {str(item)[:40]}")
            seen[k] = f
    for f in LIST_FIELDS:
        vals = [_claim_key(x) for x in (fields.get(f) or [])]
        for v in {x for x in vals if x and vals.count(x) > 1}:
            bad.append(f"repeated inside {f}: {v[:40]}")
    return bad


def cmd_apply(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    doc = json.loads(ROSTER.read_text(encoding="utf-8"),
                     object_pairs_hook=OrderedDict)
    roster = doc["remedies"]
    before_ids = [r["id"] for r in roster]
    by_id = {r["id"]: r for r in roster}
    bind = bindings()

    sources = {k: load_source(v) for k, v in SOURCE_DIRS.items()}
    changed, skipped, refused = 0, [], []
    for rid, fields in payload.items():
        if rid.startswith("$"):
            continue
        r = by_id.get(rid)
        if not r:
            refused.append(f"{rid}: not in roster")
            continue
        if not bind.get(rid):
            # The instruction is explicit that content must come from the bound
            # source. With no binding there is nothing it could have come from.
            refused.append(f"{rid}: no bound source")
            continue
        bad = set(fields) & IDENTITY_FIELDS
        if bad:
            refused.append(f"{rid}: tried to set identity field(s) {sorted(bad)}")
            continue
        unknown = set(fields) - CONTENT_FIELDS
        if unknown:
            refused.append(f"{rid}: unknown field(s) {sorted(unknown)}")
            continue
        src_chars = sum(len(source_body(sources[s].get(eid)))
                        for s, eid in bind[rid].items())
        problems = preflight(rid, fields, src_chars)
        if problems:
            for pb in problems:
                refused.append(f"{rid}: {pb}")
            continue
        touched = False
        for f, v in fields.items():
            if v is None:
                if f in r:
                    del r[f]
                    touched = True
                continue
            if r.get(f) != v:
                r[f] = v
                touched = True
        if touched:
            r["bn_rebuilt"] = True     # which entries have been through this
            changed += 1
        else:
            skipped.append(rid)

    # The roster array is addressed by index from every rubric in every
    # repertory, so its length and order are load-bearing.
    assert [r["id"] for r in roster] == before_ids, "ROSTER ORDER CHANGED"
    assert len(roster) == len(before_ids), "ROSTER LENGTH CHANGED"

    doc["metadata"]["remedies_bn_rebuilt"] = sum(
        1 for r in roster if r.get("bn_rebuilt"))

    if refused:
        print("REFUSED:")
        for x in refused:
            print(f"  {x}")
    ROSTER.write_text(json.dumps(doc, ensure_ascii=False,
                                 separators=(",", ":")), encoding="utf-8")
    print(f"applied  : {changed}")
    print(f"no change: {len(skipped)}")
    print(f"rebuilt so far: {doc['metadata']['remedies_bn_rebuilt']} / {len(roster)}")
    print(f"roster intact: {len(roster)} remedies, order unchanged")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == "read":
        args = [a for a in sys.argv[2:] if a != "--brief"]
        cmd_read(args, brief="--brief" in sys.argv)
    elif cmd == "apply":
        cmd_apply(sys.argv[2])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
