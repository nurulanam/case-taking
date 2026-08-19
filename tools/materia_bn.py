#!/usr/bin/env python3
"""Bangla translation layer for Boericke's Materia Medica.

Why a translation *memory* rather than editing the source files: the style
guide is explicit that "Original English source must remain unchanged in the
source field" (source_preservation), and that a repeated English phrase must
always get the same approved Bangla (duplicate_policy, consistency_policy).
Both fall out of keying translations on the source string:

  tools/materia_bn_memory.json   {english run text: {"bn": ..., "st": ...}}

The Boericke shards under assets/data/materia/boericke/ are never written to.
`build` expands the memory into parallel per-letter files under
assets/data/materia/boericke.bn/, which is what materia.js loads — one shard
per letter, so the reader still only fetches the letter it is showing.

Each built entry carries `h`, a hash of its source runs. If Boericke's text is
ever re-extracted the hash stops matching and the reader falls back to English
instead of showing Bangla lined up against the wrong sentence — a silent
misalignment in clinical text is worse than no translation.

Runs marked em:1 are NOT all remedy names, which was the first wrong
assumption here: Boericke emphasises ordinary words too, and treating every
em run as a name left 253 "Worse" and 171 "Better" untranslated — the agg./
amel. distinction the guide is most emphatic about. An em run is classified
(is_xref) and only dropped when it actually references other remedies.

Cross-references are removed from the symptom fields rather than translated.
"burning in eyes (Ars; Bell)" must not become "চোখে জ্বালাপোড়া (আর্সেনিকাম
অ্যালবাম)", which reads as if Arsenicum were part of the Sulphur symptom.

Subcommands:
    stats      coverage by category and by remedy
    aliases    derive the abbreviation table -> materia_bn_aliases.json
    build      memory -> per-run Bangla shards (bilingual reader)
    structure  memory -> the structured 12-field entries the app reads
    validate   run the guide's automated_validation checks over the memory
    todo N     print the highest-value untranslated runs, as JSON to fill in
"""
import collections
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "data" / "materia" / "boericke"
OUT = ROOT / "assets" / "data" / "materia" / "boericke.bn"
MEM = Path(__file__).resolve().parent / "materia_bn_memory.json"
GUIDE = ROOT / "bangla-translation-style-guide.json"
SUGGEST = ROOT / "assets" / "data" / "case-suggest.json"

BN = re.compile(r"[ঀ-৿]")
LATIN = re.compile(r"[A-Za-z]")


# ─────────────────────────── source reading ───────────────────────────

def load_source():
    """[(letter, entry_id, name, [(kind, index, run), ...]), ...]

    `kind` is 'lead' or the section's English heading; index is the run's
    position within that list, which is what the built shards key on.
    """
    out = []
    for f in sorted(SRC.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for eid, e in data.items():
            runs = [("lead", i, r) for i, r in enumerate(e.get("lead", []))]
            for si, s in enumerate(e.get("sections", [])):
                for i, r in enumerate(s.get("runs", [])):
                    runs.append((("sec", si), i, r))
            out.append((f.stem, eid, e.get("name", ""), runs, e))
    return out


def entry_hash(entry):
    """Hash of every source run, in order. Guards positional alignment."""
    h = hashlib.sha1()
    for r in entry.get("lead", []):
        h.update(("L" + r.get("t", "")).encode("utf-8"))
    for s in entry.get("sections", []):
        h.update(("H" + (s.get("h") or "")).encode("utf-8"))
        for r in s.get("runs", []):
            h.update(("R" + r.get("t", "")).encode("utf-8"))
    return h.hexdigest()[:16]


# ─────────────────────────── categories ───────────────────────────
# What kind of run this is, which decides whether it can be translated
# mechanically or needs real clinical translation.

RE_NOALPHA = re.compile(r"^[^A-Za-z]*$")
RE_LABEL = re.compile(
    r"^[\s.]*(compare|antidote|antidotes|complementary|relationship|incompatible"
    r"|similar|followed by|see also|dose)\s*:?[\s.]*$", re.I)
RE_POTENCY = re.compile(
    r"^[\s.]*((tincture|first|second|third|sixth|twelfth|thirtieth|two hundredth"
    r"|higher|lower|two|three|six|twelve|thirty|200|30|6|12|3|1|2)"
    r"[\s\w,.\-–—()]*potenc(y|ies)|tincture)[\s.]*$", re.I)


def categorise(run):
    if run.get("em"):
        return "remedy_name"          # do_not_translate
    t = (run.get("t") or "").strip()
    if RE_NOALPHA.match(t):
        return "punct"
    if RE_LABEL.match(t):
        return "label"
    if RE_POTENCY.match(t):
        return "potency"
    if len(t) <= 30:
        return "fragment"
    return "prose"


# ─────────────────────────── remedy-name resolution ───────────────────────────
# Boericke's Relationship/Compare sections are dense with standard homeopathic
# abbreviations ("Ars", "Rhus", "Puls"). The style guide asks for
# "Bangla equivalent (English medical term)" for names, but also forbids
# guessing an ambiguous term. Both are satisfied by resolving an abbreviation
# only when the evidence decides it:
#
#   an abbreviation resolves to the remedy whose *rubric count in Kent* both
#   clears a floor (200 rubrics) and beats the runner-up by a wide margin (3x).
#
# That is a measurement, not an opinion — and it is what catches the trap a
# plain prefix match falls into: "Silica" prefix-matches the near-empty
# "Silica Marina" before the polychrest "Silicea Terra", which would have
# pointed the reader at the wrong remedy. Anything under the threshold stays
# in English exactly as Boericke wrote it.
ALIAS_FILE = Path(__file__).resolve().parent / "materia_bn_aliases.json"

# The two cases the automatic rule cannot settle, decided on how Boericke
# himself writes and recorded here so the judgement is visible rather than
# buried in code.
ALIAS_OVERRIDES = {
    "Phos": ("Phosphorus",
             "Boericke writes the acid explicitly as 'Phos ac', so a bare "
             "'Phos' is Phosphorus. Rubric margin alone is only 2x."),
    "Phosph": ("Phosphorus", "Same reasoning as 'Phos'."),
    "Phosphor": ("Phosphorus", "Same reasoning as 'Phos'."),
    "Silica": ("Silicea Terra",
               "'Silica Marina' carries no rubrics and is not the remedy "
               "Boericke means; the polychrest is Silicea Terra."),
}

# A candidate must at least appear in Kent. Being the only match in *our*
# remedy table does not mean it is the only remedy Boericke could have meant,
# which is exactly how "Silica" resolved to the 0-rubric "Silica Marina".
ABBR_MIN_RUBRICS = 1
ABBR_MIN_MARGIN = 3.0
SEG_SPLIT = re.compile(r"(\s*[;,]\s*)")


def remedy_table():
    """[(english, bangla, kent_rubric_count)] from the generated suggest file."""
    if not SUGGEST.exists():
        return []
    s = json.loads(SUGGEST.read_text(encoding="utf-8"))
    return [(en, bn, n) for en, bn, n in s.get("remedies", []) if bn]


def _norm_name(s):
    return re.sub(r"[^a-z ]", "", s.lower()).strip()


def build_aliases():
    rem = remedy_table()
    by_exact = {_norm_name(en): (en, bn) for en, bn, n in rem}
    seen = collections.Counter()
    for letter, eid, name, runs, entry in load_source():
        for kind, i, r in runs:
            if not r.get("em"):
                continue
            t = (r.get("t") or "").strip()
            if len(t) > 60:
                continue
            for seg in SEG_SPLIT.split(t):
                seg = seg.strip(" .;,()-")
                if seg and _norm_name(seg) not in by_exact:
                    seen[seg] += 1

    resolved, rejected = {}, {}
    for seg, count in seen.most_common():
        if count < 2:
            continue
        qw = _norm_name(seg).split()
        if not qw:
            continue
        cands = []
        for en, bn, n in rem:
            ew = _norm_name(en).split()
            if len(ew) < len(qw):
                continue
            if all(ew[j].startswith(qw[j]) for j in range(len(qw))):
                cands.append((n, en, bn))
        if not cands:
            continue
        cands.sort(reverse=True)
        top_n, top_en, top_bn = cands[0]
        runner = cands[1][0] if len(cands) > 1 else 0
        margin = None if runner == 0 else top_n / runner

        if seg in ALIAS_OVERRIDES:
            want, why = ALIAS_OVERRIDES[seg]
            pick = next(((en, bn) for en, bn, n in rem if en == want), None)
            if pick:
                resolved[seg] = {"en": pick[0], "bn": pick[1], "seen": count,
                                 "by": "override", "reason": why}
                continue
        # The rubric floor guards against a near-empty remedy out-ranking a
        # polychrest, so it only means anything when there is competition. With
        # a single candidate the expansion is unambiguous and the floor was
        # wrongly rejecting real names ("Urtica", "Radium", "Ferr pic").
        ok = top_n >= ABBR_MIN_RUBRICS and (margin is None or margin >= ABBR_MIN_MARGIN)
        if ok:
            resolved[seg] = {"en": top_en, "bn": top_bn, "seen": count,
                             "by": "rubric-dominance", "rubrics": top_n,
                             "margin": "only-candidate" if margin is None else round(margin, 1)}
        else:
            rejected[seg] = {"seen": count, "closest": top_en, "rubrics": top_n,
                             "runner_up": cands[1][1] if len(cands) > 1 else None,
                             "margin": "only-candidate" if margin is None else round(margin, 1)}

    doc = {
        "$generated_by": "tools/materia_bn.py aliases — review, do not hand-edit",
        "rule": (f"resolve only when the candidate has >= {ABBR_MIN_RUBRICS} Kent "
                 f"rubrics and beats the runner-up by >= {ABBR_MIN_MARGIN}x; "
                 "everything else stays in English as printed"),
        "resolved": resolved,
        "left_in_english": rejected,
    }
    ALIAS_FILE.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"resolved       : {len(resolved)} abbreviations "
          f"({sum(v['seen'] for v in resolved.values()):,} occurrences)")
    print(f"left in English: {len(rejected)} "
          f"({sum(v['seen'] for v in rejected.values()):,} occurrences)")
    print(f"written        : {ALIAS_FILE.relative_to(ROOT)}")


def load_aliases():
    """Deliberately empty.

    Cross-references used to be recognised with an abbreviation table derived
    from *Kent* rubric counts. That worked, but it reached into a different
    author's data to make decisions about Boericke's text, and the brief is
    explicit that sources must not be mixed. oorep.sql ships 2,432
    authoritative remedy records from the same database as this Boericke text,
    which covers the same job without leaving the source — so the Kent-derived
    table is no longer consulted. tools/materia_bn_aliases.json is kept only
    as a record of what that heuristic decided.
    """
    return {}


# ─────────────────────────── memory ───────────────────────────

def load_mem():
    if not MEM.exists():
        return {}
    return json.loads(MEM.read_text(encoding="utf-8"))


# A stored translation must not carry sentence-final punctuation: the source
# run supplies its own, re-attached as `post` in lookup(). Keeping it in the
# value produced 'বৈশিষ্ট্য।. ' — and worse, the same source string ("burning")
# translated once with a stop and once without, so whichever was written last
# silently changed the other occurrence. That is the exact failure
# consistency_policy exists to prevent, so it is normalised on the way in.
RE_TRAIL = re.compile(r"[\s।.,;]+$")


def norm_bn(v):
    return RE_TRAIL.sub("", v or "")


def save_mem(mem):
    for k, rec in mem.items():
        if isinstance(rec, dict) and rec.get("bn"):
            rec["bn"] = norm_bn(rec["bn"])
    MEM.write_text(json.dumps(mem, ensure_ascii=False, indent=1, sort_keys=True),
                   encoding="utf-8")


# ─────────────────────────── validation ───────────────────────────
# The checks named in the guide's automated_validation list that can be
# decided mechanically. The ones that need judgement (natural Bangla,
# no_unapproved_medical_terms) are left to review and are not asserted here —
# a checker that pretended to judge them would give false confidence.

def guide_dict():
    g = json.loads(GUIDE.read_text(encoding="utf-8"))
    pairs = {}
    for b in ["laterality", "directional_terms", "temporal_terms", "frequency",
              "intensity", "symptom_quality", "movement_terms", "position_rules",
              "pathology_terms", "negation_policy", "comparison_policy",
              "causation_policy", "sensation_patterns"]:
        for k, v in (g.get(b) or {}).items():
            if isinstance(v, str):
                pairs[k.replace("_", " ").lower()] = v
    for b in ["canonical_abbreviations"]:
        for k, v in (g.get(b) or {}).items():
            if isinstance(v, dict) and v.get("bangla"):
                pairs[k.lower()] = v["bangla"]
    for b in ["anatomical_translation", "disease_name_policy",
              "chemical_and_drug_policy", "food_and_substance_policy"]:
        for k, v in (g.get(b, {}).get("examples") or {}).items():
            pairs[k.lower()] = v
    return pairs


# Matched on word boundaries: a plain substring test flagged "knotty" as
# containing "not" and reported a lost negation that was never there.
RE_NEG_EN = re.compile(
    r"\b(not|never|no|without|cannot|can't|nor|neither|none|nothing|"
    r"absent|absence|lack|fails?|unable)\b", re.I)
# Bangla negation markers the guide names, plus the common verbal negatives
# The guide's own negation_policy renderings, plus ব্যর্থ, which is how it
# renders "fails_to" — omitting it reported a lost negation that was present.
RE_NOTATION = re.compile(r"^(\d+(st|nd|rd|th|m|x|c)?|[a-z]|[MCXmcx]+)$")

NEG_BN = ["নয়", "না", "কখনো নয়", "ছাড়া", "বিনা", "নেই", "অভাব", "ব্যর্থ",
          "অনুপস্থিত", "বন্ধ", "পারে না", "হীন", "অক্ষম", "অসমর্থ",
          "বিপরীত-নির্দেশ"]


def validate(mem, verbose=False):
    problems = []
    for en, rec in mem.items():
        bn = (rec or {}).get("bn") or ""
        st = (rec or {}).get("st") or "PASS"
        if st == "SKIP":
            continue

        # source_translation_not_empty
        if not bn.strip():
            problems.append(("empty", en, bn)); continue
        # Potency and dosage notation is on the do_not_translate list, so a run
        # that is nothing but notation ("1", "m", "30th") legitimately carries
        # no Bangla and must not be reported as untranslated.
        if RE_NOTATION.match(en.strip()):
            continue
        if not BN.search(bn):
            problems.append(("no_bangla", en, bn)); continue

        low = en.lower()

        # agg_consistency / amel_consistency — the guide's single most
        # dangerous confusion: a rubric that says worse must never read better.
        agg = re.search(r"\bagg\b|\baggravat|\bworse\b", low)
        # "relieves"/"relieving" are as much an amelioration as "relieved";
        # matching only the past tense reported Arsenicum's
        # "Headaches relieves by cold ... other symptoms worse" as an inverted
        # modality when the translation was correct.
        amel = re.search(r"\bamel\b|\bameliorat|\bbetter\b|\breliev", low)
        if agg and "বৃদ্ধি" not in bn:
            problems.append(("agg_missing", en, bn))
        if amel and "উপশম" not in bn:
            problems.append(("amel_missing", en, bn))
        if agg and not amel and "উপশম" in bn:
            problems.append(("agg_became_amel", en, bn))
        if amel and not agg and "বৃদ্ধি" in bn:
            problems.append(("amel_became_agg", en, bn))

        # left_right_preserved
        # "being left alone" is the verb, not laterality. Treating every
        # "left" as a side reported a lost বাম in Arsenicum's fear rubric.
        has_l = bool(re.search(r"\bleft\b", low)) and not re.search(
            r"\b(being\s+left|left\s+alone|left\s+off|has\s+left|had\s+left)\b", low)
        has_r = re.search(r"\bright\b", low)
        if has_l and "বাম" not in bn:
            problems.append(("left_lost", en, bn))
        if has_r and "ডান" not in bn:
            problems.append(("right_lost", en, bn))
        # laterality must not be invented either
        if not has_l and "বাম" in bn:
            problems.append(("left_invented", en, bn))
        if not has_r and "ডান" in bn:
            problems.append(("right_invented", en, bn))

        # negation_preserved
        if RE_NEG_EN.search(en) and not any(w in bn for w in NEG_BN):
            problems.append(("negation_lost", en, bn))

        # numeric_values_preserved / dosage / percentage — every number in the
        # source must appear in the translation, as digits or Bangla numerals
        for num in set(re.findall(r"\d+", en)):
            bn_num = num.translate(str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯"))
            if num not in bn and bn_num not in bn:
                problems.append(("number_lost:" + num, en, bn))

        # placeholder_preserved
        if en.strip().startswith("-") and not bn.strip().startswith("-"):
            problems.append(("placeholder_lost", en, bn))

    return problems


# ─────────────────────────── build ───────────────────────────

def build():
    global _XREF_NAMES
    _XREF_NAMES = oorep_xref_names()
    mem = load_mem()
    alias = load_aliases()
    exact = {_norm_name(en): {"en": en, "bn": bn} for en, bn, n in remedy_table()}
    OUT.mkdir(parents=True, exist_ok=True)

    per_letter = {}
    stats = {"runs": 0, "done": 0, "names": 0, "punct": 0}

    for f in sorted(SRC.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        letter_out = {}
        for eid, e in data.items():
            lead = []
            any_bn = False
            for r in e.get("lead", []):
                v, hit = lookup(r, mem, stats, alias, exact)
                lead.append(v)
                any_bn = any_bn or hit
            secs = []
            for s in e.get("sections", []):
                row = []
                for r in s.get("runs", []):
                    v, hit = lookup(r, mem, stats, alias, exact)
                    row.append(v)
                    any_bn = any_bn or hit
                secs.append(row)
            if not any_bn:
                continue
            letter_out[eid] = {"h": entry_hash(e), "lead": lead, "sec": secs}
        if letter_out:
            per_letter[f.stem] = letter_out

    for letter, payload in per_letter.items():
        (OUT / f"{letter}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    total = sum(len(v) for v in per_letter.values())
    size = sum((OUT / f"{l}.json").stat().st_size for l in per_letter)
    covered = stats["done"] + stats["names"] + stats["punct"]
    print(f"entries with any Bangla   : {total} / 685")
    print(f"runs rendered in Bangla   : {covered:,} / {stats['runs']:,} "
          f"({covered / stats['runs'] * 100:.1f}%)")
    print(f"  from translation memory : {stats['done']:,}")
    print(f"  remedy names as বাংলা (English): {stats['names']:,}")
    print(f"  punctuation passed through     : {stats['punct']:,}")
    print(f"runs still English        : {stats['runs'] - covered:,}")
    print(f"shards written            : {len(per_letter)}  ({size/1024:.1f}KB)")


def lookup(run, mem, stats, alias, exact):
    """Bangla for one run, or None to fall back to the English source."""
    stats["runs"] += 1
    t = run.get("t") or ""

    if run.get("em"):
        # em marks two different things in Boericke: lists of remedy names, and
        # ordinary words he wanted emphasised ("Worse", "Better", "Itching").
        # Treating all of them as names left 253 "Worse" and 171 "Better"
        # untranslated — the very agg./amel. distinction the guide cares most
        # about. So an em run only counts as a name list when every one of its
        # segments actually resolves to a remedy.
        names = render_names(t, alias, exact)
        if names is not None:
            stats["names"] += 1
            return names, True
        # otherwise it is text, and falls through to the memory below

    pre, core, post = split_edges(t)
    rec = mem.get(core)
    if rec and rec.get("bn") and rec.get("st") != "SKIP":
        stats["done"] += 1
        return pre + norm_bn(rec["bn"]) + post, True
    if not core:
        # pure punctuation: nothing to translate, and it carries the sentence
        # structure, so it passes through rather than counting as missing
        stats["punct"] += 1
        return t, True
    return None, False


RE_EDGES = re.compile(r"^([\s.;,()\-–—]*)(.*?)([\s.;,()]*)$", re.S)


def split_edges(t):
    """Split leading/trailing punctuation off a run.

    Boericke's runs break mid-sentence, so the same phrase arrives as
    'Compare:' in one place and '. Compare:' in another. Keying the memory on
    the bare core collapses those into one approved translation, which is what
    consistency_policy asks for, and stops the same phrase being translated
    twice with two different results.
    """
    m = RE_EDGES.match(t)
    if not m:
        return "", t.strip(), ""
    return m.group(1), m.group(2).strip(), m.group(3)


def render_names(text, alias, exact):
    """'Bangla (English)' for a run that is entirely remedy names, else None.

    Format taken from the guide (technical_term_policy.preferred_format).
    English is kept alongside because that is the form a practitioner looks up
    in any other repertory or materia medica.
    """
    parts = SEG_SPLIT.split(text)
    out = []
    resolved_any = False
    for part in parts:
        seg = part.strip(" .;,()-")
        if not seg:                      # separator or padding, kept verbatim
            out.append(part)
            continue
        key = _norm_name(seg)
        hit = exact.get(key) or alias.get(seg.lower())
        if not hit:
            return None                  # not a pure name list
        bn = hit["bn"] if isinstance(hit, dict) else hit[1]
        resolved_any = True
        out.append(part.replace(seg, f"{bn} ({seg})"))
    return "".join(out) if resolved_any else None


# ─────────────────────────── stats / todo ───────────────────────────

def stats_cmd():
    mem = load_mem()
    src = load_source()
    cats = {}
    per_remedy = []
    for letter, eid, name, runs, entry in src:
        done = tot = 0
        for kind, i, r in runs:
            c = categorise(r)
            d = cats.setdefault(c, [0, 0, 0])
            d[0] += 1
            d[2] += len(r.get("t") or "")
            if c == "remedy_name":
                continue
            tot += 1
            # The memory is keyed on the edge-normalised core, not the raw
            # run, so a plain .strip() never matched and every category
            # reported 0% translated.
            _pre, core, _post = split_edges(r.get("t") or "")
            rec = mem.get(core)
            if rec and rec.get("bn"):
                d[1] += 1
                done += 1
        per_remedy.append((done, tot, name))
    print(f"{'category':12} {'runs':>7} {'done':>7} {'chars':>10}")
    for c in ["remedy_name", "punct", "label", "potency", "fragment", "prose"]:
        n, d, ch = cats.get(c, [0, 0, 0])
        pct = f"{d/n*100:.0f}%" if n and c != "remedy_name" else ("n/a" if c == "remedy_name" else "0%")
        print(f"{c:12} {n:7,} {d:7,} {ch:10,}  {pct}")
    full = [r for r in per_remedy if r[1] and r[0] == r[1]]
    part = [r for r in per_remedy if r[1] and 0 < r[0] < r[1]]
    print(f"\nremedies fully translated : {len(full)} / {len(per_remedy)}")
    print(f"remedies partly translated: {len(part)}")
    if full:
        print("  complete: " + ", ".join(sorted(r[2] for r in full))[:400])


def todo_cmd(n):
    """Untranslated runs, most valuable first: prose from the remedies a
    practitioner reaches for most (rubric count from case-suggest.json)."""
    mem = load_mem()
    prom = {}
    if SUGGEST.exists():
        s = json.loads(SUGGEST.read_text(encoding="utf-8"))
        prom = {en.lower(): c for en, _bn, c in s.get("remedies", [])}
    rows = []
    seen = set()
    for letter, eid, name, runs, entry in load_source():
        p = prom.get(name.lower(), 0)
        for kind, i, r in runs:
            if categorise(r) == "remedy_name":
                continue
            _pre, t, _post = split_edges(r.get("t") or "")
            if not t or t in seen:
                continue
            if mem.get(t, {}).get("bn"):
                continue
            seen.add(t)
            rows.append((p, name, t))
    rows.sort(key=lambda x: (-x[0], x[1]))
    print(json.dumps([{"rx": r[1], "en": r[2]} for r in rows[:n]],
                     ensure_ascii=False, indent=1))



# ─────────────────────────── structured entries ───────────────────────────
# The delivered shape, fixed by the brief:
#   short, long, bangla, summary, keynotes[], mental[], physical[],
#   modalities{better[],worse[]}, clinical[], potency[]
#
# Every field is derived from the Boericke entry and nothing else. Where the
# source has no material for a field it stays empty — a remedy picture padded
# out to look complete is the one failure mode that matters most here.
#
# The arrays hold Bangla only. A source sentence whose Bangla is not yet
# approved is left out rather than shown in English, and the count of what was
# left out is recorded in `_omitted` so the gap is measured instead of looking
# like a remedy that simply has fewer symptoms.

MENTAL_H = {"mind", "mental", "mind and head"}
# Headings that are not symptom material and must not land in `physical`
NON_SYMPTOM_H = {"dose", "relationship", "antidote", "antidotes",
                 "complementary", "incompatible", "compare"}

# Split on a full stop only. Splitting on ';' as well tore single symptoms in
# half — Boericke uses the semicolon to join clauses of one symptom
# ("Itching; scratching causes burning"), so it must stay inside the item.
RE_SENT_CHARS = ".।"


def split_sentences(text):
    """Sentence split that never cuts inside brackets.

    The remedy cross-references Boericke sets in parentheses have their '(',
    the names and the ')' in three different runs, so a plain regex split put
    the opening half in one item and the closing bracket in the next.
    """
    out, cur, depth = [], "", 0
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch in RE_SENT_CHARS and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


# Joining runs leaves punctuation doubled up, because a translation may end
# with its own stop while the source run also contributes one: 'জ্বালাপোড়া।' + ','
# rendered as 'জ্বালাপোড়া।,'.
RE_DUP_PUNCT = re.compile(r"\s*([,;।.])(\s*[,;।.])+")
RE_SPACE_PUNCT = re.compile(r"\s+([,;।.)])")
RE_MULTISPACE = re.compile(r"[ \t]{2,}")


def tidy(text):
    text = RE_DUP_PUNCT.sub(r"\1", text)
    text = RE_SPACE_PUNCT.sub(r"\1", text)
    text = RE_MULTISPACE.sub(" ", text)
    return text.strip(" ,;।.")


# Rule A/D: a reference to another remedy is not a symptom of this one.
# Boericke prints them inline — Sulphur's Eyes section reads
# "burning in eyes (Ars; Bell)" — and rendering those names into the Bangla
# produced "চোখে জ্বালাপোড়া (আর্সেনিকাম অ্যালবাম)", which reads as if Arsenicum
# were part of the Sulphur symptom. Cross-references are dropped from every
# symptom field instead, along with the bracket and the editorial label that
# introduced them.
DROP = "\x01"
RE_EMPTY_BRACKET = re.compile(r"[(\[]\s*[\x01\s;,.]*\s*[)\]]")
RE_EDITORIAL = re.compile(
    r"\b(compare|antidotes?|antidoted by|complementary( to)?|incompatible|"
    r"followed by|follows|see also|see)\b\s*:?", re.I)
RE_DROP_LEFT = re.compile(r"[(\[]\s*[\x01\s;,]*")


def strip_xrefs(text):
    """Remove dropped-reference markers and whatever bracket held them."""
    text = RE_EMPTY_BRACKET.sub("", text)
    text = RE_EDITORIAL.sub("", text)
    text = text.replace(DROP, "")
    # a bracket left half-open by the removal
    text = re.sub(r"\(\s*\)", "", text)
    return text


def is_xref(run, alias, exact):
    """Is this emphasised run a cross-reference to other remedies?

    render_names() alone is too strict: it needs *every* segment to resolve, so
    Sulphur's "(Cup sulph; Graph)" survived as if it were a symptom because
    "Cup sulph" is not in the abbreviation table. A short emphasised run that
    names at least one known remedy is a reference, not a symptom — and the
    test stays safe for emphasised clinical words ("Burning", "Itching"),
    which contain no remedy name at all.
    """
    if not run.get("em"):
        return False
    t = (run.get("t") or "").strip()
    if not t or len(t) > 60:
        return False
    if render_names(t, alias, exact) is not None:
        return True
    known = _XREF_NAMES
    for seg in SEG_SPLIT.split(t):
        seg = seg.strip(" .;,()-")
        if not seg:
            continue
        if exact.get(_norm_name(seg)) or alias.get(seg.lower()):
            return True
        if seg.lower().rstrip(".") in known:
            return True

    # Boericke also separates references with a bare full stop
    # ("Carbon tetrachloride; Ars. Chlorof"), which the ';'/',' split does not
    # break apart, so that run survived as if it were a symptom. Short runs are
    # therefore also checked token by token. The length cap keeps a real
    # sentence from being discarded because one of its words happens to
    # coincide with a remedy abbreviation.
    tokens = re.findall(r"[A-Za-z][A-Za-z\-]{2,}", t)
    if tokens and len(tokens) <= 6 and any(w.lower() in known for w in tokens):
        return True
    return False


_XREF_NAMES = set()


def sentences(runs, mem, alias, exact, stats):
    """Bangla sentences for a section, dropping anything not yet translated.

    Runs are joined before splitting because Boericke's em spans cut sentences
    in half — splitting per run would file 'Worse, ' and 'from motion.' as two
    separate symptoms.
    """
    parts = []
    for r in runs:
        if is_xref(r, alias, exact):
            parts.append(DROP)               # cross-reference, not a symptom
            continue
        v, _ = lookup(r, mem, stats, alias, exact)
        parts.append(v if v is not None else "\x00")   # marker: untranslated
    joined = strip_xrefs("".join(parts))
    out, dropped = [], 0
    for sent in split_sentences(joined):
        if "\x00" in sent:
            if sent.strip(" .;,\x00"):
                dropped += 1
            continue
        sent = tidy(sent)
        if not sent or not BN.search(sent):
            continue
        out.append(sent)
    return out, dropped


RE_MOD_MARK = re.compile(r"^\s*(worse|better|aggravation|amelioration)\b[\s.,;:]*",
                         re.I)


def bn_for_text(text, mem):
    """Bangla for a bare source string, via the same edge-normalised key the
    run lookup uses. Returns None when it is not in the memory."""
    pre, core, post = split_edges(text or "")
    if not core:
        return ""
    rec = mem.get(core)
    if rec and rec.get("bn") and rec.get("st") != "SKIP":
        return norm_bn(rec["bn"])
    return None


def split_modalities(runs, mem, alias, exact, stats):
    """Boericke's Modalities section reads 'Worse, X. Better, Y.'

    The marker word is em-emphasised, which is what makes the split reliable
    rather than guessed — but it is not always a run of its own: Sulphur has
    one run reading 'Better, dry, warm weather'. Matching only whole-run
    markers filed that entire phrase under *worse*, inverting the modality,
    which is the single error the style guide is most emphatic about. So the
    marker is stripped off the front of a run and the remainder stays content.
    """
    better, worse, dropped = [], [], 0
    cur = None
    for r in runs:
        # In several entries the printed Modalities paragraph runs straight on
        # into the relationship notes ("... Right side. Complementary: ...").
        # Everything from that label onward is remedy cross-reference material,
        # not a modality, and filing it under better/worse turned "Antidotal to
        # lead poison" into an amelioration.
        if RE_EDITORIAL.match((r.get("t") or "").strip()):
            break
        text = r.get("t") or ""
        m = RE_MOD_MARK.match(text)
        if m and r.get("em"):
            word = m.group(1).lower()
            cur = "worse" if word in ("worse", "aggravation") else "better"
            text = text[m.end():]
            if not text.strip(" .,;:"):
                continue
        if cur is None:
            continue
        if is_xref(r, alias, exact):
            continue                          # cross-reference, not a modality
        v = bn_for_text(text, mem)
        if v is None:
            dropped += 1
            continue
        word = "বৃদ্ধি" if cur == "worse" else "উপশম"
        for sent in split_sentences(strip_xrefs(v)):
            item = tidy(sent)
            if not item or not BN.search(item):
                continue
            # Rule B: a circumstance without its direction is not a modality —
            # "দাঁড়িয়ে থাকলে" has to read "দাঁড়িয়ে থাকলে বৃদ্ধি". Boericke states
            # the direction once for a whole list, so it is restored here.
            #
            # The list is deliberately NOT split on commas: "শুষ্ক, উষ্ণ
            # আবহাওয়ায়" is one condition (dry *and* warm weather), and splitting
            # it produced the meaningless "শুষ্ক উপশম".
            if word not in item:
                item = f"{item} {word}"
            (worse if cur == "worse" else better).append(item)
    return better, worse, dropped


OOREP_FILE = Path(__file__).resolve().parent / "materia_bn_remedies.json"


def remedy_abbrevs():
    """remedy english name -> its standard abbreviation.

    Authoritative: read from remedy.nameabbrev in oorep.sql (see
    tools/materia_oorep.py), which is the same database this Boericke text
    comes from. That satisfies the rule against inventing an abbreviation
    outright, and replaces the earlier fallback of picking whichever
    abbreviation appeared most often in the printed cross-references — which
    could only ever guess, and covered a third of the book.
    """
    if not OOREP_FILE.exists():
        return {}
    doc = json.loads(OOREP_FILE.read_text(encoding="utf-8"))
    out = dict(doc.get("abbrev_by_long_name") or {})

    # Matching on the remedy's long name alone missed 45 entries whose scraped
    # title carries the botanical alias too ("Abies Canadensis-Pinus
    # Canadensis"). mmchapter.remedy_id already states which remedy each
    # chapter is, so the chapter heading is the more reliable key.
    remedies = doc.get("remedies") or {}
    for ch in (doc.get("boericke_chapters") or {}).values():
        rid = ch.get("remedy_id")
        r = remedies.get(rid) if rid else None
        if not r:
            continue
        out.setdefault(_title_key(ch.get("heading") or ""), r["abbrev"])
    return out


def _title_key(s):
    """Chapter titles differ in case, punctuation and spacing between the
    scrape and the dump, so both sides are reduced to letters and digits."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def oorep_source():
    """The book's bibliographic record, from oorep.sql's mminfo row.

    Stated, never inferred: mminfo has no edition column, so `edition` is
    empty. Boericke's Pocket Manual is commonly cited by edition, but this
    dump does not say which one, and filling that in from general knowledge is
    exactly the source contamination the brief rules out.
    """
    if not OOREP_FILE.exists():
        return {"author": "", "work": "", "edition": ""}
    doc = json.loads(OOREP_FILE.read_text(encoding="utf-8"))
    src = doc.get("source") or {}
    return {"author": src.get("author", ""),
            "work": src.get("work", ""),
            "edition": src.get("edition", "")}


def oorep_xref_names():
    """Every abbreviation and name in the OOREP remedy table, lowercased.

    Used to recognise a cross-reference. 2,432 authoritative remedy records
    beat the 385 abbreviations the rubric-dominance heuristic could settle, so
    a reference like "Cup sulph" is now identified from data instead of
    slipping through as if it were a symptom.
    """
    if not OOREP_FILE.exists():
        return set()
    doc = json.loads(OOREP_FILE.read_text(encoding="utf-8"))
    out = set()
    for r in (doc.get("remedies") or {}).values():
        for v in [r.get("abbrev"), r.get("long")] + list(r.get("alt") or []):
            if not v:
                continue
            v = v.strip().lower().rstrip(".")
            out.add(v)
            # OOREP writes abbreviations hyphenated ("Rhus-t.", "Nat-m."),
            # while Boericke prints the bare stem ("Rhus", "Nat mur"). Indexing
            # the stem as well is what lets those be recognised — and it is
            # still the same source, unlike the Kent-derived table it replaced.
            # Detection only needs to know a token IS a remedy reference, not
            # which member of the family, so an ambiguous stem is harmless.
            stem = re.split(r"[-\s]", v)[0]
            if len(stem) >= 3:
                out.add(stem)
    return out


def build_structure():
    global _XREF_NAMES
    _XREF_NAMES = oorep_xref_names()
    mem = load_mem()
    alias = load_aliases()
    exact = {_norm_name(en): {"en": en, "bn": bn} for en, bn, n in remedy_table()}
    bn_name = {en: bn for en, bn, n in remedy_table()}
    abbr = remedy_abbrevs()
    source = oorep_source()
    stats = {"runs": 0, "done": 0, "names": 0, "punct": 0}

    OUT.mkdir(parents=True, exist_ok=True)
    totals = collections.Counter()

    for f in sorted(SRC.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        out = {}
        for eid, e in data.items():
            name = e.get("name", "")
            summary, drop = sentences(e.get("lead", []), mem, alias, exact, stats)
            omitted = drop
            mental, physical, potency, clinical = [], [], [], []
            better, worse = [], []

            for sec in e.get("sections", []):
                h = (sec.get("h") or "").strip().lower()
                runs = sec.get("runs", [])
                if h == "modalities":
                    b, w, d = split_modalities(runs, mem, alias, exact, stats)
                    better += b; worse += w; omitted += d
                    continue
                sents, d = sentences(runs, mem, alias, exact, stats)
                omitted += d
                if h == "dose":
                    potency += sents
                elif h in NON_SYMPTOM_H:
                    # Relationship/Compare are remedy cross-references, not
                    # symptoms, and the brief's schema has no field for them.
                    continue
                elif h in MENTAL_H:
                    mental += sents
                elif "non-homeopathic" in h:
                    clinical += sents
                else:
                    # keep the region, or an extremity symptom becomes a
                    # bodiless one
                    label = sec.get("hbn") or sec.get("h") or ""
                    physical += [f"{label}: {s}" if label else s for s in sents]

            # keynotes: Boericke's own emphasis is the source marking what is
            # characteristic, so this is read off the text rather than judged.
            keynotes = []
            for sec in [{"runs": e.get("lead", [])}] + list(e.get("sections", [])):
                hh = (sec.get("h") or "").strip().lower() if sec.get("h") else ""
                if hh in NON_SYMPTOM_H or hh == "modalities":
                    continue
                for r in sec.get("runs", []):
                    if not r.get("em"):
                        continue
                    t = (r.get("t") or "").strip()
                    if len(t) < 4 or is_xref(r, alias, exact):
                        continue          # a remedy reference is not a keynote
                    v, _ = lookup(r, mem, stats, alias, exact)
                    if not v or not BN.search(v):
                        continue
                    v = tidy(v)
                    # Boericke's emphasis often starts mid-sentence, so the span
                    # alone can be a two-word fragment ("দাঁড়িয়ে থাকা",
                    # "টকটকে লাল"). Those are not keynotes, and the brief is
                    # explicit that not every emphasised symptom is one, so a
                    # span has to stand on its own to qualify.
                    if len(v.split()) < 4:
                        continue
                    # Rule I: never emit a fragment that breaks off mid-clause.
                    # Boericke's emphasis starts and stops mid-sentence, so a
                    # span can end on a dangling connective.
                    if re.search(r"(,|;|প্রায়|এবং|ও|সহ|যেন|থেকে)$", v.strip()):
                        continue
                    if v and v not in keynotes:
                        keynotes.append(v)

            # Rule C/14: the same symptom must not appear twice. Keynotes are
            # the more specific placement, so a body-system entry that repeats
            # one verbatim is dropped rather than listed again.
            keyset = set(keynotes)
            physical = [x for x in dict.fromkeys(physical)
                        if x.split(": ", 1)[-1] not in keyset]
            mental = [x for x in dict.fromkeys(mental) if x not in keyset]
            potency = list(dict.fromkeys(potency))

            rec = {
                "short": (abbr.get(name.strip().lower())
                          or abbr.get(_title_key(name)) or ""),
                "long": name,
                "bangla": bn_name.get(name, ""),
                # tidy() strips the stop off each sentence, so the stops have to
                # go back when they are rejoined into a paragraph, or the
                # summary reads as one run-on sentence.
                "summary": "। ".join(summary) + ("।" if summary else ""),
                "keynotes": keynotes,
                "mental": mental,
                "physical": physical,
                "modalities": {"better": better, "worse": worse},
                "clinical": clinical,
                "potency": potency,
                # Every field above is traceable to this one book. Nothing is
                # merged in from Kent, from another author, or from general
                # knowledge — a field the source does not cover stays empty.
                "source": source,
            }
            filled = sum(1 for k in ("summary", "keynotes", "mental", "physical",
                                     "clinical", "potency") if rec[k])
            if better or worse:
                filled += 1
            rec["_omitted"] = omitted          # source sentences not yet in Bangla
            rec["_h"] = entry_hash(e)
            out[eid] = rec
            totals["entries"] += 1
            if filled:
                totals["with_content"] += 1
            if omitted == 0 and filled:
                totals["complete"] += 1
            totals["omitted"] += omitted
        (OUT / f"{f.stem}.json").write_text(
            json.dumps(out, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    size = sum(p.stat().st_size for p in OUT.glob("*.json"))
    print(f"entries written        : {totals['entries']}")
    print(f"  with Bangla content  : {totals['with_content']}")
    print(f"  fully translated     : {totals['complete']}")
    print(f"source sentences left out (not yet translated): {totals['omitted']:,}")
    print(f"shards                 : {len(list(OUT.glob('*.json')))} ({size/1024:.1f}KB)")



# ─────────────────────────── batch translation loop ───────────────────────────
# Whole remedies at a time, most-prescribed first. Finishing remedies one by
# one means that at any point N remedies are completely usable, rather than all
# 685 being partly done — which for a materia medica is the difference between
# a usable book and an unusable one.
#
#   materia_bn.py batch 6      -> tools/_batch.json   {id: english}
#   ...fill tools/_batch_bn.json {id: bangla}
#   materia_bn.py apply        -> merges into the memory
#
# Ids are positions in that dump, so a batch must be applied before the next is
# taken. The English is never re-typed, which is what keeps the loop cheap.
BATCH = Path(__file__).resolve().parent / "_batch.json"
BATCH_BN = Path(__file__).resolve().parent / "_batch_bn.json"


def remedy_order():
    """Remedies by how widely Kent indicates them, most first."""
    prom = {}
    if SUGGEST.exists():
        s = json.loads(SUGGEST.read_text(encoding="utf-8"))
        prom = {en.strip().lower(): c for en, _b, c in s.get("remedies", [])}
    rows = []
    for letter, eid, name, runs, entry in load_source():
        rows.append((-prom.get(name.strip().lower(), 0), name, letter, eid, entry))
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows


def batch_cmd(n_remedies):
    global _XREF_NAMES
    _XREF_NAMES = oorep_xref_names()
    mem = load_mem()
    alias = load_aliases()
    exact = {_norm_name(en): {"en": en, "bn": bn} for en, bn, _n in remedy_table()}

    items, meta = {}, []
    picked = 0
    for negprom, name, letter, eid, entry in remedy_order():
        if picked >= n_remedies:
            break
        todo = []
        seen_here = set()
        sections = [("lead", entry.get("lead", []))]
        sections += [(s.get("h") or "", s.get("runs", [])) for s in entry.get("sections", [])]
        for head, runs in sections:
            # Relationship/Compare carry no symptom material and the delivered
            # schema has no field for them, so they are never translated.
            if head.strip().lower() in NON_SYMPTOM_H:
                continue
            for r in runs:
                if is_xref(r, alias, exact):
                    continue
                text = r.get("t") or ""
                if head.strip().lower() == "modalities" and r.get("em"):
                    m = RE_MOD_MARK.match(text)
                    if m:
                        text = text[m.end():]
                _pre, core, _post = split_edges(text)
                if not core or core in mem or core in seen_here:
                    continue
                seen_here.add(core)
                todo.append((head, core))
        if not todo:
            continue
        picked += 1
        for head, core in todo:
            i = len(items) + 1
            items[str(i)] = core
            meta.append({"id": i, "rx": name, "section": head or "lead"})

    BATCH.write_text(json.dumps({"items": items, "meta": meta},
                                ensure_ascii=False, indent=1), encoding="utf-8")
    by_rx = collections.Counter(m["rx"] for m in meta)
    print(f"remedies in batch : {picked}")
    for rx, c in by_rx.most_common():
        print(f"   {c:4} runs  {rx}")
    print(f"runs to translate : {len(items)}")
    print(f"written           : {BATCH.relative_to(ROOT)}")


def apply_cmd():
    if not BATCH.exists() or not BATCH_BN.exists():
        raise SystemExit("need both _batch.json and _batch_bn.json")
    batch = json.loads(BATCH.read_text(encoding="utf-8"))
    bn = json.loads(BATCH_BN.read_text(encoding="utf-8"))
    items = batch["items"]
    mem = load_mem()
    added = conflict = unknown = 0
    for k, v in bn.items():
        core = items.get(str(k))
        if core is None:
            print(f"  !! id {k} not in this batch")
            unknown += 1
            continue
        v = norm_bn(v)
        if not v:
            continue
        prev = mem.get(core)
        if prev and norm_bn(prev.get("bn")) != v:
            print(f"  !! conflict {core[:46]!r}")
            conflict += 1
        mem[core] = {"bn": v, "st": "PASS"}
        added += 1
    save_mem(mem)
    missing = [k for k in items if k not in bn]
    print(f"applied {added}, conflicts {conflict}, unknown ids {unknown}")
    if missing:
        print(f"NOT translated in this batch: {len(missing)} ids -> {missing[:20]}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if cmd == "build":
        build()
    elif cmd == "structure":
        build_structure()
    elif cmd == "validate":
        probs = validate(load_mem())
        if not probs:
            print("validate: no mechanical check failed")
            return
        print(f"validate: {len(probs)} problem(s)")
        for kind, en, bn in probs[:60]:
            print(f"  [{kind}] {en[:70]!r}\n      -> {bn[:70]!r}")
    elif cmd == "batch":
        batch_cmd(int(sys.argv[2]) if len(sys.argv) > 2 else 5)
    elif cmd == "apply":
        apply_cmd()
    elif cmd == "aliases":
        build_aliases()
    elif cmd == "todo":
        todo_cmd(int(sys.argv[2]) if len(sys.argv) > 2 else 40)
    else:
        stats_cmd()


if __name__ == "__main__":
    main()
