#!/usr/bin/env python3
"""Make Bangla remedy names consistent.

Same Latin word → same Bangla spelling. Truncated names get the missing
epithet. Catalog, roster, acutes, case-suggest, and the r_remedies* sources
stay in lockstep.

Run:  python3 tools/fix_remedy_bn_names.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
CATALOG = ROOT / "assets" / "data" / "remedies" / "catalog.json"
ACUTES = ROOT / "assets" / "data" / "acutes.json"
SUGGEST = ROOT / "assets" / "data" / "case-suggest.json"
R_PY = ROOT / "tools" / "r_remedies.py"
R_BN = ROOT / "tools" / "r_remedies_bn.py"

# Conflicting tokens: pick one spelling (majority, or the polychrest).
CANON = {
    "aconitum": "অ্যাকোনাইটাম",
    "agaricus": "অ্যাগারিকাস",
    "aranea": "অ্যারেনিয়া",
    "chininum": "চিনিনাম",
    "cinnabaris": "সিনাবারিস",
    "euphorbium": "ইউফোরবিয়াম",
    "juglans": "জাগল্যান্স",
    "palladium": "প্যালাডিয়াম",
    "sinapis": "সাইনাপিস",
    "spigelia": "স্পাইজেলিয়া",
    "strontium": "স্ট্রনশিয়াম",
    "tussilago": "টুসিলাগো",
    "xanthoxylum": "জ্যানথক্সিলাম",
    "silicata": "সিলিকাটা",
    "graveolens": "গ্র্যাভিওলেন্স",
    "maculatum": "ম্যাকুলেটাম",
    "aceticum": "অ্যাসিটিকাম",
    "dulcis": "ডুলসিস",
    "benzoicum": "বেঞ্জোয়িকাম",
    "muriaticum": "মিউরিয়েটিকাম",
    "tartaricum": "টার্টারিকাম",
    "aquaticum": "অ্যাকোয়াটিকাম",
}

# Whole-name overrides: truncated, wrong, or a well-known spelling we want
# written out in full.
FULL = {
    "acon": "অ্যাকোনাইটাম ন্যাপেলাস",
    "ign": "ইগনেশিয়া আমারা",
    "ip": "ইপিকাকুয়ানহা",
    "hep": "হিপার সালফিউরিস ক্যালকেরিয়াম",
    "convo": "কনভলভুলাস ডুয়ার্টিনাস",
    "euph": "ইউফোরবিয়াম অফিসিনারাম",
    "fago": "ফ্যাগোপাইরাম এসকুলেন্টাম",
    "gnaph": "ন্যাফালিয়াম পলিসেফালাম",
    "haem": "হিমাটক্সাইলাম ক্যাম্পেচিয়ানাম",
    "hist": "হিস্টামিনাম মিউরিয়েটিকাম",
    "ipom": "ইপোমিয়া পারপিউরিয়া",
    "lup": "লুপুলাস হিউমুলাস",
    "meli": "মেলিলোটাস অফিসিনালিস",
    "meny": "মেনিয়ানথিস ট্রাইফোলিয়াটা",
    "meph": "মেফাইটিস পিউটরিয়াস",
    "onos": "ওনোসমোডিয়াম ভার্জিনিয়ানাম",
    "osm": "অসমিয়াম মেটালিকাম",
    "ova": "ওভি গ্যালিনি পেলিকুলা",
    "palla": "প্যালাডিয়াম মেটালিকাম",
    "phel": "ফেলান্ড্রিয়াম অ্যাকোয়াটিকাম",
    "physal": "ফাইসেলিস অ্যালকেকেঞ্জি",
    "physos": "ফাইসোস্টিগমা ভেনেনোসাম",
    "polyg": "পলিগোনাম পাংকটেটাম",
    "quer": "কোয়ার্কাস রোবার",
    "rob": "রবিনিয়া সিউডাকাসিয়া",
    "rosm": "রোজমেরিনাস অফিসিনালিস",
    "scut": "স্কুটেলারিয়া ল্যাটেরিফ্লোরা",
    "spirae": "স্পাইরিয়া উলমেরিয়া",
    "stach": "স্ট্যাকিস বেটোনিকা",
    "stroph": "স্ট্রোফ্যান্থাস হিসপিডাস",
    "sumb": "সুম্বুলাস মস্কাটাস",
    "tanac": "ট্যানাসেটাম ভালগারে",
    "tarax": "ট্যারাক্সেকাম অফিসিনেল",
    "tell": "টেলুরিয়াম মেটালিকাম",
    "teucr": "টিউক্রিয়াম মেরাম ভেরাম",
    "thal": "থ্যালিয়াম মেটালিকাম",
    "theri": "থেরিডিয়ন কিউরাসাভিকাম",
    "thlaspi": "থ্ল্যাসপি বুরসা পাস্টোরিস",
    "til": "টিলিয়া ইউরোপিয়া",
    "tussil": "টুসিলাগো ফারফারা",
    "vanad": "ভ্যানাডিয়াম মেটালিকাম",
    "wye": "ওয়াইথিয়া হেলেনয়ডিস",
    "xanth": "জ্যানথক্সিলাম ফ্র্যাক্সিনিয়াম",
    "zizia": "জিজিয়া অরিয়া",
}

# Old token → new, for unaligned strings (order: longer first).
VARIANT_RE = [
    (re.compile(r"অ্যাকোনাইট(?!াম)"), "অ্যাকোনাইটাম"),
    (re.compile(r"আগারিকাস"), "অ্যাগারিকাস"),
    (re.compile(r"আরানিয়া"), "অ্যারেনিয়া"),
    (re.compile(r"কুইনিনাম"), "চিনিনাম"),
    (re.compile(r"সিনাবেরিস"), "সিনাবারিস"),
    (re.compile(r"ইউফরবিয়াম"), "ইউফোরবিয়াম"),
    (re.compile(r"জুগ্ল্যান্স"), "জাগল্যান্স"),
    (re.compile(r"প্যালেডিয়াম"), "প্যালাডিয়াম"),
    (re.compile(r"(?<!সা)সিনাপিস"), "সাইনাপিস"),
    (re.compile(r"স্পিজেলিয়া"), "স্পাইজেলিয়া"),
    (re.compile(r"স্ট্রনসিয়াম"), "স্ট্রনশিয়াম"),
    (re.compile(r"টুসিলেগো"), "টুসিলাগো"),
    (re.compile(r"জ্যান্থক্সাইলাম"), "জ্যানথক্সিলাম"),
    (re.compile(r"সিলিকেটা"), "সিলিকাটা"),
    (re.compile(r"গ্রেভিওলেন্স"), "গ্র্যাভিওলেন্স"),
    (re.compile(r"ম্যাকুলাটাম"), "ম্যাকুলেটাম"),
    (re.compile(r"অ্যাসেটিকাম"), "অ্যাসিটিকাম"),
    (re.compile(r"ডালসিস"), "ডুলসিস"),
    (re.compile(r"বেঞ্জোইকাম"), "বেঞ্জোয়িকাম"),
    (re.compile(r"মিউরিয়াটিকাম"), "মিউরিয়েটিকাম"),
    (re.compile(r"টারটারিকাম"), "টার্টারিকাম"),
    (re.compile(r"ইগ্নেশিয়া"), "ইগনেশিয়া"),
]


def lat_tokens(name: str) -> list[str]:
    core, _ = split_paren(name)
    return [t for t in re.split(r"[\s./,]+", core.strip()) if t]


def split_paren(s: str) -> tuple[str, str]:
    m = re.match(r"^(.*?)(\s*\(.*\))\s*$", s)
    if m:
        return m.group(1).strip(), m.group(2)
    return s, ""


def apply_variants(bn: str) -> str:
    for pat, rep in VARIANT_RE:
        bn = pat.sub(rep, bn)
    return bn


def fix_name(rid: str, latin: str, bangla: str) -> str:
    if rid in FULL:
        _, paren = split_paren(latin)
        return FULL[rid] + paren
    core, paren = split_paren(bangla)
    lt = lat_tokens(latin)
    bt = core.split()
    if len(lt) == len(bt) and bt:
        out = []
        for a, b in zip(lt, bt):
            out.append(CANON.get(a.lower().rstrip("."), b))
        return " ".join(out) + paren
    return apply_variants(core) + paren


def replace_roster_bn(text: str, rid: str, latin: str, old: str, new: str) -> tuple[str, int]:
    """Replace bangla_name on one roster row (id+name anchors the field)."""
    old_j = json.dumps(old, ensure_ascii=False)
    new_j = json.dumps(new, ensure_ascii=False)
    needle = (
        f'"id":{json.dumps(rid)},"name":{json.dumps(latin)},"bangla_name":{old_j}'
    )
    repl = (
        f'"id":{json.dumps(rid)},"name":{json.dumps(latin)},"bangla_name":{new_j}'
    )
    n = text.count(needle)
    if n == 1:
        text = text.replace(needle, repl, 1)
    return text, n


def main() -> None:
    roster_doc = json.loads(ROSTER.read_text(encoding="utf-8"))
    changes = []
    by_id = {}
    for r in roster_doc["remedies"]:
        old = r["bangla_name"]
        new = fix_name(r["id"], r["name"], old)
        by_id[r["id"]] = new
        if new != old:
            changes.append((r["id"], r["name"], old, new))
            r["bangla_name"] = new

    roster_text = ROSTER.read_text(encoding="utf-8")
    for rid, latin, old, new in changes:
        roster_text, n = replace_roster_bn(roster_text, rid, latin, old, new)
        if n != 1:
            raise SystemExit(f"roster bangla_name replace failed for {rid}: hits={n}")
    ROSTER.write_text(roster_text, encoding="utf-8")

    cat_text = CATALOG.read_text(encoding="utf-8")
    cat_n = 0
    for rid, latin, old, new in changes:
        # catalog is indent=2: "bangla": "..."
        old_j = json.dumps(old, ensure_ascii=False)
        new_j = json.dumps(new, ensure_ascii=False)
        for needle, repl in (
            (f'"bangla": {old_j}', f'"bangla": {new_j}'),
            (f'"bangla":{old_j}', f'"bangla":{new_j}'),
        ):
            if needle in cat_text:
                cat_text = cat_text.replace(needle, repl, 1)
                cat_n += 1
                break
        else:
            raise SystemExit(f"catalog bangla replace failed for {rid}")
    CATALOG.write_text(cat_text, encoding="utf-8")

    acutes = json.loads(ACUTES.read_text(encoding="utf-8"))
    acutes_n = 0
    acutes_text = ACUTES.read_text(encoding="utf-8")
    for r in acutes.get("remedies") or []:
        rid = r.get("id")
        if rid not in by_id:
            continue
        old = r.get("name_bn") or ""
        new = by_id[rid]
        if old == new:
            continue
        old_j = json.dumps(old, ensure_ascii=False)
        new_j = json.dumps(new, ensure_ascii=False)
        replaced = False
        for needle, repl in (
            (f'"name_bn": {old_j}', f'"name_bn": {new_j}'),
            (f'"name_bn":{old_j}', f'"name_bn":{new_j}'),
        ):
            if needle in acutes_text:
                acutes_text = acutes_text.replace(needle, repl, 1)
                acutes_n += 1
                replaced = True
                break
        if not replaced:
            raise SystemExit(f"acutes name_bn replace failed for {rid}")
    ACUTES.write_text(acutes_text, encoding="utf-8")

    sug_n = 0
    if SUGGEST.exists():
        sug_text = SUGGEST.read_text(encoding="utf-8")
        sug = json.loads(sug_text)
        for i, row in enumerate(sug.get("remedies") or []):
            if i >= len(roster_doc["remedies"]) or not isinstance(row, list) or len(row) < 2:
                continue
            new = roster_doc["remedies"][i]["bangla_name"]
            old = row[1]
            if old == new:
                continue
            old_j = json.dumps(old, ensure_ascii=False)
            new_j = json.dumps(new, ensure_ascii=False)
            # ["English", "bn", n] — replace the bn in this pair
            en_j = json.dumps(row[0], ensure_ascii=False)
            needle = f'[{en_j},{old_j}'
            repl = f'[{en_j},{new_j}'
            if needle not in sug_text:
                needle = f'[{en_j}, {old_j}'
                repl = f'[{en_j}, {new_j}'
            if needle not in sug_text:
                raise SystemExit(f"case-suggest replace failed at {i}: {row[0]}")
            sug_text = sug_text.replace(needle, repl, 1)
            sug_n += 1
        SUGGEST.write_text(sug_text, encoding="utf-8")

    r_py = R_PY.read_text(encoding="utf-8")
    py_n = 0
    for rid, latin, old, new in changes:
        pat = re.compile(
            r"(['\"]" + re.escape(rid) + r"['\"]\s*:\s*\(\s*'[^']*'\s*,\s*')("
            + re.escape(old) + r")(')"
        )
        r_py, c = pat.subn(r"\1" + new + r"\3", r_py, count=1)
        py_n += c
    R_PY.write_text(r_py, encoding="utf-8")

    r_bn = R_BN.read_text(encoding="utf-8")
    bn_n = 0
    by_lat = {}
    for r in roster_doc["remedies"]:
        by_lat.setdefault(r["name"], r["bangla_name"])

    def bn_repl(m):
        nonlocal bn_n
        q1, key, q2, val = m.group(1), m.group(2), m.group(3), m.group(4)
        if key in by_lat and by_lat[key] != val:
            bn_n += 1
            return f"{q1}{key}{q1}: {q2}{by_lat[key]}{q2}"
        return m.group(0)

    r_bn = re.sub(r"(['\"])([^'\"]+)\1\s*:\s*(['\"])([^'\"]*)\3", bn_repl, r_bn)
    R_BN.write_text(r_bn, encoding="utf-8")

    print(f"roster/catalog names changed: {len(changes)}")
    for rid, latin, old, new in changes:
        print(f"  {rid:12} {old}  →  {new}")
    print(f"catalog field hits: {cat_n}")
    print(f"acutes name_bn synced: {acutes_n}")
    print(f"case-suggest synced: {sug_n}")
    print(f"r_remedies.py id-anchored: {py_n}")
    print(f"r_remedies_bn.py: {bn_n}")


if __name__ == "__main__":
    main()
