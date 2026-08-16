# -*- coding: utf-8 -*-
"""Work through the untranslated Kent rubric segments in batches.

    python3 tools/bn_batch.py next 300      # print the next 300 to translate
    python3 tools/bn_batch.py add file.json # merge {en: bn} into kent_bn_ext.py
    python3 tools/bn_batch.py stat          # coverage, by chapter

The segment list is derived from the parsed book, not from a snapshot, so a
segment stops appearing here the moment kent_bn resolves it — whether that came
from SEG, SEG_EXT or the clock-time rules.
"""
import sys, os, json, re, collections, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
MIRROR = os.path.join(HERE, '.cache', 'kentrep')
EXT = os.path.join(HERE, 'kent_bn_ext.py')
CACHE = os.path.join(HERE, '.cache-segments.json')


def segments():
    """[(segment, chapter_no, occurrences)] in book order — cached, the parse
    is the slow part and the rubric names do not change between batches."""
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding='utf-8'))
    from kent_html import parse_all
    rubs = parse_all(MIRROR, verbose=False)
    first, freq = {}, collections.Counter()
    for r in rubs:
        for p in r.name.split(','):
            s = p.strip()
            if not s:
                continue
            freq[s] += 1
            first.setdefault(s, r.chapter_no)
    out = [[s, first[s], freq[s]] for s in first]
    json.dump(out, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    return out


def pending():
    import kent_bn
    importlib.reload(kent_bn)
    return [(s, ch, n) for s, ch, n in segments() if kent_bn.bn_segment(s) is None]


def cmd_next(n):
    rows = pending()[:int(n)]
    print(json.dumps([r[0] for r in rows], ensure_ascii=False, indent=0))
    print(f'\n# {len(rows)} shown, {len(pending())} pending', file=sys.stderr)


def cmd_add(path):
    new = json.load(open(path, encoding='utf-8'))
    import kent_bn
    keep = {k: v for k, v in new.items() if v and v.strip() and v.strip() != k}
    src = open(EXT, encoding='utf-8').read().rstrip('\n')
    body = ''.join(f'    {json.dumps(k, ensure_ascii=False)}: '
                   f'{json.dumps(v, ensure_ascii=False)},\n' for k, v in keep.items())
    open(EXT, 'w', encoding='utf-8').write(f'{src}\n\nSEG_EXT.update({{\n{body}}})\n')
    print(f'added {len(keep)}')


def cmd_stat():
    from kent_html import CHAPTER_FILES
    names = {v[0]: v[1] for v in CHAPTER_FILES.values()}
    allseg = segments()
    left = collections.Counter(ch for _s, ch, _n in pending())
    tot = collections.Counter(ch for _s, ch, _n in allseg)
    occ_all = sum(n for _s, _c, n in allseg)
    occ_left = sum(n for _s, _c, n in pending())
    for ch in sorted(tot):
        d, t = left.get(ch, 0), tot[ch]
        print(f'  ch{ch:>2} {names[ch]:22} {t - d:>5}/{t:<5} {100 * (t - d) / t:5.1f}%')
    print(f'  segments {len(allseg) - len(pending())}/{len(allseg)} '
          f'({100 * (len(allseg) - len(pending())) / len(allseg):.1f}%)  '
          f'occurrences {100 * (occ_all - occ_left) / occ_all:.1f}%')


if __name__ == '__main__':
    c = sys.argv[1] if len(sys.argv) > 1 else 'stat'
    {'next': lambda: cmd_next(sys.argv[2] if len(sys.argv) > 2 else 300),
     'add': lambda: cmd_add(sys.argv[2]),
     'stat': cmd_stat}[c]()
