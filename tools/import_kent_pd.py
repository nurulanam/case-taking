# -*- coding: utf-8 -*-
"""Import rubrics from the public-domain OCR of Kent's Repertory and merge them
into assets/data/repatories/kent_remidies.json.

    python3 tools/build.py                 # curated core (769 rubrics, 3 grades)
    python3 tools/import_kent_pd.py        # + public-domain breadth

Source : archive.org/details/kents-repertory_202403  (Public Domain Mark 1.0)
         Kent's Repertory_djvu.txt  — OCR full text

IMPORTANT — grades.  In print Kent marks grade 3 in bold and grade 2 in italics.
This scan's OCR keeps neither, only capitalisation, so bold and italic both come
through as "Capitalised".  Imported remedies therefore get:

    Capitalised  -> grade 2   (bold OR italic in print — not separable here)
    lowercase    -> grade 1

Curated rubrics keep their hand-checked 1/2/3 grades and always win a conflict.
Every imported rubric is tagged  "src": "kent-pd"  so the two are never confused.
"""
import json, os, re, sys, html, difflib, collections, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'data', 'repatories', 'kent_remidies.json')
CACHE = os.path.join(HERE, '.cache-kent-pd.txt')
URL = 'https://archive.org/stream/kents-repertory_202403/Kent%27s%20Repertory_djvu.txt'

MIN_REMEDIES = int(os.environ.get('MIN_REMEDIES', '3'))    # discriminating floor
MAX_REMEDIES = int(os.environ.get('MAX_REMEDIES', '120'))  # above this it is a catch-all
BN = lambda v: str(v).translate(str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'))

# OCR of the printed chapter names -> our 37-chapter numbering
CHAPTER_MAP = {
    'MIND': 1, 'VERTIGO': 2, 'HEAD': 3, 'EYE': 4, 'VISION': 5, 'EAR': 6, 'HEARING': 7,
    'NOSE': 8, 'FACE': 9, 'MOUTH': 10, 'TEETH': 11, 'THROAT': 12, 'EXTERNAL THROAT': 13,
    'STOMACH': 14, 'ABDOMEN': 15, 'RECTUM': 16, 'STOOL': 17, 'URINARY ORGANS': 18,
    'BLADDER': 18, 'KIDNEYS': 19, 'PROSTATE GLAND': 20, 'URETHRA': 21, 'URINE': 22,
    'GENITALIA MALE': 23, 'GENITALIA FEMALE': 24, 'LARYNX AND TRACHEA': 25,
    'RESPIRATION': 26, 'COUGH': 27, 'EXPECTORATION': 28, 'CHEST': 29, 'BACK': 30,
    'EXTREMITIES': 31, 'SLEEP': 32, 'CHILL': 33, 'FEVER': 34, 'PERSPIRATION': 35,
    'SKIN': 36, 'GENERALITIES': 37,
}
CH_NAMES = sorted(CHAPTER_MAP, key=len, reverse=True)


def fetch():
    if os.path.exists(CACHE):
        return open(CACHE, encoding='utf-8').read()
    print('downloading OCR text …')
    with urllib.request.urlopen(URL, timeout=300) as r:
        raw = r.read().decode('utf-8', 'replace')
    m = re.search(r'<pre[^>]*>(.*?)</pre>', raw, re.S)
    txt = html.unescape(re.sub(r'<[^>]+>', '', m.group(1) if m else raw))
    open(CACHE, 'w', encoding='utf-8').write(txt)
    return txt


# ---------------------------------------------------------------- abbreviations
def parse_abbrev(txt):
    """abbr(normalised) -> printed remedy name, from the book's own key."""
    out = {}
    for line in txt.split('\n'):
        m = re.match(r'^\s*(\S{2,18}?)\s*-{3,}\s*(.+?)\s*$', line)
        if not m:
            continue
        abbr, name = m.group(1), m.group(2)
        name = re.sub(r'\.$', '', name).strip()
        if not re.match(r'^[A-Za-zÆæ]', name) or len(name) < 3:
            continue
        key = norm_abbr(abbr)
        if key and key not in STOP:
            out[key] = name
    for k, v in EXTRA_ABBREV.items():
        out.setdefault(k, v)
    return out


# Kent's own non-remedy abbreviations, plus scan furniture — never remedies
STOP = {
    'amel', 'agg', 'aggr', 'etc', 'am', 'pm', 'ie', 'eg', 'vol', 'no', 'see', 'p', 'pp',
    'fig', 'ed', 'mr', 'dr', 'st', 'viz', 'cf', 'ff', 'ibid', 'cit', 'ex', 'inc',
    'jr', 'sr', 'ie', 'eq', 'ca', 'al',
}

# lines the OCR lost from the abbreviation key (verified against Kent's own list)
EXTRA_ABBREV = {
    'ars': 'Arsenicum Album',
    'kali-i': 'Kali Iodatum',
    'ferr': 'Ferrum Metallicum',
    'mag-m': 'Magnesia Muriatica',
    'nat-a': 'Natrum Arsenicosum',
}


def norm_abbr(a):
    a = a.strip().lower().rstrip('.')
    a = a.replace('|', 'l').replace('/', 'l').replace('æ', 'ae')
    a = re.sub(r'[^a-z0-9\-]', '', a)
    return a


# ------------------------------------------------------------------ rubric walk
REMEDY_LINE = re.compile(r'^[A-Za-zÆæ][A-Za-z0-9Ææ\-\|/\s\.,\']*$')


def is_remedy_run(s):
    """A continuation line: mostly 'abbr.,' tokens."""
    if ':' in s:
        return False
    toks = [x for x in re.split(r'[,\s]+', s) if x]
    if not toks:
        return False
    dotted = sum(1 for x in toks if x.endswith('.') or x.endswith('.,'))
    return dotted >= max(2, int(0.6 * len(toks)))


def clean_rubric(name):
    name = re.sub(r'\(see[^)]*\)', '', name, flags=re.I)
    name = re.sub(r'\s+', ' ', name).strip(' .,;:-')
    return name


def tidy_caps(name):
    """Kent shouts the catchword ('Sexual PASSION diminished'); print it normally,
    but leave a leading catchword alone — titled_first() handles that one."""
    parts = name.split(' ')
    out = [parts[0]] + [w.lower() if len(w) > 2 and w.isupper() else w for w in parts[1:]]
    return ' '.join(out)


def is_chapter_head(s):
    seg = s.split(',')[0].strip()
    return ':' not in s and seg.upper().rstrip(' .') in CHAPTER_MAP and seg == seg.upper()


def trust_windows(lines):
    """This scan's pages are out of order, several chapter titles were lost to OCR
    and the tail is duplicated.  So take only the stretches that (a) start with a
    bare chapter title and (b) stay alphabetical — Kent restarts at 'A' in every
    chapter, so the first backwards jump in the main-rubric initials marks the
    point where this segment stopped being the chapter it claimed to be."""
    titles = []
    for i, l in enumerate(lines):
        s = l.strip()
        if s and ':' not in s and s == s.upper() and s.upper().rstrip(' .') in CHAPTER_MAP:
            ch = CHAPTER_MAP[s.upper().rstrip(' .')]
            if titles and titles[-1][1] == ch and i - titles[-1][0] < 8:
                continue
            titles.append((i, ch))
    out = []
    for k, (i, ch) in enumerate(titles):
        end = titles[k + 1][0] if k + 1 < len(titles) else len(lines)
        prev, cut = '', end
        for j in range(i, end):
            s = lines[j].strip()
            if not s or is_chapter_head(s):
                continue
            head = s.split(':')[0].strip()
            if head and head == head.upper() and re.match(r'^[A-Z]', head) and len(head) < 60 and ',' not in head:
                if prev and head[0] < prev[0]:
                    cut = j
                    break
                prev = head
        if cut - i > 20:
            out.append((i, cut, ch))
    return out


def running_head(s):
    """'SLEEP, DREAMS, animals' -> (chapter no, 'DREAMS').  Kent repeats the
    chapter and the rubric in flight at the top of every page, which is the only
    hierarchy signal left once OCR has dropped the indentation."""
    if ':' in s:
        return None
    segs = [x.strip() for x in s.split(',')]
    if not segs:
        return None
    ch = CHAPTER_MAP.get(segs[0].upper().rstrip(' .'))
    if ch is None or segs[0] != segs[0].upper():
        return None
    main = segs[1] if len(segs) > 1 and segs[1] and segs[1] == segs[1].upper() else None
    return ch, main


def walk(txt, abbrev):
    """-> [(chapter_no, rubric_name, [(abbr, grade), ...])]"""
    lines = txt.split('\n')
    chapter, main = None, None
    cur_name, cur_rem = None, []
    stats = collections.Counter()
    yield_buf = []

    def flush():
        nonlocal cur_name, cur_rem
        if cur_name and cur_rem and chapter:
            yield_buf.append((chapter, cur_name, cur_rem))
        cur_name, cur_rem = None, []

    def titled(x):
        return x.title() if x and x == x.upper() else x

    def titled_first(h):
        """'RETENTION of urine' -> 'Retention of urine'; keep the rest as printed."""
        m = re.match(r'^([A-Z][A-Z\-\']{2,})(.*)$', h)
        return (m.group(1).capitalize() + m.group(2)) if m else (h.title() if h == h.upper() else h)

    for raw in lines:
        s = raw.strip()
        if not s:
            continue

        rh = running_head(s)
        if rh:
            flush()
            chapter = rh[0]
            if rh[1]:
                main = rh[1]
            stats['running_heads'] += 1
            continue
        if chapter is None:
            continue                      # front matter, before the first chapter

        if ':' in s:
            flush()
            head, _, tail = s.partition(':')
            head = clean_rubric(head)
            if not head or len(head) > 90:
                continue
            # Kent sets the FIRST WORD of a main rubric in caps ("RETENTION of
            # urine"); sub-rubrics start lowercase ("every two weeks …").
            w0 = re.split(r'[\s,]+', head)[0].strip('.,;:')
            if len(w0) >= 3 and w0.isupper():
                main = head
                cur_name = head[:1] + head[1:].replace(w0[1:], w0[1:].lower(), 1) if False else titled_first(head)
            else:                                          # sub-rubric of the last main
                base = titled_first(main) if main else ''
                cur_name = f'{base}, {head}' if base else head
            cur_rem = parse_remedies(tail, abbrev, stats)
        elif is_remedy_run(s) and cur_name:
            cur_rem += parse_remedies(s, abbrev, stats)    # wrapped remedy list
        elif s == s.upper() and 1 < len(s) < 60 and not is_remedy_run(s):
            flush()
            main = clean_rubric(s) or main                 # main rubric, remedies follow
    flush()
    return yield_buf, stats


def parse_remedies(chunk, abbrev, stats):
    out = []
    for tok in re.split(r'[,;]', chunk):
        tok = tok.strip().strip('.')
        if not tok or len(tok) > 18 or ' ' in tok.strip():
            continue
        grade = 2 if tok[:1].isupper() else 1
        key = norm_abbr(tok)
        if not key or key.isdigit() or key in STOP or len(key) < 2:
            continue
        if key in abbrev:
            out.append((key, grade)); stats['matched'] += 1
        else:
            near = difflib.get_close_matches(key, abbrev.keys(), n=1, cutoff=0.86)
            if near:
                out.append((near[0], grade)); stats['repaired'] += 1
            else:
                stats['dropped'] += 1
    return out


# ------------------------------------------------------------------------ merge
def main():
    txt = fetch()
    abbrev = parse_abbrev(txt)
    print(f'abbreviation key: {len(abbrev)} remedies')
    if len(abbrev) < 200:
        sys.exit('abbreviation key looks wrong — aborting')

    lines = txt.split('\n')
    windows = trust_windows(lines)
    print(f'trustworthy windows: {len(windows)}  ({sum(b - a for a, b, _ in windows)} lines of {len(lines)})')

    rubs, stats = [], collections.Counter()
    for a, b, ch in windows:
        name = next(k for k, v in CHAPTER_MAP.items() if v == ch)
        part, st = walk(name + '\n' + '\n'.join(lines[a:b]), abbrev)
        rubs += [(ch, n, r) for _, n, r in part]
        stats.update(st)
    print(f'rubrics parsed: {len(rubs)}  '
          f'(tokens matched {stats["matched"]}, repaired {stats["repaired"]}, dropped {stats["dropped"]})')

    db = json.load(open(OUT, encoding='utf-8'))
    by_num = {c['number']: c for c in db['repertory_rubrics']}
    known = {r['name'] for r in db['remedies']}
    curated = {(c['number'], r['name'].lower()) for c in db['repertory_rubrics'] for r in c['rubrics']}

    # de-duplicate: same chapter + same rubric name -> keep the widest remedy list
    best = {}
    for ch, name, rem in rubs:
        # clinically useful: discriminating (not a catch-all) and Kent marked at
        # least one remedy in bold/italic
        if not (MIN_REMEDIES <= len(rem) <= MAX_REMEDIES):
            continue
        if not any(g >= 2 for _, g in rem):
            continue
        if (ch, name.lower()) in curated:
            stats['skipped_curated'] += 1
            continue
        seen, uniq = {}, []
        for k, g in rem:
            if k not in seen or g > seen[k]:
                seen[k] = g
        uniq = sorted(seen.items(), key=lambda x: (-x[1], abbrev[x[0]]))
        key = (ch, name.lower())
        if key not in best or len(uniq) > len(best[key][1]):
            best[key] = (name, uniq)

    added = 0
    used_names = set()
    for (ch, _), (name, rem) in sorted(best.items()):
        chapter = by_num.get(ch)
        if not chapter:
            continue
        chapter['rubrics'].append({
            'name': tidy_caps(name),
            'src': 'kent-pd',
            'remedies': {abbrev[k]: g for k, g in rem},
        })
        used_names.update(abbrev[k] for k, _ in rem)
        added += 1

    # every referenced remedy must exist in remedies[] — name only, nothing invented
    for nm in sorted(used_names - known):
        db['remedies'].append({
            'name': nm, 'bangla_name': '', 'abbr': '',
            'family': '', 'content_status': 'basic', 'in_rubrics': True,
            'source': 'kent-pd',
        })

    for c in db['repertory_rubrics']:
        c['rubrics'].sort(key=lambda r: r['name'].lower())

    total = sum(len(c['rubrics']) for c in db['repertory_rubrics'])
    cells = sum(len(r['remedies']) for c in db['repertory_rubrics'] for r in c['rubrics'])
    md = db['metadata']
    md['version'] = '5.0-kent37-pd'
    md['rubrics_total'] = total
    md['remedies_total'] = len(db['remedies'])
    md['grade_entries'] = cells
    md['rubrics_curated'] = total - added
    md['rubrics_public_domain'] = added
    md['source_public_domain'] = ('Kent\'s Repertory OCR — archive.org/details/kents-repertory_202403, '
                                 'Public Domain Mark 1.0')
    md['grade_note_bn'] = (
        'কিউরেটেড রুব্রিকে গ্রেড ১–৩ হাতে যাচাই করা। পাবলিক ডোমেইন OCR থেকে আনা রুব্রিকে '
        'ছাপার বোল্ড (গ্রেড ৩) ও ইটালিক (গ্রেড ২) আলাদা করা যায়নি — OCR শুধু বড় হাতের অক্ষর রেখেছে। '
        'তাই সেখানে বড় হাতের নাম = গ্রেড ২ এবং ছোট হাতের নাম = গ্রেড ১ ধরা হয়েছে।')
    md['scope_note_bn'] = (
        'কেন্টের ৩৭টি অধ্যায় — মোট {t}টি রুব্রিক ({c}টি হাতে যাচাই করা, {p}টি পাবলিক ডোমেইন '
        'কেন্ট OCR থেকে) ও {g}টি গ্রেড এন্ট্রি। কোনো প্লেসহোল্ডার নাম নেই।'
    ).format(t=BN(total), c=BN(total - added), p=BN(added), g=BN(cells))

    json.dump(db, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    print(f'\nadded            : {added} public-domain rubrics (min {MIN_REMEDIES} remedies)')
    print(f'skipped (curated): {stats["skipped_curated"]}')
    print(f'rubrics total    : {total}')
    print(f'grade entries    : {cells}')
    print(f'remedies total   : {len(db["remedies"])}')
    print(f'file             : {round(os.path.getsize(OUT)/1024/1024, 2)} MB')
    hist = collections.Counter(len(r['remedies']) for c in db['repertory_rubrics'] for r in c['rubrics'])
    print('remedies/rubric  :', dict(sorted(hist.items())[:10]), '…')


if __name__ == '__main__':
    main()
