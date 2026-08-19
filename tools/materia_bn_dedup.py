#!/usr/bin/env python3
"""Clear the inherited cross-field duplicates in remedies.json.

115 remedies carry the same string in two fields at once. The rules are clear
about why that is wrong, and they also decide which copy has to go:

  §8   a keynote is a characteristic *symptom* — what makes the remedy
       recognisable — not a disease label. "ডায়াবেটিস" is not a keynote.
  §10  `general` holds systemic features, not diagnoses.
  §14  `clinical_uses` must not become a generic disease list, and a bare
       symptom ("বমি", "মাথা ঘোরা") is not a clinical application.
  §23  do not merge because two strings look alike — decide, then remove one.

So every duplicated string is classified once, by hand, into exactly one of
three groups, and the classification is listed here rather than inferred:

  CONDITION  a diagnosis or named condition -> stays in clinical_uses,
             removed from the symptom field
  SYMPTOM    a bare symptom -> stays in the symptom field, removed from
             clinical_uses
  MENTAL     a mental symptom duplicated between keynotes and mental ->
             stays in `mental`, the more specific field

Nothing is deleted that is not a duplicate: a string is only removed from one
field when it also exists in the other. Identity fields and roster order are
untouched.

Run:  python3 tools/materia_bn_dedup.py [--write]
"""
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"

SYMPTOM_FIELDS = ("keynotes", "general", "mental")

# ── a diagnosis or named condition: keep it in clinical_uses ────────────────
CONDITION = {
    "অতিরিক্ত ঋতুস্রাব", "অতিরিক্ত স্তন্যদানের কুফল", "অস্ত্রোপচারের পরে পেট ফোলা",
    "আঁচিল ও কড়া", "আঁচিল", "উদরশূল ও উদরাময়", "উদরাময়", "উদরাময় ও আমাশয়",
    "ঋতুস্রাবের সমস্যা", "কণ্ঠনালির আক্ষেপ", "কিডনির প্রদাহ", "কিডনির রোগ",
    "কোষ্ঠকাঠিন্য", "ক্যান্সারের ধাতু", "ক্যান্সারের ব্যথা", "খিঁচুনি",
    "খিঁচুনি ও ডলা ধরা", "গলগণ্ড", "গলার ঘা", "গেঁটে বাত", "গ্রন্থি ফোলা",
    "চোখের পক্ষ্মস্নায়ুশূল", "চোখের পাতার আক্ষেপ", "চোখের প্রদাহ",
    "চ্যানকার ও ক্ষত", "জরায়ু স্খলন", "জ্বর", "ঝিল্লিযুক্ত কষ্টকর ঋতুস্রাব",
    "ডায়াবেটিস", "ডিম্বাশয়ের সিস্ট", "তামাকের কুফল", "তোতলামি",
    "দুধ শুকিয়ে যাওয়া", "নাকের পলিপ", "নাকের পিছনের সর্দি ও অ্যাডিনয়েড",
    "নিম্নাঙ্গের পক্ষাঘাত", "পচন (গ্যাংগ্রিন)", "পর্যায়ক্রমিক জ্বর",
    "পাকস্থলীর ক্যান্সার", "পিত্তথলির শূল", "পুরনো হাঁপানি", "প্রসব-ব্যথা",
    "প্রস্টেট বড় হওয়া", "প্লীহার প্রদাহ", "প্লীহার রোগ", "বয়স্কদের অবক্ষয়",
    "বিছানায় প্রস্রাব", "বৃদ্ধ বয়সের আংশিক পক্ষাঘাত", "বৃদ্ধদের চুলকানি",
    "মলদ্বার বেরিয়ে আসা", "মাম্পস", "মূত্রথলির পক্ষাঘাত", "মূত্রথলির সর্দি",
    "মৃগীরোগ", "মৃগীসদৃশ আক্ষেপ", "যকৃৎ ও প্লীহার রোগ",
    "রজোনিবৃত্তিকালের গরমের ঝলক", "শরীরে জল জমা", "শিশুর রাতের কাশি",
    "সায়াটিকা", "সূর্যাঘাত", "সেপটিক অবস্থা", "সোরিয়াসিস", "হাড়ের রোগ",
    "হার্নিয়া", "হুপিং কাশি", "হৃদযন্ত্রের দুর্বলতা", "হৃদযন্ত্রের ভালভের রোগ",
    "অঞ্জনি", "আমাশয়", "ইনফ্লুয়েঞ্জা", "কষ্টকর ঋতুস্রাব", "কৃমি",
    "জঠরনির্গমের রোগ", "জরায়ু স্থানচ্যুতি", "জরায়ুর রক্তস্রাব", "ডিপথেরিয়া",
    "পুরুষত্বহীনতা", "প্রস্টেটের প্রদাহ", "ফোড়া", "ব্রণ", "মোচ",
    "যকৃতের গোলযোগ ও জন্ডিস", "রক্তশূন্যতা", "শিশুর পুষ্টিহীনতা",
    "শ্বেতপ্রদর", "স্নায়ুর অবক্ষয়", "হাঁপানি", "অনিদ্রা",
}

# ── a bare symptom: it is not a clinical application, so clinical_uses is the
#    copy that goes ───────────────────────────────────────────────────────────
SYMPTOM = {
    "আঠালো ঘাম", "কানে শব্দ", "দাঁতব্যথা", "দুর্গন্ধময় বায়ু",
    "দৃষ্টি মিলিয়ে যাওয়া", "নাক দিয়ে রক্ত", "পাকস্থলী ও অন্ত্রের ব্যথা",
    "পেটে বায়ু", "প্রস্রাবে অ্যালবুমিন", "প্রস্রাবে জ্বালা", "বমি",
    "মাথা ঘোরা", "রক্তমিশ্রিত প্রস্রাব", "শরীরের দুর্গন্ধ", "শ্বাসকষ্ট",
    "আক্ষেপ", "উদরশূল", "দেশের জন্য মনকেমন", "পাকস্থলীর উত্তেজনা",
    "প্রচণ্ড পেট ফোলা", "শিরা ফোলা", "হৃদয়ের উত্তেজনা",
    "হৃদস্পন্দনের অনিয়ম", "অনিচ্ছাকৃত হাসি", "চাপা শোক", "প্রলাপ",
    "রাগের আক্রমণ", "স্মৃতিভ্রংশ", "হাইপোকন্ড্রিয়া",
}

# ── duplicated between keynotes and mental: `mental` is the specific field ──
MENTAL = {
    "একা থাকতে চায়", "ঘুমাতে যাওয়ার ভয়", "পাগল হয়ে যাওয়ার ভয়",
    "বকবক করে, দ্রুত কথা বলে", "সাপের ভয়",
}


def key(v):
    return " ".join(re.sub(r"[^ঀ-৿a-zA-Z ]+", " ", str(v)).lower().split())


def main():
    write = "--write" in sys.argv
    doc = json.loads(ROSTER.read_text(encoding="utf-8"),
                     object_pairs_hook=OrderedDict)
    roster = doc["remedies"]
    before_ids = [r["id"] for r in roster]

    known = {key(x): "condition" for x in CONDITION}
    known.update({key(x): "symptom" for x in SYMPTOM})
    known.update({key(x): "mental" for x in MENTAL})

    removed, unclassified, touched = [], [], set()

    for r in roster:
        cu = r.get("clinical_uses") or []
        cu_keys = {key(x) for x in cu}

        # clinical_uses vs a symptom field
        for f in SYMPTOM_FIELDS:
            vals = r.get(f)
            if not vals:
                continue
            keep = []
            for item in vals:
                k = key(item)
                if k in cu_keys:
                    cls = known.get(k)
                    if cls == "condition":
                        removed.append((r["id"], f, "clinical_uses", item))
                        touched.add(r["id"])
                        continue          # drop from the symptom field
                    if cls != "symptom":
                        unclassified.append((r["id"], f, item))
                keep.append(item)
            if len(keep) != len(vals):
                r[f] = keep

        # the reverse direction: a bare symptom listed as a clinical use
        drop_cu = []
        for item in cu:
            k = key(item)
            if known.get(k) != "symptom":
                continue
            if any(k in {key(x) for x in (r.get(f) or [])} for f in SYMPTOM_FIELDS):
                drop_cu.append(item)
        if drop_cu:
            r["clinical_uses"] = [x for x in cu if x not in drop_cu]
            for x in drop_cu:
                removed.append((r["id"], "clinical_uses", "symptom field", x))
            touched.add(r["id"])

        # keynotes vs mental
        mental_keys = {key(x) for x in (r.get("mental") or [])}
        kn = r.get("keynotes") or []
        drop_kn = [x for x in kn
                   if key(x) in mental_keys and known.get(key(x)) == "mental"]
        if drop_kn:
            r["keynotes"] = [x for x in kn if x not in drop_kn]
            for x in drop_kn:
                removed.append((r["id"], "keynotes", "mental", x))
            touched.add(r["id"])

    assert [r["id"] for r in roster] == before_ids, "ROSTER ORDER CHANGED"
    assert len(roster) == len(before_ids), "ROSTER LENGTH CHANGED"

    print(f"remedies touched : {len(touched)}")
    print(f"copies removed   : {len(removed)}")
    kinds = {}
    for rid, frm, kept, item in removed:
        kinds[f"{frm} -> kept in {kept}"] = kinds.get(f"{frm} -> kept in {kept}", 0) + 1
    for k, v in sorted(kinds.items(), key=lambda x: -x[1]):
        print(f"   {v:4}  removed from {k}")
    if unclassified:
        print(f"\nUNCLASSIFIED (left untouched, need a decision): {len(unclassified)}")
        for rid, f, item in unclassified[:20]:
            print(f"   {rid:12} {f:10} {item}")

    if not write:
        print("\n(dry run — pass --write to save)")
        return
    ROSTER.write_text(json.dumps(doc, ensure_ascii=False,
                                 separators=(",", ":")), encoding="utf-8")
    print(f"\nwritten: roster intact at {len(roster)} remedies, order unchanged")


if __name__ == "__main__":
    main()
