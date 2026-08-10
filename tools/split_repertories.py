# -*- coding: utf-8 -*-
"""Split the shared remedy table out of the per-book repertory files.

    python3 tools/split_repertories.py [--dry-run]

Before: every repertory file carried its own full copy of `remedies`,
`bn_glossary` and `search_index` — byte-identical across all three books,
1.28 MB apiece, 2.55 MB of pure duplication. Worse than the bytes was the
*coupling*: adding a drug picture meant rewriting three files in lockstep, and
missing one silently desynchronised the roster (which is exactly what happened
when boenninghausen_repertory.json was left out of apply_materia.py's list).

After:
    remedies.json                     shared roster + glossary + search index
    kent_rubrics.json                 metadata + rubrics only
    boericke_rubrics.json
    boenninghausen_rubrics.json

The rubrics already address remedies by integer index into the roster array, so
nothing about the compact-v6 payload changes — only which file the array lives
in. Index order is therefore load-bearing and is preserved exactly as-is.

Idempotent: re-running when the old combined files are gone is a no-op.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, '..', 'assets', 'data', 'repatories')
DRY = '--dry-run' in sys.argv

# old combined file -> new rubrics-only file
BOOKS = [
    ('kent_remidies.json', 'kent_rubrics.json', 'kent'),
    ('boericke_repertory.json', 'boericke_rubrics.json', 'boericke'),
    ('boenninghausen_repertory.json', 'boenninghausen_rubrics.json', 'boenninghausen'),
]
SHARED_KEYS = ['remedies', 'bn_glossary', 'search_index']
SHARED_FILE = 'remedies.json'

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))


def mb(path):
    return round(os.path.getsize(path) / 1048576, 2)


present = [(old, new, bid) for old, new, bid in BOOKS if os.path.exists(os.path.join(DIR, old))]
if not present:
    print('nothing to do — combined files already split')
    sys.exit(0)

# ---- the shared payload must be identical everywhere, or the split would pick
# ---- a winner and silently discard the others' differences
shared = None
source_of_truth = None
for old, _new, _bid in present:
    d = json.load(open(os.path.join(DIR, old), encoding='utf-8'))
    mine = {k: d.get(k) for k in SHARED_KEYS}
    if shared is None:
        shared, source_of_truth = mine, old
    elif json.dumps(mine, ensure_ascii=False, sort_keys=True) != \
            json.dumps(shared, ensure_ascii=False, sort_keys=True):
        for k in SHARED_KEYS:
            if json.dumps(mine.get(k), ensure_ascii=False, sort_keys=True) != \
                    json.dumps(shared.get(k), ensure_ascii=False, sort_keys=True):
                print(f'ABORT: "{k}" differs between {source_of_truth} and {old}.')
                print('       Run tools/apply_materia.py first so all books agree, '
                      'then re-run this split.')
        sys.exit(1)

remedies = shared['remedies']
full_mm = sum(1 for r in remedies if r.get('content_status') == 'full')

shared_doc = {
    'metadata': {
        'title': 'যৌথ ওষুধ-তালিকা ও বাংলা মেটেরিয়া মেডিকা',
        'title_en': 'Shared remedy roster + Bangla materia medica',
        'version': '1.0-shared',
        'note_bn': ('সব রিপার্টরি এই একটি তালিকা ব্যবহার করে — রুব্রিকের "r" ক্ষেত্রের সংখ্যা '
                    'এই remedies অ্যারের ক্রমিক অবস্থান। তাই ক্রম বদলালে সব রিপার্টরি ভেঙে যাবে।'),
        'remedies_total': len(remedies),
        'remedies_with_full_materia_medica': full_mm,
        'remedies_basic_entry_only': len(remedies) - full_mm,
        'used_by': [bid for _o, _n, bid in BOOKS],
    },
    'remedies': remedies,
    'bn_glossary': shared['bn_glossary'],
    'search_index': shared['search_index'],
}

before = sum(os.path.getsize(os.path.join(DIR, o)) for o, _n, _b in present)
plan = []
for old, new, bid in present:
    d = json.load(open(os.path.join(DIR, old), encoding='utf-8'))
    md = d.get('metadata', {})
    # the roster counts belong to the shared file now; leave the book-specific
    # ones (its own rubric/entry totals, its own MM coverage of its citations)
    md['remedies_file'] = SHARED_FILE
    doc = {'metadata': md, 'repertory_rubrics': d['repertory_rubrics']}
    plan.append((old, new, doc, len(d['repertory_rubrics'])))

if DRY:
    print(f'shared  {SHARED_FILE:<32} {len(remedies)} remedies, '
          f'{len(shared["bn_glossary"])} glossary terms, {len(shared["search_index"])} search rows')
    for old, new, doc, nch in plan:
        print(f'  {old:<32} -> {new:<30} ({nch} chapters, drops the shared 1.28 MB)')
    print('dry run — nothing written')
    sys.exit(0)

with open(os.path.join(DIR, SHARED_FILE), 'w', encoding='utf-8') as f:
    json.dump(shared_doc, f, ensure_ascii=False, separators=(',', ':'))
for old, new, doc, _nch in plan:
    with open(os.path.join(DIR, new), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    os.remove(os.path.join(DIR, old))

after = os.path.getsize(os.path.join(DIR, SHARED_FILE)) + \
    sum(os.path.getsize(os.path.join(DIR, n)) for _o, n, _d, _c in plan)

print(f'{SHARED_FILE:<32} {mb(os.path.join(DIR, SHARED_FILE)):>6} MB  '
      f'({len(remedies)} remedies, {full_mm} with Bangla MM)')
for _old, new, _doc, _c in plan:
    print(f'{new:<32} {mb(os.path.join(DIR, new)):>6} MB')
print(f'\ntotal {before/1048576:.2f} MB -> {after/1048576:.2f} MB '
      f'(saved {(before-after)/1048576:.2f} MB of duplication)')
print('remember: index.json must point at the *_rubrics.json files')
