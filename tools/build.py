# -*- coding: utf-8 -*-
"""Rebuild assets/data/repatories/kent_remidies.json from the curated source tables.

    python3 tools/build.py

    r_remedies.py  remedy roster   : key -> (Latin, Bangla, family, thermal, miasm)
    r_materia.py   materia medica  : key -> genuine keynotes/mental/general/...
    r_rub1.py      rubrics ch 1-8  : 'Rubric': ('বাংলা', [(remedy key, grade), ...])
    r_rub2.py      rubrics ch 9-16

    Unknown remedy keys abort the build; entries with grade 0 are dropped.
"""
import json, sys, os, collections

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))
THERMAL_BN = {'chilly': 'শীতার্ত', 'hot': 'গরম', 'mixed': 'মিশ্র — গরম ও ঠান্ডা দুটোতেই কষ্ট'}

# icon key per Kent chapter — resolved to an SVG symbol (assets/img/chapter-icons.svg)
CHAPTER_ICON = {1: 'mind', 2: 'vertigo', 3: 'head', 4: 'eye', 5: 'vision', 6: 'ear', 7: 'hearing', 8: 'nose', 9: 'face', 10: 'mouth', 11: 'teeth', 12: 'throat', 13: 'neck', 14: 'stomach', 15: 'abdomen', 16: 'rectum', 17: 'stool', 18: 'bladder', 19: 'kidneys', 20: 'prostate', 21: 'urethra', 22: 'urine', 23: 'male', 24: 'female', 25: 'larynx', 26: 'respiration', 27: 'cough', 28: 'expectoration', 29: 'chest', 30: 'back', 31: 'extremities', 32: 'sleep', 33: 'chill', 34: 'fever', 35: 'perspiration', 36: 'skin', 37: 'generalities'}
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from r_remedies import R
from r_materia import MM
from r_kent1 import K1
from r_kent2 import K2
from r_kent3 import K3
from r_kent4 import K4

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'kent_remidies.json')
# Kent's canonical 37 chapters, in order
CHAPTERS = K1 + K2 + K3 + K4
assert [n for n, _, _ in CHAPTERS] == list(range(1, 38)), 'chapters must be 1..37 in order'

# ---------------- validate ----------------
unknown = collections.Counter()
dropped = 0
for num, ch, rubs in CHAPTERS:
    for name, (bn, lst) in rubs.items():
        for key, grade in lst:
            if grade <= 0:
                continue
            if key not in R:
                unknown[key] += 1
if unknown:
    print('UNKNOWN REMEDY KEYS:', dict(unknown))
    sys.exit(1)

# ---------------- remedies ----------------
used = set()
for num, ch, rubs in CHAPTERS:
    for name, (bn, lst) in rubs.items():
        for key, grade in lst:
            if grade > 0:
                used.add(key)

remedies = []
for key in sorted(R, key=lambda k: R[k][0]):
    latin, bangla, family, thermal, miasm = R[key]
    mm = MM.get(key, {})
    rec = {
        'id': key,
        'name': latin,
        'bangla_name': bangla,
        'abbr': key,
        'family': family,
        'content_status': 'full' if mm else 'basic',
        'in_rubrics': key in used,
    }
    if thermal:
        rec['thermal'] = THERMAL_BN.get(thermal, thermal)
        rec['thermal_en'] = thermal
    if miasm: rec['miasm'] = miasm
    if mm:
        if mm.get('intro'):        rec['bangla_intro'] = mm['intro']
        for src, dst in [('keynotes','keynotes'), ('mental','mental'), ('general','general'),
                         ('particular','particular'), ('modalities','modalities'), ('clinical','clinical_uses')]:
            if mm.get(src): rec[dst] = mm[src]
        ca = {}
        if mm.get('cravings'):  ca['cravings'] = mm['cravings']
        if mm.get('aversions'): ca['aversions'] = mm['aversions']
        if ca: rec['cravings_aversions'] = ca
        for f in ('sleep', 'dreams', 'skin', 'stool', 'urine'):
            if mm.get(f): rec[f] = mm[f]
        rel = {}
        for f in ('complementary', 'antidote', 'inimical'):
            if mm.get(f): rel[f] = mm[f]
        if rel: rec['relationships'] = rel
        if mm.get('potency'): rec['potency_notes'] = mm['potency']
    remedies.append(rec)

name_of = {k: R[k][0] for k in R}
bn_of = {k: R[k][1] for k in R}

# ---------------- rubrics ----------------
rubric_chapters = []
total_rub = 0
total_cells = 0
grade_hist = collections.Counter()
size_hist = collections.Counter()
pattern_set = set()

for num, ch, rubs in CHAPTERS:
    out_rubs = []
    for name, (bn, lst) in rubs.items():
        pairs = [(k, g) for k, g in lst if g > 0]
        pairs.sort(key=lambda x: (-x[1], name_of[x[0]]))
        out_rubs.append({
            'name': name,
            'bangla_name': bn,
            'remedies': {name_of[k]: g for k, g in pairs},
            'remedies_bn': {name_of[k]: bn_of[k] for k, g in pairs},
        })
        total_rub += 1
        total_cells += len(pairs)
        size_hist[len(pairs)] += 1
        pattern_set.add(tuple(g for k, g in pairs))
        for k, g in pairs: grade_hist[g] += 1
    parts = [x.strip() for x in ch.split('-', 1)]
    rubric_chapters.append({
        'number': num,
        'chapter': ch,
        'name_en': parts[0],
        'name_bn': parts[1] if len(parts) > 1 else '',
        'icon': CHAPTER_ICON.get(num, ''),
        'rubrics': out_rubs,
    })

# ---------------- search index ----------------
search = []
for rec in remedies:
    kws = []
    kws += rec.get('keynotes', [])[:4]
    kws += rec.get('clinical_uses', [])[:3]
    if kws:
        search.append({'keywords': ', '.join(kws), 'match_id': rec['id']})

full = sum(1 for r in remedies if r['content_status'] == 'full')
db = {
    'metadata': {
        'title': 'কেন্ট রিপার্টরী — বাংলা হোমিওপ্যাথি ডিজিটাল গ্রন্থাগার',
        'title_en': "Kent's Repertory (Bangla) — 37 chapters, curated",
        'version': '4.0-kent37',
        'chapters': len(rubric_chapters),
        'rubrics_total': total_rub,
        'remedies_total': len(remedies),
        'remedies_with_full_materia_medica': full,
        'remedies_basic_entry_only': len(remedies) - full,
        'grade_entries': total_cells,
        'scope_note_bn': ('কেন্টের ৩৭টি অধ্যায় পূর্ণ ক্রমে — {r}টি রুব্রিক ও {c}টি গ্রেড এন্ট্রি। '
                          'সম্পূর্ণ কেন্টে ৬০ হাজারের বেশি রুব্রিক আছে; এখানে বহুল ব্যবহৃত রুব্রিকগুলোই রাখা হয়েছে। '
                          'রুব্রিক–ওষুধ সম্পর্ক ও গ্রেড ধ্রুপদী রিপার্টরি অনুযায়ী, কোনো প্লেসহোল্ডার নাম নেই।').format(r=BN(total_rub), c=BN(total_cells)),
        'materia_medica_note_bn': ('{f}টি ওষুধের পূর্ণ বাংলা মেটেরিয়া মেডিকা আছে। বাকি {b}টির শুধু নাম, বাংলা নাম, '
                                   'বর্গ ও (জানা থাকলে) তাপীয় প্রকৃতি দেওয়া — বানানো লক্ষণ যোগ করা হয়নি।').format(f=BN(full), b=BN(len(remedies) - full)),
        'languages': ['বাংলা', 'English'],
        'disclaimer': 'এটি শুধুমাত্র শিক্ষামূলক রেফারেন্স। প্রকৃত চিকিৎসার জন্য যোগ্য হোমিওপ্যাথিক চিকিৎসকের পরামর্শ নিন।',
    },
    'remedies': remedies,
    'repertory_rubrics': rubric_chapters,
    'search_index': search,
}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print('chapters       :', len(rubric_chapters))
print('rubrics        :', total_rub)
print('grade entries  :', total_cells, '| grades:', dict(sorted(grade_hist.items())))
print('remedies       :', len(remedies), f'(full MM {full}, basic {len(remedies)-full})')
print('used in rubrics:', len(used))
print('rubric sizes   :', dict(sorted(size_hist.items())))
print('grade patterns :', len(pattern_set), '(must be > 1)')
print('avg per rubric :', round(total_cells / total_rub, 1))
print('file           :', round(os.path.getsize(OUT) / 1024), 'KB')
