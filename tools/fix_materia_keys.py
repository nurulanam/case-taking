# -*- coding: utf-8 -*-
"""Re-key already-built materia shards using build_materia_src.FORCE_ID.

    python3 tools/fix_materia_keys.py [--dry-run]

`build_materia_src.py` joins a source page to our roster by Latin name, and a
handful of pages never matched because the two editions spell the same remedy
differently ('Euonymus Europaea' vs our 'Europaeus', 'Mercurius Nitricus' vs our
'Nitrosus'). Those pages ended up parked under a source-only '~abbr' key, so the
remedy card showed "no source" even though a full drug picture was sitting in the
shard directory the whole time.

FORCE_ID in build_materia_src.py fixes that join for future rebuilds, but the
Boericke/Clarke HTML mirrors have since been removed, so the shards cannot be
rebuilt from source. This applies the same mapping to the built files directly.

Idempotent: a '~key' already moved is simply absent the next time. Collisions
(target id already holding an entry from the same book) are reported and skipped
rather than overwritten — that would mean the mapping is wrong, not that the
file needs fixing.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from materia_map import FORCE_ID, shard_of

DIR = os.path.join(HERE, '..', 'assets', 'data', 'materia')
DRY = '--dry-run' in sys.argv


def load(src):
    """-> {shard letter: {key: entry}} for one source directory."""
    out = {}
    d = os.path.join(DIR, src)
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.json'):
            out[fn[:-5]] = json.load(open(os.path.join(d, fn), encoding='utf-8'))
    return out


index = json.load(open(os.path.join(DIR, 'index.json'), encoding='utf-8'))
sources = [s for s in sorted(os.listdir(DIR)) if os.path.isdir(os.path.join(DIR, s))]

moved = collections.Counter()
skipped = []
for src in sources:
    shards = load(src)
    flat = {k: (letter, e) for letter, d in shards.items() for k, e in d.items()}
    dirty = set()
    for abbr, rid in sorted(FORCE_ID.items()):
        old = '~' + abbr
        if old not in flat:
            continue                      # already moved, or this book lacks the page
        letter, entry = flat[old]
        if rid in flat:
            skipped.append(f'{src}: {old} -> {rid} (target already present)')
            continue
        target = shard_of(rid)
        del shards[letter][old]
        dirty.add(letter)
        shards.setdefault(target, {})[rid] = entry
        dirty.add(target)
        flat[rid] = (target, entry)
        moved[src] += 1
        print(f'{src:<9} {old:<16} -> {rid:<10} (shard {letter} -> {target})')

    if not DRY:
        for letter in sorted(dirty):
            p = os.path.join(DIR, src, letter + '.json')
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(shards[letter], f, ensure_ascii=False, separators=(',', ':'))
    # the page consults this list before fetching, so a shard that has just
    # gained its first entry must be declared or the fetch is never attempted
    have = sorted(l for l, d in shards.items() if d)
    if src in index.get('sources', {}):
        index['sources'][src]['shards'] = have

if not DRY:
    with open(os.path.join(DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

print()
for s in sources:
    print(f'{s:<9} re-keyed {moved[s]}')
for s in skipped:
    print('SKIPPED', s)
print('dry run — nothing written' if DRY else 'shards + index.json updated')
