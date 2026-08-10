# -*- coding: utf-8 -*-
"""Apply the Bangla materia medica volumes onto the shared remedy roster.

    python3 tools/apply_materia.py

The drug pictures are independent of the repertory parse, so adding a volume
should not require the Kent HTML mirror and a 20-minute reparse of 66,000
rubrics. This walks the `remedies` array in remedies.json, refreshes each
record's materia medica fields from r_materia*.py, and rewrites the file.

There is exactly one roster now (see tools/split_repertories.py). It used to be
copied inside each of the three repertory files and every one of them had to be
rewritten in lockstep — when boenninghausen_repertory.json was missing from that
list it silently kept a stale table and missed 33 new drug pictures. One file
means that failure mode no longer exists.

Per-book figures that depend on the roster — how much of each repertory's own
citations reach a Bangla picture — are recomputed into each rubrics file, since
that number is a property of the book, not of the roster.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from r_materia import MM
from r_materia2 import MM2
from r_materia3 import MM3

DATA = os.path.join(HERE, '..', 'assets', 'data', 'repatories')
ROSTER = 'remedies.json'
# rubrics files whose per-book materia-medica coverage is recomputed after the
# roster changes; discovered from index.json so a new book needs no edit here
INDEX = 'index.json'

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))

# fields a materia medica entry owns; cleared before reapplying so a field
# removed from the source table does not linger in the built file
OWNED = ['bangla_intro', 'keynotes', 'mental', 'general', 'particular', 'modalities',
         'cravings_aversions', 'sleep', 'dreams', 'skin', 'stool', 'urine',
         'clinical_uses', 'relationships', 'potency_notes']

VOLUMES = [('1', MM), ('2', MM2), ('3', MM3)]

# Roster entries that are the SAME remedy under a second name/abbreviation
# (both spellings occur in the source rubric text). The alias reads the canonical
# id's drug picture instead of us writing the same Bangla text twice -- and more
# importantly instead of the card claiming "no materia medica" for a remedy whose
# picture we already have under its other name.
#
# Same-substance, verified individually:
ALIASES = {
    # --- plain spelling / abbreviation variants of one remedy
    'calc-si': 'calc-sil', 'chen-an': 'chen-a', 'convo': 'conv-d',
    'jugl-c': 'jug-c', 'kali-bic': 'kali-bi', 'ocim': 'oci',
    'piper': 'pip-n', 'xanth': 'xan', 'zizia': 'ziz',
    'naphtin': 'naph',             # Naphtalinum / Naphthalin
    'palla': 'pall',               # Palladium Metallicum / Palladium
    'physos': 'phys',              # Physostigma Venenosum / Physostigma
    'sen': 'seneg',                # Senega Officinalis / Senega
    'theri': 'ther',               # Theridion Curassavicum / Theridion
    'cham-v': 'cham',              # Chamomilla Vulgaris == Matricaria chamomilla
    'bism-ox': 'bism',             # Kent's own key glosses "Bism." as Bismuthum Oxidum
    'phyt-d': 'phyt',              # "Phytolacca Berry" is the berry of Ph. decandra

    # --- two Latin names for one drug, confirmed from the source books
    'aml-n': 'aml-ns',             # Amyl Nitrite == Amylenum Nitrosum
    'cahin': 'cain',               # Bonninghausen's key: "Cahin. --> Cainca. (Cahinca)"
    'poth': 'ictod',               # Boericke titles it "Ictodes Foetida ... (POTHOS FOETIDUS)"
    'chen': 'aphis',               # "Chenopodium Glauci Aphis" == Aphis Chenopodii Glauci
    'lappa-m': 'lappa-a',          # Lappa Major == Arctium Lappa, one plant
    'rad': 'radm',                 # the only Radium either book proves is the bromide
    'sac-alb': 'sacc',             # identical roster names ("Saccharum Album") filed twice

    # --- botanical varieties neither source book gives a separate picture for,
    #     so the parent remedy's picture is the honest thing to show
    'bufo-s': 'bufo',              # Clarke prints one generic "Bufo"
    'rhus-r': 'rhus-t',            # Rhus radicans and R. toxicodendron are one species
}


def lookup(ab):
    ab = ALIASES.get(ab, ab)
    for vol, table in VOLUMES:
        if ab in table:
            return vol, table[ab]
    return None, None


def apply_to(rec):
    """Refresh one remedy record. Returns the volume that supplied it, or None."""
    for f in OWNED:
        rec.pop(f, None)
    rec.pop('mm_volume', None)
    vol, mm = lookup(rec['id'])
    if not mm:
        rec['content_status'] = 'basic'
        return None
    rec['content_status'] = 'full'
    rec['mm_volume'] = vol
    if mm.get('intro'):
        rec['bangla_intro'] = mm['intro']
    for src, dst in [('keynotes', 'keynotes'), ('mental', 'mental'), ('general', 'general'),
                     ('particular', 'particular'), ('modalities', 'modalities'),
                     ('clinical', 'clinical_uses')]:
        if mm.get(src):
            rec[dst] = mm[src]
    ca = {}
    if mm.get('cravings'):
        ca['cravings'] = mm['cravings']
    if mm.get('aversions'):
        ca['aversions'] = mm['aversions']
    if ca:
        rec['cravings_aversions'] = ca
    for f in ('sleep', 'dreams', 'skin', 'stool', 'urine'):
        if mm.get(f):
            rec[f] = mm[f]
    rel = {}
    for f in ('complementary', 'antidote', 'inimical'):
        if mm.get(f):
            rel[f] = mm[f]
    if rel:
        rec['relationships'] = rel
    if mm.get('potency'):
        rec['potency_notes'] = mm['potency']
    return vol


# ---------------------------------------------------------------- the roster
rp = os.path.join(DATA, ROSTER)
roster = json.load(open(rp, encoding='utf-8'))
remedies = roster['remedies']

by_vol = collections.Counter()
for rec in remedies:
    v = apply_to(rec)
    if v:
        by_vol[v] += 1
full = sum(by_vol.values())

rmd = roster.setdefault('metadata', {})
rmd['remedies_total'] = len(remedies)
rmd['remedies_with_full_materia_medica'] = full
rmd['remedies_basic_entry_only'] = len(remedies) - full
rmd['materia_medica_volumes'] = {v: n for v, n in sorted(by_vol.items())}

with open(rp, 'w', encoding='utf-8') as f:
    json.dump(roster, f, ensure_ascii=False, separators=(',', ':'))
print(f'{ROSTER:<32} full MM {full}/{len(remedies)} '
      f'(vol1 {by_vol["1"]}, vol2 {by_vol["2"]}, vol3 {by_vol["3"]}) '
      f'| {round(os.path.getsize(rp)/1048576, 2)} MB')

# ------------------------------------------- per-book coverage of its own cites
# "how many of THIS book's remedy references reach a Bangla picture" is a fact
# about the book, so it is recomputed into each rubrics file rather than living
# on the roster. Books come from index.json so adding one needs no edit here.
idx_full = [r['content_status'] == 'full' for r in remedies]
index = json.load(open(os.path.join(DATA, INDEX), encoding='utf-8'))
for entry in index.get('repertories', []):
    p = os.path.join(DATA, entry['file'])
    if not os.path.exists(p):
        print(f'  skip (absent): {entry["file"]}')
        continue
    db = json.load(open(p, encoding='utf-8'))
    cells = mm_cells = 0
    for ch in db.get('repertory_rubrics', []):
        for rb in ch['rubrics']:
            for tok in rb['r'].split(','):
                if not tok:
                    continue
                cells += 1
                if idx_full[int(tok.split(':')[0])]:
                    mm_cells += 1
    pct = round(100 * mm_cells / max(1, cells))
    md = db.setdefault('metadata', {})
    md['materia_medica_coverage_pct'] = pct
    md['materia_medica_note_bn'] = (
        '{f}টি ওষুধের পূর্ণ বাংলা মেটেরিয়া মেডিকা আছে — এই বইয়ের ওষুধ-উল্লেখের {p} শতাংশ '
        'এই ওষুধগুলোর। বাকিগুলোর জন্য কার্ডে বোরিক ও ক্লার্কের মূল ইংরেজি পাঠ দেখানো হয়।'
    ).format(f=BN(full), p=BN(pct))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  {entry["file"]:<30} covers {pct}% of its citations')

print()
print('volumes:', ', '.join(f'vol{v} {n}' for v, n in sorted(by_vol.items())),
      '| total', full)
