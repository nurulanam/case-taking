# -*- coding: utf-8 -*-
"""Build assets/data/anatomy.json — the body map's region -> Kent chapter table.

The counts are read out of the built repertory rather than typed in, so the
figure can never advertise 6,527 head rubrics after the parser starts finding
6,530. Run this after tools/build.py.

Design note on what is clickable: Kent's chapters are symptom *regions*, not
3D anatomy. 32 of the 38 sit somewhere on a body; the remaining 6 (Mind,
Sleep, Chill, Fever, Perspiration, Generalities) have no location at all and
are surfaced as their own list instead of being hidden or, worse, pinned to
some arbitrary body part.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KENT = os.path.join(ROOT, 'assets', 'data', 'repatories', 'kent_rubrics.json')
OUT = os.path.join(ROOT, 'assets', 'data', 'anatomy.json')

# region id -> (Bangla label, view, Kent chapter numbers in display order)
# The first chapter listed is the region's primary one; the rest are the
# chapters a practitioner reaches for when thinking about that region
# (cough under chest, stool under rectum, urine under the urinary tract).
REGIONS = [
    ('head',      'মাথা',            'front', [3, 2]),
    ('eye',       'চোখ',             'front', [4, 5]),
    ('ear',       'কান',             'front', [6, 7]),
    ('nose',      'নাক',             'front', [8]),
    ('face',      'মুখমণ্ডল',        'front', [9]),
    ('mouth',     'মুখগহ্বর ও দাঁত', 'front', [10, 11]),
    ('throat',    'গলা',             'front', [12, 13, 26]),
    ('chest',     'বুক ও শ্বাস',     'front', [30, 27, 28, 29]),
    ('stomach',   'পাকস্থলী',        'front', [14]),
    ('abdomen',   'উদর',             'front', [15]),
    ('urinary',   'মূত্রতন্ত্র',      'front', [19, 20, 22, 23, 18, 21]),
    ('genitals',  'জননাঙ্গ',         'front', [24, 25]),
    ('arm',       'বাহু',            'front', [32]),
    ('hand',      'হাত ও আঙুল',      'front', [32]),
    ('leg',       'পা',              'front', [32]),
    ('foot',      'পায়ের পাতা',      'front', [32]),
    ('backhead',  'মাথার পিছন',      'back',  [3]),
    ('nape',      'ঘাড় ও বাইরের গলা', 'back',  [13]),
    ('back',      'পিঠ',             'back',  [31]),
    ('rectum',    'মলদ্বার',         'back',  [16, 17]),
    ('backarm',   'বাহু',            'back',  [32]),
    ('backhand',  'হাত ও আঙুল',      'back',  [32]),
    ('backleg',   'পা',              'back',  [32]),
    ('backfoot',  'পায়ের পাতা',      'back',  [32]),
]

# no location on any figure — listed separately, never pinned to a body part
NONLOCAL = [1, 33, 34, 35, 36, 38]

# whole-body, so not a clickable shape
WHOLEBODY = [37]


def main():
    if not os.path.exists(KENT):
        sys.exit(f'missing {KENT} — run tools/build.py first')
    kent = json.load(open(KENT, encoding='utf-8'))
    ch = {c['number']: c for c in kent['repertory_rubrics']}

    def chap(n):
        c = ch[n]
        return {'num': n, 'en': c['name_en'], 'bn': c['name_bn'],
                'rubrics': len(c['rubrics'])}

    used = set()
    regions = []
    for rid, label, view, nums in REGIONS:
        used.update(nums)
        chapters = [chap(n) for n in nums]
        regions.append({
            'id': rid, 'label': label, 'view': view,
            'chapters': chapters,
            'rubrics': sum(c['rubrics'] for c in chapters),
        })

    out = {
        'metadata': {
            'title': 'শরীর-চিত্রে রুব্রিক',
            'note_bn': 'শরীরের অংশে চাপ দিলে কেন্ট রিপার্টরির সেই অধ্যায় খুলবে। '
                       'রুব্রিক সংখ্যা সরাসরি রিপার্টরি থেকে গোনা।',
            'source_bn': 'কেন্ট রিপার্টরী — ৩৮টি অধ্যায়',
            'book': 'kent',
            'chapters_total': len(ch),
            'chapters_mapped': len(used | set(WHOLEBODY)),
            'rubrics_total': sum(len(c['rubrics']) for c in ch.values()),
        },
        'regions': regions,
        'wholebody': [chap(n) for n in WHOLEBODY],
        'nonlocal': [chap(n) for n in NONLOCAL],
    }

    missing = set(ch) - used - set(NONLOCAL) - set(WHOLEBODY)
    extra = (used | set(NONLOCAL) | set(WHOLEBODY)) - set(ch)
    if missing or extra:
        sys.exit(f'chapter coverage broken — unmapped {sorted(missing)}, unknown {sorted(extra)}')

    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False,
              separators=(',', ':'))
    kb = os.path.getsize(OUT) / 1024
    print(f'regions        : {len(regions)} ({sum(1 for r in regions if r["view"]=="front")} front, '
          f'{sum(1 for r in regions if r["view"]=="back")} back)')
    print(f'chapters mapped: {len(used)} on the figure + {len(WHOLEBODY)} whole-body '
          f'+ {len(NONLOCAL)} non-local = {len(ch)}')
    # sum over distinct chapters — arm and leg both point at Extremities, and
    # head appears on both views, so summing regions would count them twice
    reach = sum(len(ch[n]['rubrics']) for n in used)
    print(f'rubrics reached: {reach:,} via regions '
          f'({out["metadata"]["rubrics_total"]:,} in the book)')
    print(f'written        : {OUT} ({kb:.1f} KB)')


if __name__ == '__main__':
    main()
