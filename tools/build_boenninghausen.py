# -*- coding: utf-8 -*-
"""Build assets/data/repatories/boenninghausen_rubrics.json.

    python3 tools/build_boenninghausen.py <path-to-boenchar-mirror>

Bönninghausen's *Characteristics Repertory* (C. M. Boger's compilation) — his
own "characteristic" method: generals, modalities and concomitants rather than
Kent's anatomical schema. Rubrics only — remedies are addressed by integer
index into the shared roster (remedies.json), so a result here opens the same
Bangla materia medica in step 4. The roster is not rewritten here.
"""
import json, sys, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boen_html import parse_all, CHAPTERS, build_resolver
from boen_bn import CHAPTER_BN, bn_rubric
from kent_bn import bn_coverage

ROSTER = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'remedies.json')
OUT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'boenninghausen_rubrics.json')
MIRROR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache', 'boenchar')

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))

roster = json.load(open(ROSTER, encoding='utf-8'))
remedies = roster['remedies']
by_id = {r['id']: i for i, r in enumerate(remedies)}
resolve = build_resolver(by_id.keys())

print('reading', MIRROR)
rubs = parse_all(MIRROR)

unresolved = collections.Counter()
by_chapter = collections.defaultdict(list)
for r in rubs:
    by_chapter[r.chapter].append(r)

chapters_out = []
total_rub = total_cells = 0
grade_hist = collections.Counter()
dropped = 0
bn_full = bn_part = 0
merged = 0

for chapter_no, (en, _files) in enumerate(CHAPTERS, start=1):
    bn_name = CHAPTER_BN[en]
    # collapse a rubric repeated at the same (name, level) — grades merge by max,
    # same rule Boericke's build uses for a rubric split across file boundaries
    order, acc = [], {}
    for r in by_chapter.get(en, []):
        pairs = []
        for tok, g in r.remedies:
            rid = resolve(tok)
            if rid is None:
                unresolved[tok] += 1
                dropped += 1
                continue
            pairs.append((by_id[rid], g))
        if not pairs:
            continue
        key = (r.name, r.level)
        if key not in acc:
            acc[key] = {}
            order.append(key)
        slot = acc[key]
        before = dict(slot)
        for idx, g in pairs:
            if g > slot.get(idx, 0):
                slot[idx] = g
        if slot == before and before:
            merged += 1

    rows = []
    for key in order:
        pairs = sorted(acc[key].items(), key=lambda kv: (-kv[1], remedies[kv[0]]['name']))
        name, level = key
        bnm, full = bn_rubric(name)
        if full:
            bn_full += 1
        elif bnm != name:
            bn_part += 1
        rows.append({
            'name': name,
            'bangla': bnm if bnm != name else '',
            'level': level,
            'r': ','.join(f'{i}:{g}' if g > 1 else str(i) for i, g in pairs),
        })
        total_rub += 1
        total_cells += len(pairs)
        for _i, g in pairs:
            grade_hist[g] += 1

    chapters_out.append({
        'number': chapter_no,
        'chapter': f'{en} - {bn_name}',
        'name_en': en,
        'name_bn': bn_name,
        'rubrics': rows,
    })

seg_total, seg_known = bn_coverage(rubs)
used = {i for c in chapters_out for row in c['rubrics']
        for i in (int(t.split(':')[0]) for t in row['r'].split(',') if t)}
mm_cells = 0
for c in chapters_out:
    for row in c['rubrics']:
        for t in row['r'].split(','):
            if t and remedies[int(t.split(':')[0])]['content_status'] == 'full':
                mm_cells += 1

db = {
    'metadata': {
        'title': 'ব্যোনিংহাউজেন রিপার্টরী — বাংলা সংস্করণ',
        'title_en': "Bönninghausen's Characteristics Repertory — C. M. Boger, M.D.",
        'version': '1.0-boenninghausen',
        'format': 'compact-v6',
        'remedies_file': 'remedies.json',
        'chapters': len(chapters_out),
        'rubrics_total': total_rub,
        'remedies_in_book': len(used),
        'rubrics_bangla_full': bn_full,
        'rubrics_bangla_partial': bn_part,
        'rubrics_bangla_none': total_rub - bn_full - bn_part,
        'bangla_segment_coverage_pct': round(100 * seg_known / max(1, seg_total)),
        'grade_entries': total_cells,
        'grade_breakdown': {str(k): v for k, v in sorted(grade_hist.items())},
        'max_level': max((row['level'] for c in chapters_out for row in c['rubrics']), default=0),
        'materia_medica_coverage_pct': round(100 * mm_cells / max(1, total_cells)),
        'dropped_tokens': dropped,
        'dropped_note_bn': ('{d}টি ওষুধ-উল্লেখ বাদ পড়েছে ({p}%) — এই বইয়ে উল্লিখিত কিছু ওষুধ আমাদের '
                            'যৌথ ওষুধ-তালিকায় নেই (যেমন Oldenlandia Herbacea, Sulfonal)। অনুমান করে '
                            'ভুল ওষুধে লক্ষণ বসানোর চেয়ে বাদ দেওয়া নিরাপদ।'),
        'source': {
            'edition_bn': 'ব্যোনিংহাউজেন ক্যারেক্টারিস্টিকস রিপার্টরী — মেডি-টি (Médi-T) এইচটিএমএল সংস্করণ, Homéopathe International',
            'url': 'http://homeoint.org/books2/boenchar/index.htm',
            'original_bn': ('মূল গ্রন্থ: Dr. Clemens von Bönninghausen-এর "characteristic" পদ্ধতি, '
                            'C. M. Boger কর্তৃক সংকলিত ও ইংরেজিতে অনূদিত।'),
            'typography_bn': ('চার গ্রেড: সাধারণ (টিল রঙ) = গ্রেড ১, ইটালিক (নীল) = গ্রেড ২, '
                              'বোল্ড (লাল) = গ্রেড ৩, বোল্ড+আন্ডারলাইন বড় হাতের অক্ষর (নেভি) = গ্রেড ৪ — '
                              'ব্যোনিংহাউজেনের নিজস্ব সর্বোচ্চ গ্রেড।'),
        },
        'scope_note_bn': ('ব্যোনিংহাউজেনের নিজস্ব "characteristic" পদ্ধতি — কেন্টের অঙ্গ-ভিত্তিক রুব্রিকের '
                          'বদলে সাধারণ লক্ষণ, মোডালিটি ও সহলক্ষণের উপর জোর দেয়। {c}টি অধ্যায়, '
                          '{r}টি রুব্রিক ও {e}টি গ্রেড এন্ট্রি।').format(
                              c=BN(len(chapters_out)), r=BN(total_rub), e=BN(total_cells)),
        'grade_note_bn': 'এই বইয়ের চার-গ্রেড স্কেল কেন্ট বা বোরিকের গ্রেডের সাথে সরাসরি তুলনীয় নয়।',
        'remedy_note_bn': ('ওষুধের তালিকা ও বাংলা মেটেরিয়া মেডিকা কেন্ট ফাইলের সাথে একই — তাই '
                          'এখান থেকে পাওয়া ওষুধেও ধাপ ৪-এ একই বিবরণ পাওয়া যায়।'),
        'languages': ['বাংলা', 'English'],
        'disclaimer': 'এটি শুধুমাত্র শিক্ষামূলক রেফারেন্স। প্রকৃত চিকিৎসার জন্য যোগ্য হোমিওপ্যাথিক চিকিৎসকের পরামর্শ নিন।',
    },
    'repertory_rubrics': chapters_out,
}

db['metadata']['dropped_note_bn'] = db['metadata']['dropped_note_bn'].format(
    d=BN(dropped), p=BN(round(100 * dropped / max(1, dropped + total_cells), 1)))

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, separators=(',', ':'))

print('chapters        :', len(chapters_out))
print('rubrics         :', total_rub, f'(max level {db["metadata"]["max_level"]})')
print('grade entries   :', total_cells, '| grades:', dict(sorted(grade_hist.items())))
print('remedies in book:', len(used), 'of', len(remedies))
print('MM covers       :', db['metadata']['materia_medica_coverage_pct'], '% of grade entries')
print('dropped tokens  :', dropped, f'({dropped / max(1, dropped + total_cells):.1%})',
      '| distinct', len(unresolved))
print('  top unresolved:', unresolved.most_common(15))
print('rubric bangla   :', f'full {bn_full}, partial {bn_part}')
print('segment coverage:', f'{seg_known}/{seg_total} = {seg_known / max(1, seg_total):.1%}')
print('collapsed dupes :', merged)
print('file            :', round(os.path.getsize(OUT) / 1024 / 1024, 2), 'MB')
