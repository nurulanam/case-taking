# -*- coding: utf-8 -*-
"""Apply the Bangla materia medica volumes onto the already-built data files.

    python3 tools/apply_materia.py

The drug pictures are independent of the repertory parse, so adding a volume
should not require the Kent HTML mirror and a 20-minute reparse of 66,000
rubrics. This walks the `remedies` array of every built repertory file, refreshes
each record's materia medica fields from r_materia*.py, and rewrites the file.

Both repertories carry the *same* remedies array by design (that is what lets a
Boericke result open the same Bangla picture), so both are updated together —
patching only one would silently split them.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from r_materia import MM
from r_materia2 import MM2
from r_materia3 import MM3

DATA = os.path.join(HERE, '..', 'assets', 'data', 'repatories')
FILES = ['kent_remidies.json', 'boericke_repertory.json']

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))

# fields a materia medica entry owns; cleared before reapplying so a field
# removed from the source table does not linger in the built file
OWNED = ['bangla_intro', 'keynotes', 'mental', 'general', 'particular', 'modalities',
         'cravings_aversions', 'sleep', 'dreams', 'skin', 'stool', 'urine',
         'clinical_uses', 'relationships', 'potency_notes']

VOLUMES = [('1', MM), ('2', MM2), ('3', MM3)]


def lookup(ab):
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


total = {v: 0 for v, _ in VOLUMES}
for fn in FILES:
    p = os.path.join(DATA, fn)
    if not os.path.exists(p):
        print('skip (absent):', fn)
        continue
    db = json.load(open(p, encoding='utf-8'))
    remedies = db['remedies']
    by_vol = collections.Counter()
    for rec in remedies:
        v = apply_to(rec)
        if v:
            by_vol[v] += 1
    full = sum(by_vol.values())

    # how much of this book's own citations now reach a drug picture
    idx_full = [r['content_status'] == 'full' for r in remedies]
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
    md['remedies_with_full_materia_medica'] = full
    md['remedies_basic_entry_only'] = len(remedies) - full
    md['materia_medica_coverage_pct'] = pct
    md['materia_medica_volumes'] = {v: n for v, n in sorted(by_vol.items())}
    md['materia_medica_note_bn'] = (
        '{f}টি ওষুধের পূর্ণ বাংলা মেটেরিয়া মেডিকা আছে — এই বইয়ের ওষুধ-উল্লেখের {p} শতাংশ '
        'এই ওষুধগুলোর। বাকিগুলোর জন্য কার্ডে বোরিক ও ক্লার্কের মূল ইংরেজি পাঠ দেখানো হয়।'
    ).format(f=BN(full), p=BN(pct))

    with open(p, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{fn:<26} full MM {full}/{len(remedies)} '
          f'(vol1 {by_vol["1"]}, vol2 {by_vol["2"]}, vol3 {by_vol["3"]}) '
          f'| covers {pct}% of its citations | {round(os.path.getsize(p)/1024/1024, 2)} MB')
    for v, n in by_vol.items():
        total[v] = n

print()
print('volumes:', ', '.join(f'vol{v} {n}' for v, n in sorted(total.items())),
      '| total', sum(total.values()))
