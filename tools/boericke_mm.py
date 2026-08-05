# -*- coding: utf-8 -*-
"""Parse William Boericke's *Pocket Manual of Homoeopathic Materia Medica*.

    http://homeoint.org/books/boericmm/index.htm

One HTML file per remedy, and the filenames are the standard abbreviations
(`a/acon.htm`, `a/acet-ac.htm`), so this joins straight onto our remedy ids.

Page shape:

    <font size="5" color="#800000">ACONITUM NAPELLUS<br></font>Monkshood</b>
    <p>… lead paragraph, the general picture …</p>
    <font color="#ff0000"><b>Mind.--</b></font>… section text …
    <font color="#0000ff"><i>Great fear, anxiety</i></font>

Boericke *italicises the characteristic symptoms* — that emphasis is part of the
book's meaning, exactly as bold/italic encodes grade in the repertories. So text
is stored as runs, `{t: text}` plain and `{t: text, em: 1}` emphasised, rather
than flattened to a string. The page renders the emphasis; nothing is invented
and no HTML from the source is passed through.
"""
import os, re, html, glob, collections

TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>')
COLOR = re.compile(r'color\s*=\s*"?#?([0-9a-fA-F]{6})', re.I)
CP1252_FIX = {c: bytes([c]).decode('cp1252', 'replace') for c in range(0x80, 0xA0)}

# Boericke's own section order, used to keep the output in book order
SECTION_ORDER = [
    'Mind', 'Head', 'Eyes', 'Ears', 'Nose', 'Face', 'Mouth', 'Teeth', 'Throat',
    'Stomach', 'Abdomen', 'Stool', 'Rectum', 'Urine', 'Urinary organs',
    'Male', 'Female', 'Respiratory organs', 'Heart', 'Chest', 'Back',
    'Extremities', 'Neck and Back', 'Sleep', 'Fever', 'Skin', 'Modalities',
    'Relationship', 'Dose',
]
ORDER_KEY = {s.lower(): i for i, s in enumerate(SECTION_ORDER)}


def unescape(s):
    return html.unescape(s).translate(CP1252_FIX)


def runs_of(path):
    """(text, bold, italic, colour) runs, with '\n' markers at block breaks."""
    src = open(path, encoding='latin-1').read()
    bold = ital = 0
    colors = []
    out = []
    pos = 0
    for m in TAG.finditer(src):
        chunk = src[pos:m.start()]
        pos = m.end()
        if chunk:
            out.append((unescape(chunk), bold > 0, ital > 0,
                        colors[-1] if colors else ''))
        close, tag, attr = m.group(1) == '/', m.group(2).lower(), m.group(3)
        if tag in ('b', 'strong'):
            bold = max(0, bold + (-1 if close else 1))
        elif tag in ('i', 'em'):
            ital = max(0, ital + (-1 if close else 1))
        elif tag == 'font':
            if close:
                if colors:
                    colors.pop()
            else:
                c = COLOR.search(attr)
                colors.append(c.group(1).lower() if c else (colors[-1] if colors else ''))
        elif tag in ('p', 'br', 'dir', 'blockquote'):
            out.append(('\n', False, False, ''))
    return out


SKIP = re.compile(
    r'^(home|main|hom.?opathic materia medica|by william|presented by|'
    r'copyright|buy a copy|see also|advertising|top)\b', re.I)
# 'Mind.--' / 'Modalities.--' / 'Relationship.--'
HEAD_RE = re.compile(r'^\s*([A-Z][A-Za-z /&\'\-]{1,34}?)\s*\.?\s*-{2,}\s*')


def clean_runs(runs):
    """Merge adjacent runs of the same emphasis and trim whitespace."""
    out = []
    for t, em in runs:
        t = re.sub(r'\s+', ' ', t)      # the source wraps mid-sentence
        if not t.strip():
            if out and not out[-1]['t'].endswith(' '):
                out[-1]['t'] += ' '
            continue
        if out and bool(out[-1].get('em')) == bool(em):
            out[-1]['t'] += t
        else:
            r = {'t': t}
            if em:
                r['em'] = 1
            out.append(r)
    if out:
        out[0]['t'] = out[0]['t'].lstrip()
        out[-1]['t'] = out[-1]['t'].rstrip()
    return [r for r in out if r['t'].strip()]


def parse_file(path):
    """-> {abbr, name, common, lead:[runs], sections:[{h, runs}]} or None."""
    abbr = os.path.basename(path).split('_', 1)[-1][:-4].lower()
    runs = runs_of(path)

    # title: the first size=5 maroon bold run is the Latin name
    src = open(path, encoding='latin-1').read()
    m = re.search(r'<font size="5" color="#800000">(.*?)</font>', src, re.S | re.I)
    if not m:
        return None
    title_raw = unescape(re.sub(r'<[^>]+>', ' ', m.group(1)))
    name = re.sub(r'\s+', ' ', title_raw).strip(' .*')
    if not name:
        return None
    # the common name follows the </font>, still inside the bold run
    tail = src[m.end():m.end() + 240]
    common = re.sub(r'<[^>]+>', ' ', tail.split('</b>')[0]) if '</b>' in tail else ''
    common = re.sub(r'\s+', ' ', unescape(common)).strip(' .*')

    # Walk the body. A red bold run starts a section; everything else is text.
    #
    # Getting past the masthead needs an explicit state, not a flag: the <title>
    # element also begins with the remedy name, so a "have I seen the name yet"
    # test trips on it and lets the real heading fall into the lead paragraph.
    lead, sections = [], []
    cur = None                       # None while still in the lead paragraph
    buf = []
    state = 'masthead'               # masthead -> heading -> body

    def push():
        nonlocal buf
        if cur is None:
            lead.extend(buf)
        else:
            cur['runs'].extend(buf)
        buf = []

    nl = name.lower()
    for t, b, i, c in runs:
        if t == '\n':
            if state == 'body':
                buf.append((' ', False))
            continue
        s = t.strip()
        if not s:
            continue

        if state != 'body':
            if state == 'masthead':
                # the remedy heading is the bold maroon run carrying the name
                if b and c == '800000' and s.lower().startswith(nl[:12]):
                    state = 'heading'
                continue
            # 'heading': the common name follows, still bold; body starts at the
            # first run that is not part of that heading block
            if b and c != 'ff0000':
                continue
            state = 'body'

        if SKIP.match(s):
            continue
        # a section heading is bold red, and reads 'Head.--'
        if b and c == 'ff0000':
            hm = HEAD_RE.match(t)
            if hm:
                push()
                cur = {'h': hm.group(1).strip(), 'runs': []}
                sections.append(cur)
                rest = t[hm.end():]
                if rest.strip():
                    buf.append((rest, False))
                continue
        buf.append((t, bool(i)))
    push()

    out = {
        'abbr': abbr,
        'name': name.title() if name.isupper() else name,
        'lead': clean_runs(lead),
    }
    if common and common.lower() != name.lower():
        out['common'] = common
    secs = []
    for s in sections:
        r = clean_runs(s['runs'])
        if r:
            secs.append({'h': s['h'], 'runs': r})
    if secs:
        out['sections'] = secs
    if not out['lead'] and not secs:
        return None
    return out


def parse_all(mirror, verbose=True):
    files = sorted(f for f in glob.glob(os.path.join(mirror, '*.htm'))
                   if not re.match(r'^_.\.htm$', os.path.basename(f)))
    out, bad = [], 0
    for f in files:
        try:
            rec = parse_file(f)
        except Exception:
            rec = None
        if rec:
            out.append(rec)
        else:
            bad += 1
    if verbose:
        print(f'pages           : {len(files)}')
        print(f'parsed          : {len(out)}  (unusable {bad})')
        secs = collections.Counter(s['h'] for r in out for s in r.get('sections', []))
        print(f'distinct headings: {len(secs)}')
        print('  top:', secs.most_common(14))
    return out


if __name__ == '__main__':
    import sys, json
    recs = parse_all(sys.argv[1])
    for r in recs[:3]:
        print('---', r['abbr'], '|', r['name'], '|', r.get('common', ''))
        print('   lead:', ''.join(x['t'] for x in r['lead'])[:150])
        for s in r.get('sections', [])[:3]:
            print(f"   [{s['h']}]", ''.join(x['t'] for x in s['runs'])[:110])
    print('bytes if dumped:',
          len(json.dumps(recs, ensure_ascii=False, separators=(',', ':'))) // 1024, 'KB')
