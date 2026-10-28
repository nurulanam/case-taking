#!/usr/bin/env python3
"""Build the canonical remedy catalog and retarget name-based JSON to ids.

The roster at assets/data/repatories/remedies.json already has a stable
`id` per remedy (Kent slug). Other modules still stored display names or
abbreviations. This writes:

  assets/data/remedies/catalog.json   identity only (FK target)
  and rewrites tempraz / miasm / acutes to store those ids.

Repertory rubrics keep the compact "index:grade" encoding; the index is
the 0-based position in this catalog (same order as the roster). A future
SQL import maps index → catalog[i].id.

Run:  python3 tools/build_remedy_catalog.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
CATALOG = ROOT / "assets" / "data" / "remedies" / "catalog.json"
TEMPRAZ = ROOT / "assets" / "data" / "tempraz.json"
MIASM = ROOT / "assets" / "data" / "miasm.json"
MIASM_INLINE = ROOT / "assets" / "data" / "miasm.inline.js"
ACUTES = ROOT / "assets" / "data" / "acutes.json"
ACUTES_JS = ROOT / "assets" / "js" / "acutes.js"

# Names / abbreviations that the auto-matcher cannot safely fold onto an id.
MANUAL = {
    "sul.": "sulph",
    "sul": "sulph",
    "hepar sulph": "hep",
    "hepar sulphuris": "hep",
    "nitric acid": "nit-ac",
    "lycopodium": "lyc",
    "pulsatilla": "puls",
    "gelsemium": "gels",
    "ignatia": "ign",
    "ignatia amara": "ign",
    "china (cinchona)": "chin",
    "china": "chin",
    "cinchona": "chin",
    "acidum phosphoricum": "ph-ac",
    "phosphoricum acidum": "ph-ac",
    "lachesis": "lach",
    "lachesis muta": "lach",
    "silicea": "sil",
    "silicea terra": "sil",
    "apis.": "apis",
    "apis mellifica": "apis",
    "tarentula hispanica": "tarent",
    "tarentula": "tarent",
    "ferrum metallicum": "ferr",
    "lac caninum": "lac-c",
    "arsenicum iodatum": "ars-i",
    "kali bichromicum": "kali-bi",
    "asterias rubens": "aster",
    "lapis albus": "lap-a",
    "scrophularia": "scroph",
    "chimaphila": "chim",
    "sabal serrulata": "sabal",
    "carbo animalis": "carb-an",
    "carcinosinum": "carc",
    "conium": "con",
    "bacillinum": "bacil",
    "phytolacca": "phyt",
    "dulcamara": "dulc",
    "drosera": "dros",
    "spongia": "spong",
    "ipecacuanha": "ip",
    "ipecac": "ip",
    "staphysagria": "staph",
    "thuja": "thuj",
    "thuja occidentalis": "thuj",
    "nux vomica": "nux-v",
    "natrum sulphuricum": "nat-s",
    "natrum muriaticum": "nat-m",
    "calcarea carbonica": "calc",
    "calcarea phosphorica": "calc-p",
    "carbo vegetabilis": "carb-v",
    "mercurius solubilis": "merc",
    "mercurius": "merc",
    "aurum metallicum": "aur",
    "syphilinum": "syph",
    "tuberculinum": "tub",
    "phosphorus": "phos",
    "sepia": "sep",
    "sabina": "sabin",
    "stramonium": "stram",
    "arsenicum album": "ars",
    "causticum": "caust",
    "psorinum": "psor",
    "sulphur": "sulph",
    "medorrhinum": "med",
    "aconite": "acon",
    "aconitum": "acon",
    "aconitum napellus": "acon",
    "belladonna": "bell",
    "bryonia": "bry",
    "bryonia alba": "bry",
    "rhus_tox": "rhus-t",
    "rhus tox": "rhus-t",
    "rhus toxicodendron": "rhus-t",
    "nux_vomica": "nux-v",
    "chamomilla": "cham",
    "antim_tart": "ant-t",
    "antimonium tartaricum": "ant-t",
    "antimonium crudum": "ant-c",
    "baptisia": "bapt",
    "eupatorium": "eup-per",
    "eupatorium perfoliatum": "eup-per",
    "ferrum_phos": "ferr-p",
    "ferrum phosphoricum": "ferr-p",
    "hepar_sulph": "hep",
    "pyrogen": "pyrog",
    "carbo_veg": "carb-v",
    "coffea cruda": "coff",
    "kali sulphuricum": "kali-s",
    "cannabis indica": "cann-i",
    "hyoscyamus niger": "hyos",
    "nux moschata": "nux-m",
    "opium": "op",
    "baryta carbonica": "bar-c",
    "cina": "cina",
    "platina": "plat",
    "veratrum album": "verat",
    "kali bromatum": "kali-br",
    "graphites": "graph",
    "capsicum": "caps",
    "argentum nitricum": "arg-n",
    "kali arsenicosum": "kali-ar",
    "anacardium orientale": "anac",
    "sanicula": "sanic",
    "gelsemium sempervirens": "gels",
    "pulsatilla nigricans": "puls",
    "hepar sulphuriscalcareum": "hep",
    "hepar sulphuris calcareum": "hep",
}


def fold_latin(s: str) -> str:
    s = (s or "").lower().strip()
    s = s.replace("æ", "ae").replace("œ", "oe").replace("ö", "o").replace("ü", "u")
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def fold_key(s: str) -> str:
    s = (s or "").lower().strip()
    s = s.replace("_", " ").replace(".", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def abbr_display(abbr: str) -> str:
    parts = abbr.split("-")
    parts[0] = parts[0][:1].upper() + parts[0][1:]
    return "-".join(parts) + "."


def load_roster():
    raw = json.loads(ROSTER.read_text(encoding="utf-8"))
    return raw["remedies"]


def build_indexes(roster):
    by_id = {r["id"]: r for r in roster}
    by_fold_id = {fold_latin(r["id"]): r["id"] for r in roster}
    by_fold_name = {}
    by_fold_abbr = {}
    first_word = {}
    for r in roster:
        by_fold_name[fold_latin(r["name"])] = r["id"]
        by_fold_abbr[fold_latin(r["abbr"])] = r["id"]
        fw = fold_latin(r["name"].split()[0])
        first_word.setdefault(fw, []).append(r["id"])
    return by_id, by_fold_id, by_fold_name, by_fold_abbr, first_word


def resolve(token: str, idx) -> str | None:
    if not token:
        return None
    by_id, by_fold_id, by_fold_name, by_fold_abbr, first_word = idx
    raw = token.strip()
    if raw in by_id:
        return raw
    key = fold_key(raw)
    if key in MANUAL:
        return MANUAL[key]
    dotted = raw.rstrip(".").lower()
    if dotted in by_id:
        return dotted
    # "Nux-v." / "Nat-m." → nux-v
    slug = re.sub(r"\.+$", "", raw).lower()
    if slug in by_id:
        return slug
    fl = fold_latin(raw)
    if fl in by_fold_id:
        return by_fold_id[fl]
    if fl in by_fold_abbr:
        return by_fold_abbr[fl]
    if fl in by_fold_name:
        return by_fold_name[fl]
    # leading-word unique match ("Pulsatilla" → Pulsatilla Nigricans)
    hits = first_word.get(fl) or first_word.get(fold_latin(raw.split()[0]))
    if hits and len(hits) == 1:
        return hits[0]
    return None


def collect_aliases(roster, mapped_tokens):
    """aliases[id] = extra strings that resolved to this id."""
    aliases = {r["id"]: set() for r in roster}
    for token, rid in mapped_tokens:
        if not rid:
            continue
        if rid not in aliases:
            continue
        aliases[rid].add(token)
        r = next(x for x in roster if x["id"] == rid)
        aliases[rid].add(r["name"])
        aliases[rid].add(abbr_display(r["abbr"]))
        if r.get("bangla_name"):
            aliases[rid].add(r["bangla_name"])
    return aliases


def write_catalog(roster, aliases):
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    remedies = []
    for i, r in enumerate(roster):
        extra = sorted(
            a for a in aliases.get(r["id"], set())
            if a and a not in {r["id"], r["name"], r.get("bangla_name"), r["abbr"]}
        )
        remedies.append({
            "id": r["id"],
            "name": r["name"],
            "bangla": r.get("bangla_name") or "",
            "abbr": r["abbr"],
            "abbr_display": abbr_display(r["abbr"]),
            "family": r.get("family") or "",
            "aliases": extra,
        })
    doc = {
        "schema": 1,
        "pk": "id",
        "id_scheme": "kent-slug",
        "count": len(remedies),
        "source": "assets/data/repatories/remedies.json",
        "note": (
            "Canonical remedy identity. Every other dataset stores this `id` "
            "(a foreign key), never a display name. Repertory compact grades "
            "still use the 0-based index into this array — same order as the "
            "roster — so a SQL import maps index → remedies[i].id."
        ),
        "remedies": remedies,
    }
    CATALOG.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {CATALOG.relative_to(ROOT)} ({len(remedies)} remedies)")


def plan_tempraz(idx, data):
    unmatched = []

    def map_scores(scores: dict) -> dict:
        out = {}
        for k, v in scores.items():
            rid = resolve(k, idx)
            if not rid:
                unmatched.append(("tempraz.score", k))
                continue
            out[rid] = v
        return out

    info = data.get("remedyInfo") or {}
    for k, meta in info.items():
        rid = resolve(k, idx) or resolve(meta.get("full") or "", idx)
        if not rid:
            unmatched.append(("tempraz.remedyInfo", k))

    for temp in (data.get("temperaments") or {}).values():
        for group in (temp.get("traits") or {}).values():
            for trait in group:
                if isinstance(trait.get("scores"), dict):
                    trait["scores"] = map_scores(trait["scores"])
        new_rx = []
        for rx in temp.get("remedies") or []:
            rid = (
                resolve(rx.get("id") or "", idx)
                or resolve(rx.get("abbr") or "", idx)
                or resolve(rx.get("name") or "", idx)
            )
            if not rid:
                unmatched.append(("tempraz.remedy", rx.get("id") or rx.get("abbr") or rx.get("name")))
                continue
            new_rx.append({
                "id": rid,
                "affinity": rx.get("affinity"),
                "keynote": rx.get("keynote") or "",
                "differentiating": rx.get("differentiating") or "",
            })
        temp["remedies"] = new_rx
    data.pop("remedyInfo", None)
    return unmatched


def plan_miasm(idx, data):
    unmatched = []
    for mid, m in (data.get("miasms") or {}).items():
        ids = []
        for name in m.get("associated_remedies") or []:
            rid = resolve(name, idx)
            if not rid:
                unmatched.append((f"miasm.{mid}", name))
                continue
            if rid not in ids:
                ids.append(rid)
        m["associated_remedies"] = ids
    return unmatched


def plan_acutes_json(idx, data):
    unmatched = []
    for r in data.get("remedies") or []:
        rid = resolve(r.get("id") or "", idx) or resolve(r.get("name_en") or "", idx) or resolve(r.get("abbr") or "", idx)
        if not rid:
            unmatched.append(("acutes.json", r.get("id") or r.get("name_en")))
            continue
        r["id"] = rid
    return unmatched


R_CALL = re.compile(
    r"R\(\s*(null|\d+)\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)"
)


def plan_acutes_js(idx, text):
    unmatched = []
    hits = []

    def repl(m):
        n, en, _bn, ab = m.group(1), m.group(2), m.group(3), m.group(4)
        rid = resolve(en, idx) or resolve(ab, idx)
        if not rid:
            unmatched.append(("acutes.js", f"{en} / {ab}"))
            return m.group(0)
        hits.append(rid)
        return f"R({n}, '{rid}')"

    new = R_CALL.sub(repl, text)
    if not unmatched and hits:
        new = re.sub(
            r"function R\(n, en, bn, ab\) \{ return \{ n: n, en: en, bn: bn, ab: ab \}; \}",
            "function R(n, id) {\n"
            "  const rx = window.RemedyStore && RemedyStore.get(id);\n"
            "  return {\n"
            "    n: n, id: id,\n"
            "    en: rx ? rx.name : id,\n"
            "    bn: rx ? (rx.bangla || rx.name) : id,\n"
            "    ab: rx ? (rx.abbr_display || rx.abbr) : id\n"
            "  };\n"
            "}",
            new,
            count=1,
        )
    return unmatched, new, len(hits)


def main():
    roster = load_roster()
    idx = build_indexes(roster)
    print(f"roster: {len(roster)} remedies")

    tempraz = json.loads(TEMPRAZ.read_text(encoding="utf-8"))
    miasm = json.loads(MIASM.read_text(encoding="utf-8"))
    acutes = json.loads(ACUTES.read_text(encoding="utf-8"))
    acutes_js = ACUTES_JS.read_text(encoding="utf-8")

    unmatched = []
    unmatched += plan_tempraz(idx, tempraz)
    unmatched += plan_miasm(idx, miasm)
    unmatched += plan_acutes_json(idx, acutes)
    js_unmatched, js_new, n_r = plan_acutes_js(idx, acutes_js)
    unmatched += js_unmatched

    if unmatched:
        print("\nUNMATCHED — no files written:")
        for where, name in unmatched:
            print(f"  {where}: {name}")
        sys.exit(1)

    TEMPRAZ.write_text(json.dumps(tempraz, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"rewrote {TEMPRAZ.relative_to(ROOT)}")
    MIASM.write_text(json.dumps(miasm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inline = "// AUTO-GENERATED INLINE DATABASE (Fallback when fetch fails)\n"
    inline += "window.MIASMS_DB_INLINE = "
    inline += json.dumps(miasm, ensure_ascii=False, indent=2)
    inline += ";\n"
    MIASM_INLINE.write_text(inline, encoding="utf-8")
    print(f"rewrote {MIASM.relative_to(ROOT)} and {MIASM_INLINE.relative_to(ROOT)}")
    ACUTES.write_text(json.dumps(acutes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"rewrote {ACUTES.relative_to(ROOT)}")
    if n_r:
        ACUTES_JS.write_text(js_new, encoding="utf-8")
        print(f"rewrote {n_r} R() calls in {ACUTES_JS.relative_to(ROOT)}")
    else:
        print("acutes.js already uses catalog ids")

    mapped = [(token, rid) for token, rid in MANUAL.items()]
    aliases = collect_aliases(roster, mapped)
    write_catalog(roster, aliases)
    print("all names resolved to catalog ids")


if __name__ == "__main__":
    main()
