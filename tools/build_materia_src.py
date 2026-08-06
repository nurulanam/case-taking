# -*- coding: utf-8 -*-
"""Build the materia medica source layers under assets/data/materia/.

    python3 tools/build_materia_src.py <boericmm-mirror> [<clarke-mirror>]

Two books, **in the original English**, not translations:

    boericke  William Boericke, Pocket Manual, 9th ed.  ~690 remedies, concise
    clarke    J. H. Clarke, Dictionary of Practical MM  ~1000 remedies, deep

Our hand-written Bangla materia medica covers 290 remedies. These cover most of
the rest, so a remedy that has no Bangla picture still has a real, citable one.
They are shown *alongside* the Bangla, under an explicit English heading, and are
deliberately not machine-translated: a mistranslated clinical symptom cannot be
told apart from a real one, and prescribing on it does harm.

Output layout — sharded by the first character of the key, because Clarke alone
is ~9 MB and the page only ever needs the remedy in front of it:

    materia/index.json          which sources exist, which keys each holds
    materia/boericke/a.json     { "acon": {...}, "ars": {...}, … }
    materia/clarke/a.json

Keys are our remedy ids where one matches; a source-only remedy keeps its own
abbreviation behind '~' so nothing is silently dropped.
"""
import json, sys, os, re, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import boericke_mm
import clarke_mm
from materia_map import FORCE_ID, shard_of   # side-effect-free, shared with fix_materia_keys.py

KENT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'kent_remidies.json')
OUTDIR = os.path.join(HERE, '..', 'assets', 'data', 'materia')

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))


def fold(s):
    s = s.replace('æ', 'ae').replace('Æ', 'Ae').replace('œ', 'oe').replace('Œ', 'Oe')
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))


kent = json.load(open(KENT, encoding='utf-8'))
remedies = kent['remedies']
ids = {r['id'] for r in remedies}
NAME_WORDS = [(r['id'], fold(r['name']).lower().split()) for r in remedies]
EXACT_NAME = {}
for _rid, _w in NAME_WORDS:
    EXACT_NAME.setdefault(' '.join(_w), _rid)


def match_id(abbr, name):
    """Source page -> our remedy id, or None.

    Each site abbreviates in its own dialect — Boericke's transcription uses the
    modern style ('arg-met'), Clarke uses underscores ('acet_ac', 'a_camm'),
    Kent's key uses older short forms ('arg-m') — but all three print the same
    Latin name, so the name is the reliable join. No candidate at all means the
    remedy is simply absent from our 1897-era roster.
    """
    raw = fold(abbr).lower().strip()
    if raw in FORCE_ID:
        return FORCE_ID[raw]
    a = raw.replace('_', '-')
    if a in ids:
        return a
    words = [w.strip('(),.') for w in fold(name).lower().replace('--', ' ').split()
             if w.strip('(),.')]
    if not words:
        return None
    hit = EXACT_NAME.get(' '.join(words))
    if hit:
        return hit
    hits = [rid for rid, w in NAME_WORDS
            if w and w[0] == words[0] and (len(words) < 2 or len(w) < 2 or w[1].startswith(words[1]))]
    return hits[0] if len(hits) == 1 else None


def collect(recs, label):
    """-> (entries, stats) keyed by remedy id or '~abbr'."""
    entries = {}
    matched = unmatched = dupes = 0
    for r in recs:
        rid = match_id(r['abbr'], r['name'])
        key = rid or ('~' + r['abbr'])
        if rid:
            matched += 1
        else:
            unmatched += 1
        if key in entries:
            dupes += 1
            continue
        e = {'name': r['name']}
        for f in ('common', 'provenance', 'lead'):
            if r.get(f):
                e[f] = r[f]
        if r.get('sections'):
            e['sections'] = r['sections']
        entries[key] = e
    covered = sum(1 for r in remedies if r['id'] in entries)
    only = sum(1 for r in remedies
               if r['id'] in entries and r['content_status'] != 'full')
    print(f'{label:<9} parsed {len(recs)} | matched {matched} | not in roster {unmatched} '
          f'| dupes {dupes} | roster covered {covered} (of those {only} have no Bangla)')
    return entries, {'entries': len(entries), 'matched': matched,
                     'not_in_roster': unmatched, 'roster_covered': covered,
                     'source_only': only}


def write_shards(name, entries):
    d = os.path.join(OUTDIR, name)
    os.makedirs(d, exist_ok=True)
    shards = collections.defaultdict(dict)
    for k, v in entries.items():
        shards[shard_of(k)][k] = v
    total = 0
    for letter, block in shards.items():
        p = os.path.join(d, letter + '.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(block, f, ensure_ascii=False, separators=(',', ':'))
        total += os.path.getsize(p)
    biggest = max(shards.items(), key=lambda kv: len(json.dumps(kv[1])))
    print(f'  {name}: {len(shards)} shards, {round(total/1024/1024, 2)} MB total, '
          f'biggest "{biggest[0]}" {len(biggest[1])} entries')
    return sorted(shards), round(total / 1024 / 1024, 2)


# ---------------------------------------------------------------- run
os.makedirs(OUTDIR, exist_ok=True)
sources = {}

bo_mirror = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache', 'boericmm')
print('reading boericke', bo_mirror)
bo_entries, bo_stats = collect(boericke_mm.parse_all(bo_mirror, verbose=False), 'boericke')
bo_shards, bo_mb = write_shards('boericke', bo_entries)
sources['boericke'] = dict(bo_stats, shards=bo_shards, size_mb=bo_mb,
    title_bn='বোরিক মেটেরিয়া মেডিকা', title_en="Boericke's Pocket Manual of Homoeopathic Materia Medica",
    author='William Boericke, M.D.', edition='9th edition',
    url='http://homeoint.org/books/boericmm/index.htm',
    note_bn='সংক্ষিপ্ত ও ব্যবহারিক — দ্রুত মিলিয়ে দেখার জন্য।',
    emphasis_bn='বোরিকে চারিত্রিক লক্ষণ ইটালিকে ছাপেন — সেই জোর অক্ষত রাখা হয়েছে।')

if len(sys.argv) > 2:
    cl_mirror = sys.argv[2]
    print('reading clarke', cl_mirror)
    cl_entries, cl_stats = collect(clarke_mm.parse_all(cl_mirror, verbose=False), 'clarke')
    cl_shards, cl_mb = write_shards('clarke', cl_entries)
    sources['clarke'] = dict(cl_stats, shards=cl_shards, size_mb=cl_mb,
        title_bn='ক্লার্ক — ব্যবহারিক মেটেরিয়া মেডিকা অভিধান',
        title_en="A Dictionary of Practical Materia Medica",
        author='John Henry Clarke, M.D.', edition='1900–1902, 3 vols',
        url='http://homeoint.org/clarke/index.htm',
        note_bn=('তিনটি বইয়ের মধ্যে সবচেয়ে বিস্তারিত — Clinical, Characteristics, Relations, '
                 'Causation, তারপর ক্লার্কের নম্বরযুক্ত পূর্ণ লক্ষণ-তালিকা।'),
        emphasis_bn='ক্লার্ক গুরুত্বপূর্ণ ক্লিনিক্যাল পদ ইটালিকে ছাপেন — সেই জোর রাখা হয়েছে।')

both = sum(1 for r in remedies
           if r['content_status'] != 'full'
           and (r['id'] in bo_entries or (len(sys.argv) > 2 and r['id'] in cl_entries)))
neither = sum(1 for r in remedies
              if r['content_status'] != 'full'
              and r['id'] not in bo_entries
              and not (len(sys.argv) > 2 and r['id'] in cl_entries))

index = {
    'metadata': {
        'title': 'মেটেরিয়া মেডিকার মূল ইংরেজি উৎস',
        'version': '2.0-sources',
        'roster_total': len(remedies),
        'roster_with_bangla': sum(1 for r in remedies if r['content_status'] == 'full'),
        'no_bangla_but_sourced': both,
        'no_bangla_no_source': neither,
        'shard_note': 'materia/<source>/<first letter of remedy id>.json',
        'why_not_translated_bn': ('এই দুটি বই **মূল ইংরেজিতেই** রাখা হয়েছে, অনুবাদ করা হয়নি। '
                                  'যন্ত্র-অনুবাদে ভুল হওয়া একটি লক্ষণ আসল লক্ষণ থেকে আলাদা করা '
                                  'যায় না, আর তার উপর প্রেসক্রিপশন হলে ক্ষতি হয়। তাই বাংলা '
                                  'যেখানে হাতে লেখা হয়েছে সেখানে বাংলা, বাকিটা মূল ইংরেজি — '
                                  'স্পষ্ট চিহ্ন দিয়ে।'),
        'transcription': 'Médi-T / Homéopathe International',
    },
    'sources': sources,
}
with open(os.path.join(OUTDIR, 'index.json'), 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, indent=1)

print()
print('roster with Bangla MM      :', index['metadata']['roster_with_bangla'], '/', len(remedies))
print('no Bangla but has a source :', both)
print('no Bangla, no source       :', neither)
