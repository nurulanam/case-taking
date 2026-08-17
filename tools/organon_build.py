# -*- coding: utf-8 -*-
"""Build assets/data/organon.json from the mirror + the Bangla translation.

    python3 tools/organon_build.py chunks   # write English source chunks to translate
    python3 tools/organon_build.py stat     # translation coverage
    python3 tools/organon_build.py build    # emit assets/data/organon.json

The shipped text is the 6th edition — Hahnemann's final revision, and the one
practitioners actually study. Where the mirror carries both translations the
6th (Boericke) wins; where it carries only one, that one serves both editions.
The 5th-edition variants are not shipped: the app is Bangla-only, and half-
translating a parallel text would put English back on the page.
"""
import sys, os, json, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
BN_DIR = os.path.join(HERE, 'organon_bn')
CHUNK_DIR = os.path.join(HERE, '.cache', 'organon_chunks')
OUT = os.path.join(ROOT, 'assets', 'data', 'organon.json')

from organon_html import parse_all


def canon():
    """§1-291 as a single 6th-edition text, in order."""
    aph = parse_all(verbose=False)
    by = collections.defaultdict(dict)
    for a in aph:
        by[a['number']][a['edition']] = a
    out = []
    for n in range(1, 292):
        v = by[n]
        a = v.get('6th') or v.get(None) or v.get('5th')
        out.append({'n': n, 'body': a['body'], 'footnotes': a['footnotes'],
                    'revised': '6th' in v})
    return out


# The mirror's page furniture (">>>>> § 140", "ORGANON OF MEDICINE") was
# stripped from the English only after translation had started, so some Bangla
# chunks faithfully rendered it — as a standalone paragraph, or welded onto a
# footnote that ran across the page break. Strip the Bangla forms here so both
# sides line up; translators rendered the running head two ways, hence both.
# Translators rendered the running head at least three ways (অর্গানন অব
# মেডিসিন / চিকিৎসাবিদ্যার অর্গানন / চিকিৎসাশাস্ত্রের অর্গানন), so match the
# shape rather than a fixed list: a short fragment ending in "অর্গানন" that
# carries no sentence-ending dari is furniture, not prose.
BN_RUNHEAD = re.compile(r'\s*(?:অর্গানন\s+অব\s+মেডিসিন'
                        r'|চিকিৎসা\S*\s+অর্গানন'
                        r'|অর্গানন\s+অব\s+মেডিসিন)\s*')
BN_PAGEMARK = re.compile(r'\s*>+\s*§?\s*[০-৯]+\s*(?:(?:পঞ্চম|ষষ্ঠ)\s*সংস্করণ\s*)?')


def _bn_clean(s):
    s = BN_RUNHEAD.sub(' ', s)
    s = BN_PAGEMARK.sub(' ', s)
    return re.sub(r'\s{2,}', ' ', s).strip()


def load_bn():
    """Merge every tools/organon_bn/*.json into one {number: {...}} map."""
    bn = {}
    if not os.path.isdir(BN_DIR):
        return bn
    for f in sorted(os.listdir(BN_DIR)):
        if not f.endswith('.json'):
            continue
        for k, v in json.load(open(os.path.join(BN_DIR, f), encoding='utf-8')).items():
            bn[int(k)] = {
                'body': [p for p in (_bn_clean(x) for x in v.get('body', [])) if p],
                'footnotes': [p for p in (_bn_clean(x) for x in v.get('footnotes', [])) if p],
            }
    return bn


def cmd_chunks(per=18):
    os.makedirs(CHUNK_DIR, exist_ok=True)
    src = canon()
    for i in range(0, len(src), per):
        part = src[i:i + per]
        name = f'c{i // per + 1:02d}.json'
        json.dump({str(a['n']): {'body': a['body'],
                                 'footnotes': [n['text'] for n in a['footnotes']]}
                   for a in part},
                  open(os.path.join(CHUNK_DIR, name), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        words = sum(len(' '.join(a['body']).split()) +
                    sum(len(n['text'].split()) for n in a['footnotes']) for a in part)
        print(f'{name}  §{part[0]["n"]}-{part[-1]["n"]:<4} {words:>6} words')


def cmd_stat():
    src, bn = canon(), load_bn()
    done = [a for a in src if a['n'] in bn]
    print(f'aphorisms translated : {len(done)}/291')
    bad = []
    for a in src:
        t = bn.get(a['n'])
        if not t:
            continue
        if len(t.get('body', [])) != len(a['body']):
            bad.append((a['n'], 'body', len(a['body']), len(t.get('body', []))))
        if len(t.get('footnotes', [])) != len(a['footnotes']):
            bad.append((a['n'], 'fn', len(a['footnotes']), len(t.get('footnotes', []))))
    print(f'shape mismatches     : {len(bad)} {bad[:8]}')
    latin = [(a['n'], p[:60]) for a in src if a['n'] in bn
             for p in bn[a['n']].get('body', []) + bn[a['n']].get('footnotes', [])
             if re.search(r'[A-Za-z]{2,}', p)]
    print(f'paragraphs with latin: {len(latin)} {latin[:5]}')
    missing = [a['n'] for a in src if a['n'] not in bn]
    print(f'missing              : {len(missing)} {missing[:20]}')


def cmd_build():
    from organon_meta import SECTIONS, PRINCIPLES, META
    src, bn = canon(), load_bn()
    miss = [a['n'] for a in src if a['n'] not in bn]
    if miss:
        print(f'REFUSING: {len(miss)} aphorisms untranslated -> {miss[:15]}')
        sys.exit(1)

    # § -> section id, so the reader can jump and the UI can group
    sec_of = {}
    for s in SECTIONS:
        for n in range(s['from'], s['to'] + 1):
            sec_of[n] = s['id']

    aphorisms = []
    for a in src:
        t = bn[a['n']]
        aphorisms.append({
            'n': a['n'],
            'section': sec_of[a['n']],
            'body': t['body'],
            'footnotes': t.get('footnotes', []),
            'revised': a['revised'],
        })

    data = {
        'metadata': dict(META, aphorisms_total=len(aphorisms),
                         footnotes_total=sum(len(a['footnotes']) for a in aphorisms),
                         sections_total=len(SECTIONS),
                         principles_total=len(PRINCIPLES)),
        'sections': SECTIONS,
        'principles': PRINCIPLES,
        'aphorisms': aphorisms,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False,
              separators=(',', ':'))
    kb = os.path.getsize(OUT) / 1024
    print(f'aphorisms : {len(aphorisms)}')
    print(f'footnotes : {data["metadata"]["footnotes_total"]}')
    print(f'sections  : {len(SECTIONS)}   principles: {len(PRINCIPLES)}')
    print(f'written   : {OUT} ({kb:.0f} KB)')


if __name__ == '__main__':
    c = sys.argv[1] if len(sys.argv) > 1 else 'stat'
    {'chunks': cmd_chunks, 'stat': cmd_stat, 'build': cmd_build}[c]()
