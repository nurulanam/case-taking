# -*- coding: utf-8 -*-
"""Build assets/data/repatories/boericke_repertory.json from the Médi-T HTML.

    python3 tools/build_boericke.py <path-to-boerirep-mirror>

The remedy table is *copied from the Kent build* rather than rebuilt, so both
books address remedies by the same index. That is what lets a Boericke
repertorisation open the same Bangla materia medica in step 4 — and it means the
Bangla remedy names, families and drug pictures are maintained in exactly one
place. Run tools/build.py first.
"""
import json, sys, os, re, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boericke_html import parse_all, CHAPTERS, CHAPTER_ICON
from boericke_map import ALIAS, AMBIGUOUS
from kent_bn import bn_rubric, bn_coverage

KENT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'kent_remidies.json')
OUT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'boericke_repertory.json')
MIRROR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache', 'boerirep')

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))


def fold(s):
    s = s.replace('æ', 'ae').replace('Æ', 'Ae').replace('œ', 'oe').replace('Œ', 'Oe')
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))


def norm_abbrev(t):
    t = fold(t).lower().replace('.', '').strip()
    return re.sub(r'\s+', '-', t)


# ---------------------------------------------------------------- remedy table
kent = json.load(open(KENT, encoding='utf-8'))
remedies = kent['remedies']
by_id = {r['id']: i for i, r in enumerate(remedies)}

# Latin names split into words, for prefix matching
NAME_WORDS = [(r['id'], fold(r['name']).lower().split()) for r in remedies]


def by_name_prefix(parts):
    """Remedies whose Latin name words all start with the token's parts.

    Boericke truncates at a different length than Kent's key — 'Lyssin.' for
    Lyssinum, 'Chionanth.' for Chionanthus, 'Nat. ars.' for Natrum Arsenicatum —
    so the bridge has to be a prefix test on the name rather than an exact match
    on the abbreviation. Only a *unique* hit is accepted; two candidates means
    the truncation is genuinely ambiguous and the token is dropped.
    """
    hits = []
    for rid, words in NAME_WORDS:
        if len(words) < len(parts):
            continue
        if all(words[i].startswith(p) for i, p in enumerate(parts)):
            hits.append(rid)
    return hits


def resolve(tok):
    """Boericke token -> remedy id, or None when it cannot be pinned down."""
    n = norm_abbrev(tok)
    if n in AMBIGUOUS:
        return None
    if n in ALIAS:
        return ALIAS[n]
    if n in by_id:
        return n
    hits = by_name_prefix(n.split('-'))
    if len(hits) == 1:
        return hits[0]
    return None


# ---------------------------------------------------------------- parse
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

for stem, en, bn_name in CHAPTERS:
    # gather by (name, level) so a rubric continued across a file boundary or
    # repeated in the source collapses into one row with the higher grade kept
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
            'level': level,
            'r': ','.join(f'{i}:{g}' if g > 1 else str(i) for i, g in pairs),
        })
        total_rub += 1
        total_cells += len(pairs)
        for _i, g in pairs:
            grade_hist[g] += 1

    chapters_out.append({
        'number': len(chapters_out) + 1,
        'chapter': f'{en} - {bn_name}',
        'name_en': en,
        'name_bn': bn_name,
        'icon': CHAPTER_ICON.get(stem, ''),
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
        'title': 'বোরিক রিপার্টরী — বাংলা সংস্করণ',
        'title_en': "Boericke's Repertory — Oscar E. Boericke, M.D.",
        'version': '1.0-boericke',
        'format': 'compact-v6',
        'chapters': len(chapters_out),
        'rubrics_total': total_rub,
        'remedies_total': len(remedies),
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
        'dropped_note_bn': ('{d}টি ওষুধ-উল্লেখ বাদ পড়েছে ({p}%) — হয় সংক্ষেপটি দুটি ওষুধ বোঝাতে পারে '
                            '(যেমন Sab. = Sabina না Sabadilla), নয়তো ওষুধটি আমাদের যৌথ ওষুধ-তালিকায় নেই '
                            '(যেমন Glycerin, Alfalfa, Menthol)। অনুমান করে ভুল ওষুধে লক্ষণ বসানোর চেয়ে '
                            'বাদ দেওয়া নিরাপদ।'),
        'source': {
            'edition_bn': 'বোরিক রিপার্টরী — মেডি-টি (Médi-T) এইচটিএমএল সংস্করণ, Homéopathe International',
            'url': 'http://homeoint.org/books4/boerirep/index.htm',
            'original_bn': 'মূল গ্রন্থ: Oscar E. Boericke, Repertory — William Boericke-র Pocket Manual-এর সহযোগী খণ্ড।',
            'typography_bn': ('বোরিকে দুটি গ্রেড: ইটালিক = গ্রেড ২ (বেশি গুরুত্বপূর্ণ), সাধারণ = গ্রেড ১। '
                              'কেন্টের মতো তিন গ্রেড এখানে নেই — মূল বইতেই নেই।'),
        },
        'scope_note_bn': ('বোরিক রিপার্টরী — {c}টি অধ্যায় (দেহতন্ত্র অনুযায়ী সাজানো), {r}টি রুব্রিক ও '
                          '{e}টি গ্রেড এন্ট্রি। কেন্টের চেয়ে ছোট ও বেশি ক্লিনিক্যাল বই; রোগ ও '
                          'অঙ্গতন্ত্র ধরে খোঁজার জন্য সুবিধাজনক।').format(
                              c=BN(len(chapters_out)), r=BN(total_rub), e=BN(total_cells)),
        'grade_note_bn': 'এই বইতে মাত্র দুটি গ্রেড (১–২) — তাই কেন্টের সাথে সরাসরি স্কোর তুলনা করবেন না।',
        'remedy_note_bn': ('ওষুধের তালিকা ও বাংলা মেটেরিয়া মেডিকা কেন্ট ফাইলের সাথে একই — তাই '
                          'বোরিক থেকে পাওয়া ওষুধেও ধাপ ৪-এ একই বিবরণ পাওয়া যায়।'),
        'languages': ['বাংলা', 'English'],
        'disclaimer': 'এটি শুধুমাত্র শিক্ষামূলক রেফারেন্স। প্রকৃত চিকিৎসার জন্য যোগ্য হোমিওপ্যাথিক চিকিৎসকের পরামর্শ নিন।',
    },
    'remedies': remedies,
    'bn_glossary': kent.get('bn_glossary', {}),
    'repertory_rubrics': chapters_out,
    'search_index': kent.get('search_index', []),
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
