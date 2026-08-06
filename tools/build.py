# -*- coding: utf-8 -*-
"""Rebuild assets/data/repatories/kent_remidies.json — the complete Kent repertory.

    python3 tools/build.py [path-to-kentrep-mirror]

Sources
    kent_html.py     the whole book, parsed from the Médi-T HTML edition, which
                     preserves Kent's typography (bold = grade 3, italic = 2)
                     and his <dir> sub-rubric nesting — so grades and rubric
                     hierarchy are read from the book, not guessed
    r_remedies.py    curated remedy roster : key -> (Latin, Bangla, family, thermal, miasm)
    r_materia.py     curated materia medica — the original polychrest volume
    r_materia2.py    materia medica volume 2, for remedies volume 1 omitted
    r_materia3.py    volume 3 — written from the English source layers
    r_remedies_bn.py Bangla names for the Kent remedies the roster misses
    r_kent1..4.py    the earlier hand-built rubric tables — now used only for
                     their hand-checked *Bangla rubric names*, which override
                     the glossary
    kent_bn.py       Bangla glossary for Kent's rubric vocabulary

Output format (v6) is index-addressed to stay loadable: a rubric's remedies are
one string of 'remedyIndex:grade' pairs, grade omitted when 1. Spelling out
535,000 remedy names and their Bangla twice over, as v5 did, would produce a
file no browser should be asked to parse.
"""
import json, sys, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kent_html import parse_all, build_resolver, CHAPTER_FILES
from r_remedies import R
from r_materia import MM
from r_materia2 import MM2
from r_materia3 import MM3
from r_kent1 import K1
from r_kent2 import K2
from r_kent3 import K3
from r_kent4 import K4
from kent_bn import SEG, CHAPTER_BN, bn_rubric, bn_coverage
from r_remedies_bn import BN as REMEDY_BN

OUT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'kent_remidies.json')
MIRROR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache', 'kentrep')

BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))
THERMAL_BN = {'chilly': 'শীতার্ত', 'hot': 'গরম', 'mixed': 'মিশ্র — গরম ও ঠান্ডা দুটোতেই কষ্ট'}

# Kent's 38 chapters. 'Urinary organs' is a chapter in the book itself; the
# earlier 37-chapter build folded it away, which is why the numbering shifts.
CHAPTER_ICON = {
    1: 'mind', 2: 'vertigo', 3: 'head', 4: 'eye', 5: 'vision', 6: 'ear',
    7: 'hearing', 8: 'nose', 9: 'face', 10: 'mouth', 11: 'teeth', 12: 'throat',
    13: 'neck', 14: 'stomach', 15: 'abdomen', 16: 'rectum', 17: 'stool',
    18: 'kidneys', 19: 'bladder', 20: 'kidneys', 21: 'prostate', 22: 'urethra',
    23: 'urine', 24: 'male', 25: 'female', 26: 'larynx', 27: 'respiration',
    28: 'cough', 29: 'expectoration', 30: 'chest', 31: 'back', 32: 'extremities',
    33: 'sleep', 34: 'chill', 35: 'fever', 36: 'perspiration', 37: 'skin',
    38: 'generalities',
}

# ---------------------------------------------------------------- parse the book
print('reading', MIRROR)
resolve, abbrev = build_resolver(MIRROR)
rubs = parse_all(MIRROR)

# ---------------------------------------------------------------- remedy table
# Kent's own abbreviation key is the roster; our curated roster supplies the
# Bangla name, family, thermal state and materia medica wherever it overlaps.
latin_of = dict(abbrev)                         # folded abbrev -> Latin name
for key in R:                                   # curated names win: modern spelling
    if key in latin_of or key not in abbrev:
        latin_of[key] = R[key][0]

used = collections.Counter()
for r in rubs:
    for tok, g in r.remedies:
        ab = resolve(tok)
        if ab:
            used[ab] += 1

# abbrev -> index, ordered by Latin name so the table is browsable
abbrevs = sorted(set(latin_of), key=lambda a: (latin_of[a].lower(), a))
index_of = {}
remedies = []
for ab in abbrevs:
    latin = latin_of[ab]
    cur = R.get(ab)
    # curated roster first, then the hand-authored transliterations for the
    # remedies Kent lists but our materia medica does not cover
    bangla = (cur[1] if cur else '') or REMEDY_BN.get(latin, '')
    family = cur[2] if cur else ''
    thermal = cur[3] if cur else ''
    miasm = cur[4] if cur else ''
    mm = MM.get(ab) or MM2.get(ab) or MM3.get(ab) or {}
    rec = {
        'id': ab,
        'name': latin,
        'bangla_name': bangla,
        'abbr': ab,
        'family': family,
        'content_status': 'full' if mm else 'basic',
        'in_rubrics': ab in used,
    }
    if not bangla:
        # No curated Bangla name. Transliterating it would invent a spelling no
        # Bengali text uses, so the Latin name stands and the UI falls back to it.
        rec['bangla_pending'] = True
    if thermal:
        rec['thermal'] = THERMAL_BN.get(thermal, thermal)
        rec['thermal_en'] = thermal
    if miasm:
        rec['miasm'] = miasm
    if mm:
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
    index_of[ab] = len(remedies)
    remedies.append(rec)

# ---------------------------------------------------------------- curated Bangla
# The earlier hand-built tables carry checked Bangla rubric names. Keep them as
# exact-match overrides; the glossary handles everything else.
curated_bn = {}
for num, ch, rubrics in (K1 + K2 + K3 + K4):
    chapter_en = ch.split('-')[0].strip()
    for name, (bn, _lst) in rubrics.items():
        if bn:
            curated_bn[(chapter_en.lower(), name.strip().lower())] = bn

# ---------------------------------------------------------------- rubrics
by_chapter = collections.defaultdict(list)
for r in rubs:
    by_chapter[r.chapter_no].append(r)

chapters_out = []
total_rub = total_cells = 0
grade_hist = collections.Counter()
dropped_tokens = 0
bn_from_curated = bn_from_glossary = bn_partial = 0
name_seen = collections.Counter()

merged_rows = overlap_dupes = 0

for num, name_en in sorted(CHAPTER_FILES.values()):
    # Two passes: gather remedies per distinct rubric name, then emit.
    #
    # The same rubric reaches us more than once for two reasons, and both must
    # collapse or the grid would count one remedy twice. Consecutive source
    # files overlap by a page (kent0150.htm runs to p156, kent0155.htm restarts
    # at p155), and Kent continues a long remedy list onto the next page under a
    # reprinted heading — so the second copy is the rest of the same list.
    order = []
    acc = {}
    for r in by_chapter.get(num, []):
        pairs = []
        for tok, g in r.remedies:
            ab = resolve(tok)
            if ab is None:
                dropped_tokens += 1
                continue
            pairs.append((index_of[ab], g))
        if not pairs:
            continue
        key = (r.name, r.level)
        if key not in acc:
            acc[key] = {'grades': {}, 'page': r.page, 'see': list(r.see), 'hits': 0}
            order.append(key)
        slot = acc[key]
        slot['hits'] += 1
        before = dict(slot['grades'])
        for idx, g in pairs:
            if g > slot['grades'].get(idx, 0):
                slot['grades'][idx] = g
        if slot['hits'] > 1:
            if slot['grades'] == before:
                overlap_dupes += 1        # identical copy from the page overlap
            else:
                merged_rows += 1          # continuation of the same remedy list
        for s in r.see:
            if s not in slot['see']:
                slot['see'].append(s)

    rows = []
    for (rname, rlevel) in order:
        slot = acc[(rname, rlevel)]
        pairs = sorted(slot['grades'].items(),
                       key=lambda kv: (-kv[1], remedies[kv[0]]['name']))

        key = (name_en.lower(), rname.strip().lower())
        # Bangla is composed in the page from bn_glossary, so only the
        # hand-checked overrides are stored — writing 66,000 composed strings
        # would add megabytes the page can rebuild for free.
        bn = curated_bn.get(key)
        if bn:
            bn_from_curated += 1
        else:
            _composed, full = bn_rubric(rname)
            if full:
                bn_from_glossary += 1
            elif _composed != rname:
                bn_partial += 1
            bn = None

        row = {
            'name': rname,
            'level': rlevel,
            'page': slot['page'],
            'r': ','.join(f'{i}:{g}' if g > 1 else str(i) for i, g in pairs),
        }
        if bn:
            row['bangla_name'] = bn
        if slot['see']:
            row['see'] = slot['see']
        rows.append(row)
        total_rub += 1
        total_cells += len(pairs)
        name_seen[(num, rname)] += 1
        for _i, g in pairs:
            grade_hist[g] += 1

    chapters_out.append({
        'number': num,
        'chapter': f'{name_en} - {CHAPTER_BN.get(name_en, name_en)}',
        'name_en': name_en,
        'name_bn': CHAPTER_BN.get(name_en, ''),
        'icon': CHAPTER_ICON.get(num, ''),
        'rubrics': rows,
    })

# ---------------------------------------------------------------- search index
search = []
for rec in remedies:
    kws = rec.get('keynotes', [])[:4] + rec.get('clinical_uses', [])[:3]
    if kws:
        search.append({'keywords': ', '.join(kws), 'match_id': rec['id']})

full_mm = sum(1 for r in remedies if r['content_status'] == 'full')
# how much of the repertory a practitioner can actually follow through to a drug
# picture — a more honest figure than the bare remedy count, since the remedies
# without one are mostly the rarely-cited
mm_cells = sum(used[r['id']] for r in remedies if r['content_status'] == 'full')
mm_share = round(100 * mm_cells / max(1, sum(used.values())))
with_bn = sum(1 for r in remedies if r['bangla_name'])
seg_total, seg_known = bn_coverage(rubs)

db = {
    'metadata': {
        'title': 'কেন্ট রিপার্টরী — সম্পূর্ণ বাংলা সংস্করণ',
        'title_en': "Kent's Repertory of the Homoeopathic Materia Medica — complete, 38 chapters",
        'version': '6.0-kent-complete',
        'format': 'compact-v6',
        'format_note_bn': ('প্রতিটি রুব্রিকের "r" ক্ষেত্রে ওষুধগুলো "ইনডেক্স:গ্রেড" আকারে আছে — '
                           'ইনডেক্স হলো remedies তালিকার ক্রমিক অবস্থান, গ্রেড ১ হলে তা বাদ দেওয়া হয়।'),
        'chapters': len(chapters_out),
        'rubrics_total': total_rub,
        'remedies_total': len(remedies),
        'remedies_with_bangla_name': with_bn,
        'remedies_in_book': len(used),
        'rubrics_bangla_full': bn_from_curated + bn_from_glossary,
        'rubrics_bangla_partial': bn_partial,
        'rubrics_bangla_none': total_rub - bn_from_curated - bn_from_glossary - bn_partial,
        'bangla_segment_coverage_pct': round(100 * seg_known / max(1, seg_total)),
        # tokens the parse could not pin to a remedy; without this the health
        # panel cannot tell "none dropped" from "never counted"
        'dropped_tokens': dropped_tokens,
        'remedies_with_full_materia_medica': full_mm,
        'remedies_basic_entry_only': len(remedies) - full_mm,
        'grade_entries': total_cells,
        'grade_breakdown': {str(k): v for k, v in sorted(grade_hist.items())},
        'max_level': max((r['level'] for c in chapters_out for r in c['rubrics']), default=0),
        'source': {
            'edition_bn': 'কেন্টস রিপার্টরি — মেডি-টি (Médi-T) এইচটিএমএল সংস্করণ, Homéopathe International',
            'url': 'http://homeoint.org/books/kentrep/index.htm',
            'original_bn': 'মূল গ্রন্থ: J. T. Kent, Repertory of the Homoeopathic Materia Medica (১৮৯৭) — পাবলিক ডোমেইন।',
            'typography_bn': ('এই সংস্করণে কেন্টের ছাপার ধরন অক্ষত: গাঢ় লাল = গ্রেড ৩, ইটালিক নীল = গ্রেড ২, '
                              'সাধারণ = গ্রেড ১। তাই তিনটি গ্রেডই বই থেকে সরাসরি পড়া হয়েছে, অনুমান করা হয়নি।'),
        },
        'scope_note_bn': ('কেন্টের সম্পূর্ণ রিপার্টরি — ৩৮টি অধ্যায়, {r}টি রুব্রিক (সাব-রুব্রিক সহ, {L} স্তর পর্যন্ত) '
                          'ও {c}টি গ্রেড এন্ট্রি। প্রতিটি রুব্রিক–ওষুধ সম্পর্ক ও গ্রেড মূল বই থেকে নেওয়া; '
                          'কোনো প্লেসহোল্ডার নাম বা বানানো তথ্য নেই।'),
        'bangla_note_bn': ('রুব্রিকের বাংলা নাম কেন্টের পরিভাষা-অভিধান থেকে তৈরি — {kc}টি হাতে যাচাই করা, '
                           'বাকিগুলো অভিধান মিলিয়ে। যে পরিভাষার বাংলা এখনো নেই সেটি ইংরেজিতেই রাখা হয়েছে '
                           '(অংশগুলোর {cov} শতাংশ অনুবাদ হয়েছে) — ভুল অনুবাদের চেয়ে ইংরেজি রাখা নিরাপদ।'),
        'materia_medica_note_bn': ('{f}টি ওষুধের পূর্ণ বাংলা মেটেরিয়া মেডিকা আছে — রিপার্টরিতে যত ওষুধ-উল্লেখ '
                                   'আছে তার {mc} শতাংশ এই ওষুধগুলোর। বাকিগুলোর শুধু নাম ও রিপার্টরি তথ্য; '
                                   'প্রামাণিক মেটেরিয়া মেডিকায় যাদের স্পষ্ট চিত্র নেই তাদের জন্য বানানো লক্ষণ '
                                   'যোগ করা হয়নি।'),
        'languages': ['বাংলা', 'English'],
        'disclaimer': 'এটি শুধুমাত্র শিক্ষামূলক রেফারেন্স। প্রকৃত চিকিৎসার জন্য যোগ্য হোমিওপ্যাথিক চিকিৎসকের পরামর্শ নিন।',
    },
    'remedies': remedies,
    'bn_glossary': SEG,
    'repertory_rubrics': chapters_out,
    'search_index': search,
}
md = db['metadata']
md['scope_note_bn'] = md['scope_note_bn'].format(
    r=BN(total_rub), c=BN(total_cells), L=BN(md['max_level']))
md['bangla_note_bn'] = md['bangla_note_bn'].format(
    kc=BN(bn_from_curated), cov=BN(round(100 * seg_known / max(1, seg_total))))
md['materia_medica_note_bn'] = md['materia_medica_note_bn'].format(
    f=BN(full_mm), mc=BN(mm_share))
md['materia_medica_coverage_pct'] = mm_share

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, separators=(',', ':'))

dups = sum(1 for v in name_seen.values() if v > 1)
print('chapters        :', len(chapters_out))
print('rubrics         :', total_rub, f'(max level {md["max_level"]})')
print('grade entries   :', total_cells, '| grades:', dict(sorted(grade_hist.items())))
print('remedies        :', len(remedies), f'(bangla {with_bn}, full MM {full_mm}, used {len(used)})')
print('MM covers       :', f'{mm_share}% of grade entries')
print('dropped tokens  :', dropped_tokens)
print('rubric bangla   :', f'curated {bn_from_curated}, glossary-full {bn_from_glossary}, partial {bn_partial}')
print('segment coverage:', f'{seg_known}/{seg_total} = {seg_known/max(1,seg_total):.1%}')
print('collapsed       :', f'page-overlap copies {overlap_dupes}, continuation merges {merged_rows}')
print('repeated names  :', dups)
print('file            :', round(os.path.getsize(OUT) / 1024 / 1024, 2), 'MB')
