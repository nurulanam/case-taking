#!/usr/bin/env python3
"""Freeze remedy identity into an explicit, reviewable map.

The rebuild instruction is blunt about this: fuzzy matching must never be the
*final* identity decision, because a wrong id silently shows one remedy's
materia medica under another remedy's name. Until now the Boericke builder
decided identity by algorithm every time it ran, which means the decision was
never written down, never reviewed, and could change under a code edit.

So the algorithm is demoted to a proposal generator. This writes

    docs/materia-identity.json

which records, per roster remedy, which source entry it is bound to, how that
binding was arrived at, and how much that method can be trusted. The builder
reads the map; the map is what gets reviewed and version-controlled.

Confidence is a statement about the *method*, not a guess:

  exact        the names are equal                            -> trusted
  ligature     equal once æ/œ and Latin synonyms are folded   -> trusted
  abbreviated  one name is the leading words of the other,
               which is how Clarke titles entries ("Aloe"
               for "Aloe Socotrina")                          -> trusted
  spelling     same genus, one letter apart in the species    -> trusted
  manual       set by hand in OVERRIDES below                 -> trusted
  id-only      bound by id, names not reconcilable by any
               rule above                                     -> REVIEW

Anything not "trusted" is listed under `needs_review` so it can be confirmed
or corrected by hand; a correction goes into OVERRIDES and becomes permanent.

Run:  python3 tools/materia_identity.py [--write]
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from materia_boericke_build import fold, _lev1  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
SOURCES = {
    "boericke": ROOT / "assets" / "data" / "materia" / "boericke",
    "clarke": ROOT / "assets" / "data" / "materia" / "clarke",
}
OUT = ROOT / "docs" / "materia-identity.json"

# Hand-decided bindings. These win over anything the matcher proposes and are
# the only place a human judgement about identity lives. Format:
#     "<roster id>": {"<source>": "<entry id or null>", "why": "..."}
OVERRIDES = {
    "camph": {"boericke": "camph",
              "why": "roster Camphora is the polychrest; the shard formerly "
                     "here was Camphora Bromata, a different remedy"},
    "stry": {"boericke": "stry",
             "why": "roster Strychninum; the shard formerly here was "
                    "Strychninum Phosphoricum"},
    "ind": {"boericke": "ind",
            "why": "roster Indigo Tinctoria; the shard formerly here was "
                   "Indium Metallicum"},
    "podo": {"boericke": "podo",
             "why": "Boericke titles the chapter PODOPHYLLINUM but its "
                    "common line reads 'May-apple (PODOPHYLLUM)' and the text "
                    "is the Podophyllum peltatum picture"},
    "radm": {"boericke": "radm",
             "why": "chapter headed RADIUM BROMATUM; oorep's remedy_id "
                    "wrongly points it at Cadmium Bromatum"},
}

# ── the 31 bindings that needed a person, adjudicated on the source's own
#    chemistry/botany rather than on the spelling of the title ─────────────
# Confirmed the same remedy: the provenance line gives the formula or the
# botanical name and it matches the roster remedy.
_SAME_AS_ROSTER = {
    "amph": "Amphisbæna vermicularis; œ/æ spelling only",
    "ant-s": "both are Golden Sulphuret of Antimony, Sb2S5",
    "arg-c": "both are Silver Cyanide, AgCN",
    "aur-a": "both are Arseniate of Gold",
    "bor-ac": "both are Boric Acid, H3BO3",
    "calc-sil": "both are Silicate of Calcium, CaSi2O5",
    "cer-s": "same Cactaceæ; Serpentaria/Serpentinus spelling",
    "culx": "both are the mosquito, Culicidæ",
    "ether": "both are Ethyl oxide",
    "euon": "both are Spindle-tree, Celastraceæ; -us/-a declension",
    "haem": "Clarke's provenance reads 'Hæmatoxylon campechianum'",
    "hippoz": "both are the glanders nosode (Mallein/Glanderin)",
    "iod": "both are the element Iodine",
    "juni": "both are Red Cedar; -a/-us declension",
    "kali-fer": "both are Potassic Ferrocyanide, K4Fe(CN)6",
    "linu-c": "both are Purging-flax, Linum catharticum",
    "merc-n": "both are Nitrate of Mercury, Hg(NO3)2",
    "naph": "both are Naphthalene, C10H8",
    "nicc-s": "both are Sulphate of Nickel, NiSO4",
    "ozone": "Clarke's Oxygenium entry states it includes Ozone, and the "
             "roster name is 'Ozone (Oxygenium)'",
    "sacc": "Clarke's entry states it includes Saccharum album, White Sugar",
    "sal-n": "both are Black Willow; Niger/Nigra declension",
    "serp": "both are Virginia Snake-root, Aristolochia serpentaria",
    "sil": "Clarke's provenance reads 'Silicea terra. Pure Flint. SiO2'",
    "staph": "both are Delphinium staphisagria, Stavesacre",
    "sumb": "both are Ferula sumbul, Musk-root",
}

# NOT the same remedy. These were already wrong in the shipped shards, and
# binding them would show one remedy's materia medica under another's name —
# the failure the roster rules call critical. Left unbound instead.
_WRONG_BINDING = {
    "merc-p-r": ("roster is Mercurius Præcipitatus Ruber (red); the Clarke "
                 "entry is Præcipitatus Albus, 'White Precipitate, NH2HgCl' "
                 "— a different mercury salt"),
    "nat-sil": ("roster is Natrum Silicatum; the Clarke entry is Natrum "
                "Silicofluoricum, 'Salufer, Na2SiF6' — a different salt"),
    "physal": ("roster is Physalis Alkekengi, a plant (winter cherry); the "
               "Clarke entry is Physalia pelagica, the Portuguese "
               "man-of-war — a different kingdom, not a spelling variant"),
}

for _rid, _why in _SAME_AS_ROSTER.items():
    OVERRIDES.setdefault(_rid, {})["clarke"] = _rid
    OVERRIDES[_rid].setdefault("why", "verified from the source's own "
                                      "provenance line: " + _why)
# hippoz and nicc-s also needed confirming on the Boericke side
for _rid in ("hippoz", "nicc-s"):
    OVERRIDES[_rid]["boericke"] = _rid

for _rid, _why in _WRONG_BINDING.items():
    OVERRIDES.setdefault(_rid, {})["clarke"] = None
    OVERRIDES[_rid]["why"] = _why


def load(dirpath):
    out = {}
    if not dirpath.exists():
        return out
    for f in sorted(dirpath.glob("*.json")):
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def classify(roster_name, entry_name, entry_id, roster_id):
    """How were these two bound together, and can the method be trusted?"""
    a, b = fold(roster_name), fold(entry_name)
    if a == b:
        # equal after folding; distinguish a plain match from one that needed
        # the ligature / Latin-synonym table
        raw_a = "".join(ch for ch in roster_name.lower() if ch.isalnum() or ch == " ")
        raw_b = "".join(ch for ch in entry_name.lower() if ch.isalnum() or ch == " ")
        return ("exact", True) if raw_a.split() == raw_b.split() else ("ligature", True)
    aw, bw = a.split(), b.split()
    # Clarke titles his dictionary entries by genus alone — "Aloe" for the
    # roster's "Aloe Socotrina", "Arnica" for "Arnica Montana". One name being
    # the leading words of the other is an abbreviation, not a different
    # remedy, so it does not need a person to adjudicate it.
    if aw and bw and (aw[:len(bw)] == bw or bw[:len(aw)] == aw):
        return ("abbreviated", True)
    # Same genus, one letter apart in the species: a spelling variant
    # ("Lycotonum"/"Lycoctonum", "Europaeum"/"Europoeum").
    if aw and bw and aw[0] == bw[0] and _lev1(a, b):
        return ("spelling", True)
    if entry_id == roster_id:
        # Bound by id, but the names are not reconcilable by any rule above.
        # This is the case that actually needs a person to look at it.
        return ("id-only", False)
    return ("unknown", False)


def main():
    write = "--write" in sys.argv
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]
    shards = {name: load(path) for name, path in SOURCES.items()}

    entries = []
    stats = defaultdict(int)
    review = []

    for i, r in enumerate(roster):
        rec = {"index": i, "id": r["id"], "name": r["name"], "sources": {}}
        for src, data in shards.items():
            hit = data.get(r["id"])
            ov = OVERRIDES.get(r["id"], {})
            if src in ov:
                want = ov[src]
                if want is None:
                    rec["sources"][src] = {
                        "entry": None, "method": "unbound", "trusted": True,
                        "why": ov.get("why", ""),
                    }
                    stats[f"{src}:unbound"] += 1
                    continue
                if want and want in data:
                    rec["sources"][src] = {
                        "entry": want, "entry_name": data[want].get("name", ""),
                        "method": "manual", "trusted": True, "why": ov.get("why", ""),
                    }
                    stats[f"{src}:manual"] += 1
                    continue
            if not hit:
                continue
            method, trusted = classify(r["name"], hit.get("name", ""), r["id"], r["id"])
            item = {"entry": r["id"], "entry_name": hit.get("name", ""),
                    "method": method, "trusted": trusted}
            if hit.get("src_note"):
                item["note"] = hit["src_note"]
            rec["sources"][src] = item
            stats[f"{src}:{method}"] += 1
            if not trusted:
                review.append({"roster_id": r["id"], "roster_name": r["name"],
                               "source": src, "entry_name": hit.get("name", ""),
                               "method": method})
        entries.append(rec)

    covered = {s: sum(1 for e in entries
                      if e["sources"].get(s, {}).get("entry")) for s in shards}
    doc = {
        "$generated_by": "tools/materia_identity.py",
        "$purpose": ("Frozen remedy-identity bindings. The matcher proposes; "
                     "this file decides. Correct a wrong binding by adding it "
                     "to OVERRIDES in the generator, not by editing here."),
        "roster_total": len(roster),
        "sources_present": sorted(shards),
        "sources_absent": ["kent-materia-medica"],
        "$sources_absent_note": ("The rebuild instruction names Kent's Materia "
                                 "Medica as a primary source. The project has "
                                 "Kent's *Repertory* only; no Kent materia "
                                 "medica text is present."),
        "coverage": covered,
        "method_counts": dict(sorted(stats.items())),
        "needs_review": review,
        "bindings": entries,
    }

    print(f"roster                 : {len(roster)}")
    for s in sorted(shards):
        print(f"  bound to {s:9}: {covered[s]}")
    print("\nmethod counts:")
    for k, v in sorted(stats.items()):
        print(f"  {k:26} {v}")
    print(f"\nbindings needing human review: {len(review)}")
    for x in review[:15]:
        print(f"  {x['roster_id']:12} {x['roster_name'][:26]:28} "
              f"{x['source']:9} -> {x['entry_name'][:28]:30} ({x['method']})")

    if not write:
        print("\n(dry run — pass --write to save the map and apply unbindings)")
        return

    # The map alone changes nothing the reader sees: materia.js resolves text
    # by roster id straight out of the shards. An entry the map declares
    # unbound has to actually stop answering to that id, or the wrong remedy
    # keeps being served. The content is kept under a "~" id rather than
    # deleted — it is a real entry for a real remedy, just not this one.
    moved = []
    for src, dirpath in SOURCES.items():
        want_unbound = {e["id"] for e in entries
                        if e["sources"].get(src, {}).get("method") == "unbound"}
        if not want_unbound:
            continue
        for f in sorted(dirpath.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            hit = [k for k in data if k in want_unbound]
            if not hit:
                continue
            for k in hit:
                data["~" + k] = data.pop(k)
                moved.append(f"{src}:{k}")
            f.write_text(json.dumps(data, ensure_ascii=False,
                                    separators=(",", ":")), encoding="utf-8")
    if moved:
        print(f"unbound entries moved off their roster id: {moved}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nwritten: {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f}KB)")


if __name__ == "__main__":
    main()
