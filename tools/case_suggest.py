#!/usr/bin/env python3
"""Generate assets/data/case-suggest.json — the autosuggest vocabulary for
the case-taking form's free-text symptom fields.

Why a separate file rather than reusing the repertory data directly: Kent
alone is 6.9MB and the remedy table another 2.6MB. Loading that on case.html
so a practitioner can get a dropdown while typing "ঘুম" would cost more than
the whole rest of the form. Instead this pulls out just the rubric *names*
relevant to each field, grouped by the chapters that field asks about, and
drops the remedy lists entirely — the part that carries the weight.

The suggestions are a partial bridge to the repertory, not a substitute for
it: picking one writes the rubric's own wording into the field so that the
later repertory search (which reads the same vocabulary) finds it again.
That only works if the wording is genuinely Kent's, so nothing here is
paraphrased or invented.

Bangla comes only from the repertory's bn_glossary, by the same composeBn
route repertory.js uses at runtime, so a suggestion reads identically in
both places. A rubric whose Bangla the glossary cannot fully attest keeps
its English name and is marked partial — a plausible-looking guess would
send the practitioner to the wrong rubric, which is worse than English.

Run after changing the repertory data or the field map:
    python3 tools/case_suggest.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KENT = ROOT / "assets" / "data" / "repatories" / "kent_rubrics.json"
REMEDIES = ROOT / "assets" / "data" / "repatories" / "remedies.json"
OUT = ROOT / "assets" / "data" / "case-suggest.json"

# Which Kent chapters each form field draws its vocabulary from. Keyed by the
# chapter's English name exactly as it appears in kent_rubrics.json, so a
# typo here fails loudly in the report at the bottom rather than silently
# producing an empty group.
FIELD_MAP = {
    "mentalCause":         ["Mind"],
    "childBehavior":       ["Mind"],
    "foodNotes":           ["Stomach", "Generalities"],
    "digestionNotes":      ["Stomach", "Abdomen"],
    "stoolNotes":          ["Stool", "Rectum"],
    "urineNotes":          ["Urine", "Bladder", "Kidneys", "Urethra",
                            "Urinary organs", "Prostate gland"],
    "sleepNotes":          ["Sleep"],
    "sweatNotes":          ["Perspiration"],
    "thermalNotes":        ["Chill", "Fever", "Perspiration"],
    "skinNotes":           ["Skin"],
    "sexualNotes":         ["Genitalia male", "Genitalia female"],
    "modalityNotes":       ["Generalities"],
    "beforeAfterSymptoms": ["Generalities"],
    "medicineReaction":    ["Generalities"],
    # Pill groups with an "অন্যান্য" box: the typed-in value is exactly where a
    # selection field turns into free text, so it needs the same vocabulary as
    # a notes field. The other three ("occupation", "bloodGroup", "potency")
    # are not symptoms and are deliberately left plain.
    "mainCategory":        ["*"],
    "onsetHow":            ["Generalities"],
    # The three "what is actually wrong" fields are not scoped to one body
    # system, so they see the whole book. This is the bulk of the payload,
    # which is why it is one shared group all three fields point at rather
    # than three copies of it.
    "priorityComplaint":   ["*"],
    "concomitantSymptoms": ["*"],
    "peculiarSymptoms":    ["*"],
    "illnessStory":        ["*"],
    "observationNotes":    ["*"],
}

# Rubric names that are navigational rather than clinical. Suggesting these
# wastes a dropdown row on something no one would ever write in a case.
SKIP_NAME = re.compile(r"^(see|compare|note|generalities)\b", re.I)

RE_CLOCK = re.compile(r"^(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)$", re.I)


def split_parts(name: str):
    """Port of splitParts() in repertory.js — split on commas at bracket
    depth zero only, so a parenthesised list of alternatives stays whole."""
    out, depth, cur = [], 0, ""
    for ch in name:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    out.append(cur.strip())
    return [p for p in out if p]


def seg_bn(seg: str, gloss: dict):
    """Port of segBn(). Returns None when the glossary has no entry, which is
    the signal to keep the English segment rather than invent Bangla."""
    s = seg.strip()
    if not s:
        return ""
    for key in (s, s.lower(), s[:1].upper() + s[1:]):
        if key in gloss and gloss[key]:
            return gloss[key]
    return None


def compose_bn(name: str, gloss: dict):
    """Returns (bangla_or_empty, fully_translated). Mirrors composeBn(), plus
    the fully-translated flag the runtime does not need but this build does,
    so partially-English suggestions can be reported and deprioritised."""
    parts = split_parts(name)
    out, hits = [], 0
    for p in parts:
        bn = seg_bn(p, gloss)
        if bn is None:
            out.append(p.strip())
        else:
            hits += 1
            out.append(bn)
    if not hits:
        return "", False
    return ", ".join(out), hits == len(parts)


def main():
    kent = json.loads(KENT.read_text(encoding="utf-8"))
    rem_raw = json.loads(REMEDIES.read_text(encoding="utf-8"))
    gloss = rem_raw.get("bn_glossary", {})

    chapters = kent["repertory_rubrics"]
    by_name = {ch["name_en"]: ch for ch in chapters}

    # ---- collect candidate terms per chapter -------------------------------
    # Level is Kent's nesting depth. A level-4 rubric's name is a fragment
    # ("night, on waking") that means nothing without its ancestors, so it
    # reads as noise in a flat dropdown; level 1-2 names stand alone.
    MAX_LEVEL = 2
    # A rubric with one remedy is a real observation but a poor suggestion —
    # it is too specific to be what someone half-way through typing meant.
    MIN_REMEDIES = 3
    # Terms per chapter for a field scoped to that chapter, and for the
    # unscoped complaint fields that see all 38. A dropdown shows about eight
    # rows and the ranking below puts the broadest rubrics first, so raising
    # these mostly adds tail entries nobody types — it cost 250KB to learn
    # that, hence the deliberately small numbers.
    PER_CHAPTER = 120
    ALL_PER_CHAPTER = 30

    chapter_terms = {}

    for ch in chapters:
        rows = []
        for rb in ch.get("rubrics", []):
            name = (rb.get("name") or "").strip()
            if not name or SKIP_NAME.match(name):
                continue
            if (rb.get("level") or 1) > MAX_LEVEL:
                continue
            r = rb.get("r") or ""
            n = len([t for t in r.split(",") if t]) if r else 0
            if n < MIN_REMEDIES:
                continue
            bn, full = compose_bn(name, gloss)
            rows.append({
                "name": name,
                "bn": bn,
                "full": full,
                "n": n,
                "level": rb.get("level") or 1,
            })

        # Rank by clinical breadth first. Sorting on level before count looked
        # sensible but silently dropped the most important rubrics in the book:
        # this Kent files many head rubrics at level 2 ("Sadness, mental
        # depression", n=249; "Restlessness, nervousness", n=249), and Mind
        # alone has over 120 level-1 rubrics, so no level-2 entry ever
        # survived the per-chapter cut. Remedy count is what actually says how
        # widely a rubric is indicated, so it leads; level and Bangla
        # completeness only break ties.
        rows.sort(key=lambda x: (-x["n"], not x["full"], x["level"], x["name"]))
        rows = rows[:PER_CHAPTER]

        # [english, bangla, remedy_count] — bangla is "" when unattested, and
        # the UI falls back to the English name for those.
        terms = [[x["name"], x["bn"], x["n"]] for x in rows]
        chapter_terms[ch["name_en"]] = {
            "bn": ch.get("name_bn", ""),
            "num": ch.get("number"),
            "terms": terms,
        }

    # ---- assemble the groups the form actually asks for --------------------
    # Groups name their chapters rather than carrying copies of the terms.
    # Inlining them duplicated every scoped chapter inside the "all" group as
    # well and doubled the file for no added vocabulary.
    groups = {}
    field_groups = {}
    unknown = []
    # How deep each chapter's list has to go: the largest limit any group asks
    # of it. A chapter only "all" uses needs 30 rows, not 120.
    depth = {}

    for field, chap_names in FIELD_MAP.items():
        if chap_names == ["*"]:
            field_groups[field] = "all"
            continue
        key = "+".join(chap_names)
        for cn in chap_names:
            if cn not in by_name:
                unknown.append((field, cn))
            else:
                depth[cn] = max(depth.get(cn, 0), PER_CHAPTER)
        groups[key] = {"chapters": [cn for cn in chap_names if cn in by_name],
                       "limit": PER_CHAPTER}
        field_groups[field] = key

    all_names = [ch["name_en"] for ch in chapters]
    for cn in all_names:
        depth[cn] = max(depth.get(cn, 0), ALL_PER_CHAPTER)
    groups["all"] = {"chapters": all_names, "limit": ALL_PER_CHAPTER}

    chapter_out = {}
    for cn, d in depth.items():
        src = chapter_terms[cn]
        chapter_out[cn] = {"bn": src["bn"], "num": src["num"],
                           "terms": src["terms"][:d]}

    # ---- remedy names, for the step-9 prescribing fields -------------------
    # Count how many rubrics each remedy appears in, across the whole book.
    # Without it the dropdown had to break ties on name length, which ranked
    # Arsenicum Nitricum over Arsenicum Album by a single character — and
    # punished Bangla labels generally, since the same term is more code units
    # in Bangla than in English. Rubric count is the book's own measure of how
    # widely a remedy is indicated, so a polychrest sorts above its obscure
    # namesakes for real reasons rather than incidentally.
    rx_count = {}
    for ch in chapters:
        for rb in ch.get("rubrics", []):
            r = rb.get("r") or ""
            if not r:
                continue
            for tok in r.split(","):
                if not tok:
                    continue
                idx = tok.split(":", 1)[0]
                if idx.isdigit():
                    i = int(idx)
                    rx_count[i] = rx_count.get(i, 0) + 1

    remedies = []
    for i, rx in enumerate(rem_raw.get("remedies", [])):
        nm = (rx.get("name") or "").strip()
        if not nm:
            continue
        remedies.append([nm, (rx.get("bangla_name") or "").strip(),
                         rx_count.get(i, 0)])
    remedies.sort(key=lambda x: x[0].lower())

    doc = {
        "$generated_by": "tools/case_suggest.py — do not hand-edit",
        "note_bn": (
            "কেস ফর্মের লেখার ঘরে পরামর্শ দেওয়ার জন্য কেন্ট রিপার্টরী থেকে "
            "নেওয়া রুব্রিকের নাম। যে রুব্রিকের বাংলা পরিভাষা নিশ্চিত নয়, "
            "সেটি ইংরেজিতেই রাখা হয়েছে — অনুমান করা বাংলা ভুল রুব্রিকে "
            "পাঠাতে পারে।"
        ),
        "source": "Kent's Repertory (assets/data/repatories/kent_rubrics.json)",
        "selection": {
            "max_level": MAX_LEVEL,
            "min_remedies": MIN_REMEDIES,
            "per_chapter": PER_CHAPTER,
            "per_chapter_in_all_group": ALL_PER_CHAPTER,
            "order": "terms are pre-ranked; a group's limit takes a prefix",
        },
        "fields": field_groups,
        "groups": groups,
        "chapters": chapter_out,
        "remedies": remedies,
    }

    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")

    size = OUT.stat().st_size
    # Counted off what actually shipped, not off the pre-truncation candidate
    # pool — the earlier version reported more Bangla terms than the file
    # contained, because the per-chapter cut happened after the tally.
    total = full = part = none = 0
    for c in chapter_out.values():
        for en, bn, _n in c["terms"]:
            total += 1
            if not bn:
                none += 1
            elif re.search(r"[A-Za-z]", bn):
                part += 1
            else:
                full += 1
    print(f"fields mapped     : {len(field_groups)}")
    print(f"groups            : {len(groups)}")
    print(f"chapters emitted  : {len(chapter_out)} of {len(chapters)}")
    print(f"terms (deduped)   : {total}")
    print(f"  fully Bangla    : {full}")
    print(f"  partial Bangla  : {part}")
    print(f"  English only    : {none}")
    top = sorted(remedies, key=lambda x: -x[2])[:5]
    print(f"remedies          : {len(remedies)}"
          f"  (widest: {', '.join(f'{r[0]} {r[2]}' for r in top)})")
    print(f"written           : {OUT.relative_to(ROOT)}  ({size/1024:.1f}KB)")
    if unknown:
        print("\nWARNING — FIELD_MAP names no such chapter:")
        for field, cn in unknown:
            print(f"  {field}: {cn!r}")


if __name__ == "__main__":
    main()
