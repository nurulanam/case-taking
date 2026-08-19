#!/usr/bin/env python3
"""Rebuild assets/data/materia/boericke/*.json straight from oorep.sql.

The shipped Boericke shards were scraped, and the scrape has defects the
cross-check found:

  * three remedies missing outright (Strychninum, Camphora Officinalis,
    Zizia Aurea), two of which are in the master roster;
  * entries filed under a roster id that belongs to a *different* remedy —
    roster `camph` is Camphora but the shard under `camph` is Camphora
    Bromata, and `stry` is Strychninum but holds Strychninum Phosphoricum.

That second class is the dangerous one. materia.js resolves source text by
roster id (srcEntry(src, id) -> shard[id]), so a wrong id does not fail — the
page renders one remedy's drug picture under another remedy's name.

oorep.sql holds the same Boericke text, verified character-for-character on
Sulphur.

Identity comes from the chapter *heading*, not from mmchapter.remedy_id.
remedy_id looked like the authoritative link and was tried first, but 58 of
the 688 chapters disagree with their own heading and at least one is simply
wrong: chapter 3168 is headed RADIUM BROMATUM and its text is unmistakably
Radium ("Radium Bromide ... provings by Diffenbach"), while its remedy_id
points at Cadmium Bromatum. Trusting the link would have filed Radium's drug
picture under Cadmium — the same class of error this script exists to fix.
The heading is the title Boericke printed, so it is what gets believed;
remedy_id is kept only as an alias hint and every disagreement is reported.

Output format is unchanged, so materia.js needs no edits:
    {id: {name, common, lead:[{t,em?}], sections:[{h,hbn,runs:[{t,em?}]}]}}

Ids: the roster id when the chapter's remedy matches a roster entry,
otherwise the previous "~"-prefixed form, so unrostered extras keep behaving
as they do today.

Neither source is complete, so this merges rather than replaces. oorep is the
primary — better identity, and it carries Camphora, Strychninum and Zizia
Aurea, which the scrape lost — but the scrape has Juniperus Communis, which
oorep does not, so an entry only the scrape has is kept.

tools/_boericke_prev/ holds the shards as they were before the first rebuild
and is the "old json" side of the cross-check.

Run:  python3 tools/materia_boericke_build.py [--write]
Without --write it only reports what would change.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "oorep.sql"
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
PREV = Path(__file__).resolve().parent / "_boericke_prev"
OUT = ROOT / "assets" / "data" / "materia" / "boericke"
BOERICKE_MMINFO = "20"


# ─────────────────────────── dump reading ───────────────────────────

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


def unescape(s):
    """Postgres COPY escapes. \\n arrives as a literal backslash-n."""
    if s == "\\N":
        return ""
    return (s.replace("\\r\\n", "\n").replace("\\n", "\n")
             .replace("\\t", "\t").replace("\\\\", "\\"))


# ─────────────────────────── name matching ───────────────────────────
# The roster and the dump spell the same remedy differently often enough that
# a plain comparison misses 50-odd entries: Kali/Kalium, Natrum/Natrium,
# Magnesia/Magnesium, æ/ae, "Asafoetida"/"Asa Foetida". These are orthographic,
# not different remedies, so they are folded before comparing. Anything that
# still does not match is reported rather than guessed at.

LIGATURES = {"æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ä": "a", "ö": "o",
             "ü": "u", "é": "e", "è": "e", "ç": "c", "ñ": "n"}

# Latinisation variants that are the same substance written two ways. Listed
# explicitly rather than derived: a first attempt stripped Latin case endings
# with generic rules ("(\w+?)a$" -> stem and so on), which does fold
# Kalium/Kali correctly but also collapsed "Physalis Alkekengi" onto
# "Physalia Pelagica" and "Radium Bromatum" onto "Cadmium Bromatum" — three
# genuinely different remedies quietly merged. Anything not listed here has to
# match on its own.
SYNONYM = {
    "kalium": "kali", "natrium": "natrum", "magnesium": "magnesia",
    "calcium": "calcarea", "acidum": "acid", "oleum": "oil",
}

# Latin adjective ending, applied to both sides so it can only ever merge two
# spellings of the *same* word ("Lacticum"/"Lactic", "Aceticum"/"Acetic").
RE_ICUM = re.compile(r"icum\b")


def fold(s):
    """Light, reversible normalisation only: ligatures, case, punctuation, and
    the listed Latin synonyms. No suffix stripping."""
    s = "".join(LIGATURES.get(c, c) for c in (s or ""))
    s = re.sub(r"[^A-Za-z0-9]+", " ", s.lower()).strip()
    s = RE_ICUM.sub("ic", s)
    words = [SYNONYM.get(w, w) for w in s.split()]
    return " ".join(words)


def _lev1(a, b):
    """True when a and b differ by at most one edit. Used only as a tie-break
    after the first word already matches exactly, so it can settle spelling
    variants of one species ("mellifica"/"mellifera",
    "silvatica"/"sylvatica") without ever reaching across two genera."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = j = 0
    edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) == len(b):
            i += 1
        j += 1
    return edits + (len(b) - j) + (len(a) - i) <= 1


def heading_variants(heading):
    """Boericke's printed titles often append a synonym — "ABIES
    CANADENSIS-PINUS CANADENSIS", "COCA-ERYTHROXYLON COCA". Yield the whole
    title first, then the part before the join, then the leading two words,
    so the extra name does not stop the remedy from being recognised."""
    h = (heading or "").strip()
    seen = []
    for cand in (h,
                 re.split(r"\s*--\s*|\s+-\s+|(?<=[a-z])-(?=[A-Z])", h)[0],
                 " ".join(h.replace("-", " ").split()[:2]),
                 h.split("-")[0],
                 # last resort: the genus alone, for titles that append a
                 # qualifier ("STRYCHNINUM PURUM" -> Strychninum). Safe because
                 # match_roster still needs an exact fold hit or a unique
                 # one-edit neighbour, so a bare genus cannot pull in a
                 # two-word species it does not equal.
                 h.replace("-", " ").split()[0] if h.split() else ""):
        cand = cand.strip(" -,:;")
        if cand and cand not in seen:
            seen.append(cand)
            yield cand


def match_roster(name, index):
    """Roster entry for a remedy name, or None. index maps fold(name)->entry."""
    key = fold(name)
    if not key:
        return None
    if key in index:
        return index[key]
    head = key.split(" ")[0]
    # same genus, one-letter species difference
    hits = [v for k, v in index.items()
            if k.split(" ")[0] == head and _lev1(k, key)]
    if len(hits) == 1:
        return hits[0]
    # A bare genus ("PODOPHYLLUM") standing for a roster entry that carries the
    # species too ("Podophyllum Peltatum"). Only when exactly one roster entry
    # begins with that word, so "CALCAREA" — which starts a dozen of them —
    # never resolves.
    if " " not in key:
        starts = [v for k, v in index.items() if k.split(" ")[0] == key]
        if len(starts) == 1:
            return starts[0]
    return None


def match_heading(heading, index):
    """(roster_entry, rank) — rank 0 is the whole printed title, higher ranks
    are progressively looser fallbacks. The rank matters when two chapters
    claim one roster id: "CAMPHORA" matches at rank 0 and "CAMPHORA BROMATA"
    only at the genus fallback, so the exact title keeps the id and the other
    is filed as an extra instead of overwriting it."""
    for rank, cand in enumerate(heading_variants(heading)):
        hit = match_roster(cand, index)
        if hit:
            return hit, rank
    return None, 99

# ─────────────────────────── content -> runs ───────────────────────────

RE_EM = re.compile(r"\*([^*]+)\*")


def to_runs(text):
    """'a *b* c' -> [{t:'a '},{t:'b',em:1},{t:' c'}], matching the scrape."""
    runs, pos = [], 0
    for m in RE_EM.finditer(text):
        if m.start() > pos:
            runs.append({"t": text[pos:m.start()]})
        runs.append({"t": m.group(1), "em": 1})
        pos = m.end()
    if pos < len(text):
        runs.append({"t": text[pos:]})
    return [r for r in runs if r["t"]]


def main():
    write = "--write" in sys.argv

    roster = json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]
    rem = {f[0]: {"abbrev": f[1], "long": f[2],
                  "alt": [] if len(f) < 4 or f[3] == "\\N" else
                         [x.strip().strip('"') for x in f[3].strip("{}").split(",") if x.strip()]}
           for f in copy_block("remedy") if len(f) >= 3}
    chapters = {f[0]: {"heading": f[2], "remedy_id": f[3]}
                for f in copy_block("mmchapter")
                if len(f) >= 4 and f[1] == BOERICKE_MMINFO}
    secs = defaultdict(list)
    for f in copy_block("mmsection"):
        if len(f) >= 7 and f[1] in chapters:
            secs[f[1]].append({"id": int(f[0]), "depth": int(f[2]),
                               "head": f[5], "content": unescape(f[6])})

    # Bangla section headings, carried over from the shards being replaced so
    # the reader keeps its translated headings.
    hbn = {}
    for f in sorted(OUT.glob("*.json")):
        for e in json.loads(f.read_text(encoding="utf-8")).values():
            for s in e.get("sections", []):
                if s.get("h") and s.get("hbn"):
                    hbn.setdefault(s["h"], s["hbn"])

    # The previous shards, used both as a fallback source and to settle which
    # id to use where the roster holds the same remedy twice.
    prev = {}
    for f in sorted(PREV.glob("*.json")):
        try:
            prev.update(json.loads(f.read_text(encoding="utf-8")))
        except ValueError:
            pass
    prev_id_for = {}
    for eid, e in prev.items():
        if not eid.startswith("~"):
            prev_id_for.setdefault(fold(e.get("name", "")), eid)

    # roster lookup. The roster carries 22 remedies under two ids each
    # ("bor"/"borx", "calc-si"/"calc-sil"). Picking whichever comes first moved
    # those remedies onto the other id and silently emptied the page the app
    # was already linking to, so the id the previous shards used wins.
    by_fold = defaultdict(list)
    for i, r in enumerate(roster):
        by_fold[fold(r["name"])].append((i, r["id"], r["name"]))
    roster_by_fold = {}
    for key, entries in by_fold.items():
        keep = entries[0]
        if len(entries) > 1:
            want = prev_id_for.get(key)
            for e in entries:
                if e[1] == want:
                    keep = e
                    break
        roster_by_fold[key] = keep

    roster_ids_set = {r["id"] for r in roster}
    roster_name_by_id = {r["id"]: r["name"] for r in roster}

    out = defaultdict(dict)
    linked, unlinked, collisions = 0, [], defaultdict(list)
    disagree = []
    broken_heading = []
    pending = []
    demoted = []

    for cid, c in chapters.items():
        rows = sorted(secs.get(cid, []), key=lambda s: s["id"])
        if not rows:
            continue
        r = rem.get(c["remedy_id"], {})
        heading = c["heading"]
        alias = r.get("long") or ""
        if heading.strip().lower() in ("none", ""):
            # One chapter lost its title in the dump; its remedy_id is the only
            # identity left, and the content confirms it (Justicia Adhatoda).
            heading = alias
            broken_heading.append((cid, alias))
        # Headings sometimes carry a synonym after a dash
        # ("ABIES CANADENSIS-PINUS CANADENSIS"); the part before it is the
        # remedy, the rest is the other name for the same plant.
        head_main = re.split(r"\s*--\s*|\s+-\s+", heading)[0].strip()

        lead_rows = [s for s in rows if s["depth"] == 1]
        body = [s for s in rows if s["depth"] != 1]
        common, lead_runs = "", []
        if lead_rows:
            txt = lead_rows[0]["content"]
            first, _, rest = txt.partition("\n")
            common, lead_runs = first.strip(), to_runs(rest.strip())

        sections = []
        for s in body:
            runs = to_runs(s["content"].strip())
            if not runs:
                continue
            sec = {"h": s["head"], "runs": runs}
            if s["head"] in hbn:
                sec["hbn"] = hbn[s["head"]]
            sections.append(sec)

        # Matching never consults `alias` (the remedy_id name). The links are
        # shifted in places — chapter "LACTICUM ACIDUM" points at Aceticum
        # Acidum and "SARCOLACTICUM ACIDUM" at Lacticum Acidum — so letting the
        # alias match put two different acids on one roster id.
        # Boericke prints his own canonical short name in parentheses on the
        # common-name line ("May-apple (PODOPHYLLUM)"), which resolves titles
        # the heading alone cannot: the chapter is headed PODOPHYLLINUM but the
        # remedy is the roster's Podophyllum Peltatum.
        paren = ""
        m = re.search(r"\(([A-Z][A-Z \-–]{2,})\)", common or "")
        if m:
            paren = m.group(1).strip()
        hit, rank = match_heading(heading, roster_by_fold)
        if not hit and paren:
            hit, rank = match_heading(paren, roster_by_fold)
            rank += 1                      # a title match is always preferred
        if not hit:
            # The previous shards already record which roster id this exact
            # remedy name was filed under, which settles synonym pairs the
            # roster spells differently — oorep prints "PULSATILLA PRATENSIS"
            # where the roster says "Pulsatilla Nigricans", the same remedy.
            # Using that mapping keeps the link *and* takes oorep's text,
            # rather than falling back to the older scrape.
            pid = prev_id_for.get(fold(heading)) or prev_id_for.get(fold(head_main))
            if pid and pid in roster_ids_set:
                hit, rank = (None, pid, roster_name_by_id.get(pid, head_main)), 90
        if alias and fold(alias) != fold(head_main) and not (
                fold(alias).startswith(fold(head_main))
                or fold(head_main).startswith(fold(alias))):
            disagree.append((cid, heading, alias))

        entry = {"sections": sections}
        if common:
            entry["common"] = common
        if lead_runs:
            entry["lead"] = lead_runs
        pending.append({"hit": hit, "rank": rank, "entry": entry,
                        "heading": heading, "head_main": head_main,
                        "alias": alias, "abbrev": r.get("abbrev", "")})

    # Assign ids only once every chapter has been read, so that when two
    # chapters match one roster id the better-ranked title takes it and the
    # other becomes an extra rather than silently replacing it.
    best = {}
    for p in pending:
        if not p["hit"]:
            continue
        eid = p["hit"][1]
        if eid not in best or p["rank"] < best[eid]["rank"]:
            best[eid] = p
    for p in pending:
        won = p["hit"] and best.get(p["hit"][1]) is p
        if won:
            eid, display = p["hit"][1], p["hit"][2]
            linked += 1
        else:
            if p["hit"]:
                demoted.append((p["heading"], p["hit"][1]))
            base = p["abbrev"] or p["head_main"]
            eid = "~" + base.lower().rstrip(".").replace(" ", "-")
            display = (p["alias"] if fold(p["alias"]) == fold(p["head_main"])
                       else p["head_main"].title())
            unlinked.append(p["head_main"])
        entry = dict(p["entry"])
        entry["name"] = display
        letter = (eid.lstrip("~")[:1] or "x").lower()
        if not letter.isalpha():
            letter = "x"
        out[letter][eid] = entry

    if broken_heading:
        print(f"chapters with no heading, identified from remedy_id: "
              f"{[b[1] for b in broken_heading]}")
    print(f"chapters whose heading and remedy_id name disagree: {len(disagree)}")
    print("   (heading is believed; listed so the link errors stay visible)")
    for cid, h, a in disagree[:6]:
        print(f"     {cid} {h[:34]:36} link says {a[:28]}")

    if demoted:
        print(f"chapters that lost a contested roster id to a better title: "
              f"{len(demoted)}")
        for h, eid in demoted[:8]:
            print(f"     {h[:36]:38} -> filed as an extra (id {eid} kept by the exact title)")
    # Typography: oorep flattens Boericke's ligatures ("dyspnoea" for
    # "dyspnœa", "haemorrhage" for "hæmorrhage") while the earlier scrape kept
    # them. 377 entries differ that way and in nothing else. The guide is
    # explicit that historical spelling must not be silently modernised, so
    # where the two carry the same text the older, better-set version is kept
    # and only its identity is taken from oorep.
    LIG_FLAT = {"æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE"}

    def flat(t):
        t = "".join(LIG_FLAT.get(c, c) for c in t)
        return re.sub(r"[\s*]+", " ", t).strip().lower()

    def body(e):
        out_ = "".join(r["t"] for r in e.get("lead", []))
        for x in e.get("sections", []):
            out_ += "".join(r["t"] for r in x.get("runs", []))
        return out_

    restored = 0
    for d in out.values():
        for eid, e in d.items():
            old = prev.get(eid)
            if not old or e.get("src_note"):
                continue
            if fold(old.get("name", "")) != fold(e.get("name", "")):
                continue
            if flat(body(old)) != flat(body(e)):
                continue
            if body(old) == body(e):
                continue
            for key in ("lead", "sections", "common"):
                if key in old:
                    e[key] = old[key]
                elif key in e:
                    del e[key]
            restored += 1
    if restored:
        print(f"kept the earlier, ligature-preserving text for: {restored} entries")

    # The roster lists 22 remedies twice under two ids. Only one of the pair
    # can own the chapter, which leaves the other id with an empty source
    # panel even though the book plainly covers that remedy — materia.js looks
    # the text up by whichever id the list happened to surface. Registering the
    # same entry under both ids removes that whole class of blank page.
    alias_added = []
    have0 = {k for d in out.values() for k in d}
    for key, entries in by_fold.items():
        if len(entries) < 2:
            continue
        owner = next((e for e in entries if e[1] in have0), None)
        if not owner:
            continue
        src = None
        for d in out.values():
            if owner[1] in d:
                src = d[owner[1]]
                break
        for e in entries:
            if e[1] == owner[1] or e[1] in have0:
                continue
            letter = (e[1][:1] or "x").lower()
            if not letter.isalpha():
                letter = "x"
            out[letter][e[1]] = dict(src)
            alias_added.append((e[1], owner[1], e[2]))
    if alias_added:
        print(f"roster duplicate-name pairs given the same entry: {len(alias_added)}")
        for a, o, nm in alias_added[:8]:
            print(f"     {a:12} mirrors {o:12} ({nm})")

    # Anything the previous shards had for a roster id that oorep cannot fill.
    kept_from_prev = []
    have = {k for d in out.values() for k in d}
    roster_ids = {r["id"] for r in roster}
    for eid, e in prev.items():
        if eid in have or eid.startswith("~") or eid not in roster_ids:
            continue
        letter = (eid[:1] or "x").lower()
        if not letter.isalpha():
            letter = "x"
        entry = dict(e)
        entry["src_note"] = "not in oorep; carried over from the previous shards"
        out[letter][eid] = entry
        kept_from_prev.append((eid, e.get("name", "")))
    if kept_from_prev:
        print(f"carried over from the previous shards (absent from oorep): "
              f"{len(kept_from_prev)}")
        for eid, nm in kept_from_prev[:10]:
            print(f"     {eid:12} {nm}")

    dupes = {}
    total = sum(len(v) for v in out.values())
    print(f"chapters read            : {len(chapters)}")
    print(f"entries built            : {total}")
    print(f"  linked to a roster id  : {linked}")
    print(f"  unlinked (~ prefix)    : {len(unlinked)}")
    if dupes:
        print(f"  !! two chapters claimed the same roster id: {len(dupes)}")
        for k, v in list(dupes.items())[:10]:
            print(f"       {k}: {v}")

    # what changes versus what is on disk today
    old = {}
    for f in sorted(OUT.glob("*.json")):
        old.update(json.loads(f.read_text(encoding="utf-8")))
    new = {k: v for d in out.values() for k, v in d.items()}
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    retargeted = [(k, old[k].get("name"), new[k].get("name"))
                  for k in set(old) & set(new)
                  if fold(old[k].get("name", "")) != fold(new[k].get("name", ""))]
    print(f"\nvs current shards: +{len(added)} new, -{len(removed)} gone, "
          f"{len(retargeted)} ids now point at a different remedy")
    for k, o, n in retargeted[:20]:
        print(f"   {k:14} was {o:32} -> now {n}")
    if added[:15]:
        print("   new ids: " + ", ".join(added[:15]))

    if not write:
        print("\n(dry run — pass --write to replace the shards)")
        return
    for letter, payload in out.items():
        (OUT / f"{letter}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.glob("*.json"))
    print(f"\nwritten: {len(out)} shards, {size/1024:.0f}KB")


if __name__ == "__main__":
    main()
