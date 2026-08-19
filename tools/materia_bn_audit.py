#!/usr/bin/env python3
"""Audit the existing Bangla materia medica in remedies.json.

The rebuild instruction is explicit that the 686 existing entries are legacy
content, not authority: "Do not preserve a statement merely because it already
exists in remedies.json." This turns that from a principle into a list — which
entries have a source to be checked against at all, and which break the
instruction's own rules on their face.

It deliberately does not try to verify Bangla clinical claims against English
source text; that needs reading, not string matching, and a checker that
pretended to do it would licence exactly the false confidence the rules warn
about. What it does check is everything decidable:

  * whether the remedy has any bound source (docs/materia-identity.json).
    A remedy with Bangla content and no source cannot be verified at all.
  * keynote inflation — §8 says keynotes are what makes a remedy
    recognisable, not a dump of ordinary symptoms.
  * an entry that is thin *relative to how much source exists*. A short entry
    over a short source is correct; §19 forbids padding a remedy out to look
    complete.
  * the same symptom repeated across fields — §23/§14.
  * potency_notes whose numbers appear in no dose-bearing sentence of the
    bound source. §18 allows source-derived historical usage and forbids
    inventing a schedule. The comparison looks at every sentence mentioning
    drops/grains/potency, not only the Dose section, because Boericke states
    doses inline too — checking the Dose section alone wrongly flagged Nitro
    Muriatic Acid, whose "three to five drops three times a day" is in the
    lead paragraph.
  * miasm and thermal asserted where no source is bound — §12/§13 say leave
    empty rather than guess.
  * an empty potency_notes where the source does state a dose. An empty value
    is otherwise correct — the rules require "" or [] rather than a guess when
    the source is silent — so only the reverse case is a finding.
  * English left inside Bangla prose, remedy names excepted.

Run:  python3 tools/materia_bn_audit.py [--csv]
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
IDENTITY = ROOT / "docs" / "materia-identity.json"
SOURCE_DIRS = {
    "boericke": ROOT / "assets" / "data" / "materia" / "boericke",
    "clarke": ROOT / "assets" / "data" / "materia" / "clarke",
}

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def load_source(dirpath):
    out = {}
    if not dirpath.exists():
        return out
    for f in sorted(dirpath.glob("*.json")):
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def source_text(entry, dose_only=False):
    """Whole entry, or just the Dose/Dosage section.

    The potency check compares against the Dose section alone. Matching the
    whole entry made the check useless: a "3" appears somewhere in almost any
    remedy's text, so a Bangla note of "৩–৫ ফোঁটা" was accepted even when the
    source's actual dose was "Five to ten drops"."""
    if not entry:
        return ""
    if dose_only:
        # Not just the Dose section. Boericke also states doses inline —
        # Nitro Muriatic Acid's lead reads "Almost a specific in Oxaluria ...
        # Three to five drops three times a day" — and narrowing to the Dose
        # section reported that perfectly source-derived note as invented.
        parts = []
        for sec in entry.get("sections", []):
            if re.match(r"dose|dosage", (sec.get("h") or ""), re.I):
                parts += [r.get("t", "") for r in sec.get("runs", [])]
        # Sweep the lead and body for inline doses, but NOT the provenance
        # block: that line states how the remedy is *prepared* ("Tincture of
        # fresh fungus.", "Trituration."), which is not a dose instruction.
        # Counting it reported 23 honestly-empty potency fields as omissions.
        body = [r.get("t", "") for r in entry.get("lead", [])]
        for sec in entry.get("sections", []):
            # A Relationship/Compare block describes OTHER remedies, and the
            # doses printed there belong to them: Citrus vulgaris's compare-block
            # carries Citric Acid's "one dram to 8 ozs of water". Counting it
            # would attribute another remedy's dose to this one — the same
            # source-separation error the rules forbid.
            if re.match(r"relation|compare", (sec.get("h") or ""), re.I):
                continue
            body += [r.get("t", "") for r in sec.get("runs", [])]
        # Boericke prints some quantities under "Non-homeopathic Uses" and both
        # authors write doses in roman numerals ("gtt xx.", "gr. v."). Expand the
        # numerals so a Bangla note quoting them is not reported as invented.
        body = [ROMAN_DOSE.sub(_roman_to_digits, t) for t in body]
        # Split only where a new sentence really starts (next fragment begins
        # with a capital or bracket). Splitting after every period broke at
        # abbreviations — "The dose was 2-5 mgr. in twenty-four hours" lost its
        # own quantity to the following fragment.
        for sent in re.split(r"(?<=[.;])\s+(?=[A-Z(\[])", " ".join(body)):
            if not re.search(r"\b(?:drops?|gtt|grains?|gr|doses?|tincture|"
                             r"potenc\w*|dilut\w*|attenuat\w*|triturat\w*|"
                             r"ounces?|oz|drachms?|drams?|minims?|mgr|grammes?|"
                             r"times a day|every \w+ hours?)\b", sent, re.I):
                continue
            # and it must actually name an amount, strength or frequency
            if re.search(r"\b(after|following)\s+(the\s+)?\w+\s+dose", sent, re.I):
                continue
            # An account of what a poisoning or overdose produced is not a dose
            # instruction either: Spigelia marilandica's "mania ... induced in a
            # boy from large and frequent doses" describes harm, not prescribing.
            if re.search(r"\b(poison\w*|overdos\w*|induced|swallow\w*|took|"
                         r"drank|ate|taken|contained|containing)\b", sent, re.I):
                continue
            # "It might be well to prove a tincture of ..." proposes a future
            # proving; it prescribes nothing.
            if re.search(r"\b(might|ought|would be well)\b", sent, re.I):
                continue
            if re.search(r"\d", sent) or re.search(
                    r"\b(" + "|".join(WORD_NUM) + r"|lower|lowest|higher|highest"
                    r"|material|small|large)\b", sent, re.I):
                parts.append(sent)
        return " ".join(parts)
    parts = [r.get("t", "") for r in entry.get("lead", [])]
    parts += [r.get("t", "") for r in entry.get("provenance", [])]
    for sec in entry.get("sections", []):
        parts += [r.get("t", "") for r in sec.get("runs", [])]
    return " ".join(parts)


# Boericke spells his doses out — "Tincture, one to five drops; three times a
# day" — so a digits-only comparison reported every one of them as unsupported.

# ── roman-numeral doses ─────────────────────────────────────────────────────
ROMAN_DOSE = re.compile(r"\b(?:gtt|gr|m)\.?\s*([ivxlc]{1,7})\b", re.I)
_ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}


def _roman_to_digits(m):
    """Rewrite "gr. v." as "gr. 5" so numeric comparison can see the amount."""
    s, total, prev = m.group(1).lower(), 0, 0
    for ch in reversed(s):
        v = _ROMAN.get(ch, 0)
        total += -v if v < prev else v
        prev = max(prev, v)
    return m.group(0).replace(m.group(1), str(total)) if total else m.group(0)

WORD_NUM = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "twelve": "12", "fifteen": "15", "twenty": "20", "thirty": "30",
    "sixty": "60", "hundred": "100", "half": "1",
}


def numbers(s):
    s = str(s or "").translate(BN_DIGITS)
    found = set(re.findall(r"\d+", s))
    # "twenty-four hours" is a quantity as much as "24 hours" is
    for tens, tv in (("twenty", 20), ("thirty", 30), ("forty", 40),
                     ("fifty", 50), ("sixty", 60)):
        for unit, uv in (("one", 1), ("two", 2), ("three", 3), ("four", 4),
                         ("five", 5), ("six", 6), ("seven", 7), ("eight", 8),
                         ("nine", 9)):
            if re.search(rf"\b{tens}-{unit}\b", s, re.I):
                found.add(str(tv + uv))
    for w, d in WORD_NUM.items():
        if re.search(r"\b" + w + r"\b", s, re.I):
            found.add(d)
    return found

BN = re.compile(r"[ঀ-৿]")
LATIN_WORD = re.compile(r"[A-Za-z]{3,}")

# The style guide puts remedy, botanical AND author names on do_not_translate,
# so a prover's or authority's surname inside a Bangla intro is correct
# attribution, not an untranslated leak. The check had no way to know that and
# reported 41 of them (Hering, Clarke, Hale, Mure ...) as errors. Listing the
# names explicitly keeps the check's real job intact: it still catches English
# *prose* left in the intro.
SOURCE_NAMES = {
    "hahnemann", "hering", "clarke", "boericke", "kent", "burnett", "cooper",
    "teste", "guernsey", "farrington", "berridge", "nash", "hale", "mure",
    "allen", "drysdale", "chrestien", "meredith", "landesmann", "aegidi",
    "houghton", "moffatt", "burdick", "lembke", "kopp", "hofer", "cushing",
    "ussher", "thompson", "simpson", "tyler", "wilkinson", "fitch", "kunze",
    "croker", "demesnes", "paine", "yingling", "hammond", "baldwin", "gee",
    "goullon", "grading", "rademacher", "serrand", "buchmann", "mackechnie",
    "mossa", "schwencke", "talcott", "lutze", "skinner", "dunham", "wesselhoeft",
    "wesselhaft", "birdsall", "winterburn", "leonard", "carleton", "harvey",
    "geiser", "oehme", "hempel", "martin", "esmond", "ingalls", "hilbert",
    "brunton", "linnaeus", "galen", "dioscorides", "stoerck", "snow", "foss",
    "smith", "vance", "watts", "gohrwisch", "mitchell", "schneider", "cartier",
    "aguilar", "arriaga", "fröhling", "frohling", "wingfield", "bleim",
    "lassar", "virchow", "kalieniczensko", "barrich", "caspar", "tunzelmann",
    "ray", "mohr", "baker", "anderson", "jones", "briggs", "payne", "hoyne",
    "raue", "boger", "sanic", "burr", "moffat", "chim", "curie", "macfarlan",
    "garth", "chelidonin", "condurangin", "populin", "saccharin",
    # further prover/authority surnames, botanical genera and journal titles
    # met while recreating entries — same do_not_translate category
    "marsh", "matricaria", "paul", "pitet", "aegidi", "pterocarpus",
    "ashburton", "world", "recorder", "advocate", "homoeopathy", "hom",
    "artemisia", "chiococca", "angophora", "kakerlac", "petasites",
    "hansen", "marsupium", "erinaceus", "australiense", "lippe",
    "richter", "nichol", "dudgeon", "nicholls", "tyrrell", "grauvogl",
    "cash", "donner", "landsmann", "solanin", "adonidin", "sanguinarin",
    "dworzack", "cathcart", "pasteur", "neidhard", "burt", "ozanam", "fischer",
    "sir", "humphrey", "davy", "roussel", "dubs", "kopp", "convers", "reyes",
    "mclaughlin", "meredith", "lux", "guernsey", "dietz", "mccoy", "wright",
    "haynes", "edson", "petroz", "ghose", "sarat", "chandra", "duncan",
    "nottingham", "ussher", "combermale", "huchard", "crookes", "lamy",
    "marme", "jousset", "lyonnet", "drysdale", "eserine", "picrotoxine",
    "ameke", "julio", "noack", "trinks", "jeanes", "demeures", "nenning",
    "kalieniczensko", "berridge", "croker", "lembke", "franz", "hartlaub",
    "jose", "jos", "reyes", "bojota", "columbia",
}
# A dosage schedule reads as a frequency instruction; a historical note does
# not. "৩x থেকে ৩০" is a potency range, "দিনে ৩ বার" is a prescription.
DOSAGE = re.compile(r"(দিনে|প্রতিদিন|ঘণ্টা|বার\s*করে|প্রতি\s*\d|সকাল-বিকাল)")

LIST_FIELDS = ["keynotes", "mental", "general", "clinical_uses", "modalities"]
KEYNOTE_MAX = 12          # §8/§20: a keynote list past this is a symptom dump


def remedy_words(roster):
    """Every word that appears in a remedy name, plus the standard
    abbreviations. Remedy names are on do_not_translate, so finding one inside
    Bangla prose is correct usage, not an untranslated leak — the check flagged
    "Nux সর্বদাই যেন বেসুরো" until it knew that."""
    words = set()
    for r in roster:
        for w in re.findall(r"[A-Za-z]{2,}", r.get("name", "")):
            words.add(w.lower())
        ab = r.get("abbr") or ""
        for w in re.findall(r"[A-Za-z]{2,}", ab):
            words.add(w.lower())
    ident = ROOT / "tools" / "materia_bn_remedies.json"
    if ident.exists():
        doc = json.loads(ident.read_text(encoding="utf-8"))
        for v in (doc.get("remedies") or {}).values():
            for key in ("abbrev", "long"):
                for w in re.findall(r"[A-Za-z]{2,}", v.get(key) or ""):
                    words.add(w.lower())
    return words


def norm_claim(s):
    """Loose key for spotting the same symptom written twice."""
    s = re.sub(r"[^ঀ-৿a-zA-Z ]+", " ", str(s or "")).lower()
    return " ".join(s.split())


def main():
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]
    ident = {}
    if IDENTITY.exists():
        doc = json.loads(IDENTITY.read_text(encoding="utf-8"))
        for b in doc.get("bindings", []):
            ident[b["id"]] = {k: v for k, v in b.get("sources", {}).items()
                              if v.get("entry")}

    sources = {k: load_source(v) for k, v in SOURCE_DIRS.items()}
    rx_words = remedy_words(roster)
    findings = defaultdict(list)
    counts = Counter()
    has_bn = 0

    for r in roster:
        rid, name = r["id"], r["name"]
        bn_fields = [f for f in LIST_FIELDS if r.get(f)]
        has_content = bool(r.get("bangla_intro") or bn_fields)
        if has_content:
            has_bn += 1
        src = ident.get(rid, {})

        # ── unverifiable: content with nothing to check it against ──────────
        # Marked `unverified` by tools/materia_bn_mark.py rather than cleaned
        # up, because guessing would replace unverifiable content with invented
        # content. Only an *unmarked* one is a finding now.
        if has_content and not src:
            if r.get("verification") != "unverified":
                findings["no_source_binding_unmarked"].append((rid, name, ""))
            else:
                counts["marked_unverified"] += 1

        # ── keynote inflation ───────────────────────────────────────────────
        kn = r.get("keynotes") or []
        if len(kn) > KEYNOTE_MAX:
            findings["keynote_inflation"].append((rid, name, f"{len(kn)} keynotes"))

        # ── same claim in more than one field ───────────────────────────────
        seen = {}
        for f in LIST_FIELDS:
            for item in (r.get(f) or []):
                k = norm_claim(item)
                if not k:
                    continue
                if k in seen and seen[k] != f:
                    findings["duplicate_across_fields"].append(
                        (rid, name, f"{seen[k]} + {f}: {str(item)[:44]}"))
                seen[k] = f

        # ── duplicates inside one field ─────────────────────────────────────
        for f in LIST_FIELDS:
            vals = [norm_claim(x) for x in (r.get(f) or [])]
            dup = [v for v, c in Counter(vals).items() if v and c > 1]
            for d in dup:
                findings["duplicate_within_field"].append((rid, name, f"{f}: {d[:44]}"))

        # ── potency numbers that the source does not support ────────────────
        pn = str(r.get("potency_notes") or "")
        if pn and DOSAGE.search(pn):
            want = numbers(pn)
            have, any_dose = set(), False
            for sname in src:
                dose = source_text(sources[sname].get(rid), dose_only=True)
                if dose:
                    any_dose = True
                    have |= numbers(dose)
            if not any_dose:
                # no Dose section anywhere; fall back to the whole entry so a
                # dose stated in running text still counts
                for sname in src:
                    have |= numbers(source_text(sources[sname].get(rid)))
            missing = sorted(want - have, key=int)
            if missing:
                findings["potency_not_in_source"].append(
                    (rid, name, f"{pn[:40]} | source lacks {missing}"))
            elif not src:
                findings["potency_unverifiable"].append((rid, name, pn[:44]))

        # ── asserted classification with no source to support it ────────────
        for f in ("miasm", "thermal"):
            if r.get(f) and not src:
                findings[f"{f}_without_source"].append((rid, name, str(r[f])[:30]))

        # ── English inside Bangla prose ─────────────────────────────────────
        intro = str(r.get("bangla_intro") or "")
        if intro and BN.search(intro):
            # The style guide's approved format is "বাংলা (English term)", and
            # remedy, botanical and author names are on do_not_translate. So a
            # Latin word inside parentheses is correct, not a leak — flagging
            # them reported Kino's "(Angophora lanceolata)" as an error.
            outside = re.sub(r"\([^)]*\)", " ", intro)
            # Æ/æ are single codepoints; without folding, "Ægidi" reached the
            # word scanner as "gidi" and looked like an English fragment.
            outside = (outside.replace("Æ", "Ae").replace("æ", "ae")
                              .replace("Œ", "Oe").replace("œ", "oe"))
            for w in LATIN_WORD.findall(outside):
                # a botanical family (Ranunculaceae, Papaveraceae ...) — the
                # style guide keeps botanical names untranslated
                if w.lower().endswith(("aceae", "eae", "idae", "inosae", "osae")):
                    continue
                if w.lower() in {"x", "c", "m", "lm", "n", "o"}:
                    continue
                if w.lower() in rx_words:
                    continue        # a remedy name — do_not_translate
                if w.lower() in SOURCE_NAMES:
                    continue        # an author/prover name — do_not_translate
                findings["english_in_bangla_intro"].append((rid, name, w))
                break

        # An empty value is not a defect: the rules say to use "" or [] when the
        # source has no reliable information, and to leave it rather than guess.
        # What is worth flagging is the opposite — empty here while the source
        # plainly carries the material.
        if not pn:
            for sname in src:
                dose = source_text(sources[sname].get(rid), dose_only=True)
                if dose.strip():
                    findings["potency_empty_but_source_has_dose"].append(
                        (rid, name, dose.strip()[:56]))
                    break

        # ── thin relative to the source, not thin in the abstract ───────────
        # Rubia Tinctorum has one keynote because Clarke's entire entry is four
        # lines. §19 forbids manufacturing symptoms to make every remedy look
        # structurally complete, so a short entry over a short source is
        # correct. Only a short entry over a *substantial* source is a gap.
        src_chars = sum(len(source_text(sources[s2].get(rid))) for s2 in src)

        # ── the reverse of thin: more keynotes than the source can support ──
        # The same proportional rule the writer now enforces
        # (materia_bn_rebuild.keynote_cap). Legacy entries that exceed it are
        # reported as a backlog for source-based recreation, never auto-trimmed
        # — cutting them by guess is the failure this whole pass avoided.
        cap = max(3, min(12, src_chars // 250))
        if len(kn) > cap:
            findings["keynotes_over_source_cap"].append(
                (rid, name, f"{len(kn)} keynotes, cap {cap} "
                            f"({src_chars:,} source chars)"))

        if len(kn) < 2 and not r.get("general") and src_chars > 1500:
            findings["thin_vs_source"].append(
                (rid, name, f"{len(kn)} keynotes vs {src_chars:,} source chars"))

        counts["roster"] += 1

    print("=" * 70)
    print("EXISTING BANGLA MATERIA MEDICA — AUDIT")
    print("=" * 70)
    print(f"  roster remedies              : {counts['roster']}")
    print(f"  with Bangla materia medica   : {has_bn}")
    print(f"  with at least one bound source: "
          f"{sum(1 for r in roster if ident.get(r['id']))}")
    print(f"  marked unverified (no source) : {counts['marked_unverified']}")
    print(f"  recreated from source         : "
          f"{sum(1 for r in roster if r.get('bn_rebuilt'))}")
    print()
    order = ["no_source_binding_unmarked", "keynotes_over_source_cap",
             "thin_vs_source", "keynote_inflation",
             "duplicate_across_fields", "duplicate_within_field",
             "potency_not_in_source", "potency_unverifiable",
             "miasm_without_source",
             "thermal_without_source", "english_in_bangla_intro",
             "potency_empty_but_source_has_dose"]
    for k in order:
        rows = findings.get(k, [])
        print(f"  {k:26} {len(rows)}")
    print()
    for k in order:
        rows = findings.get(k, [])
        if not rows:
            continue
        print(f"--- {k} ({len(rows)}) ---")
        for rid, name, extra in rows[:8]:
            print(f"    {rid:12} {name[:28]:30} {extra}")
        if len(rows) > 8:
            print(f"    ... and {len(rows) - 8} more")

    if "--csv" in sys.argv:
        out = ROOT / "docs" / "materia-bn-audit.csv"
        with out.open("w", encoding="utf-8") as fh:
            fh.write("issue,remedy_id,remedy_name,detail\n")
            for k, rows in findings.items():
                for rid, name, extra in rows:
                    esc = str(extra).replace('"', "'")
                    fh.write(f'{k},{rid},"{name}","{esc}"\n')
        print(f"\nwritten: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
