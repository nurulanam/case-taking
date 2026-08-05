# -*- coding: utf-8 -*-
"""Parse John Henry Clarke's *A Dictionary of Practical Materia Medica*.

    http://homeoint.org/clarke/index.htm

One file per remedy at `<letter>/<abbrev>.htm`, ~1,000 remedies. Clarke's
abbreviations use underscores where Kent's key uses hyphens (`acet_ac`, `ab_c`,
`a_camm`), so the join needs that fold plus the Latin name as a fallback.

Page shape — the same trick as the other Médi-T transcriptions, structure carried
in colour rather than in tags:

    <font size="5" color="#800000"><p>Aconitum Napellus.</p></font>   title
    <p>Common Aconite. Monkshood. … N. O. Ranunculaceæ. Tincture …</p> provenance
    <font color="#ff0000"><p>Clinical.</p></font>      prose sections
    <font color="#ff0000"><p>Characteristics.</p></font>
    <font color="#ff0000"><p>Relations.</p></font>
    <font color="#ff0000"><p>Causation.</p></font>
    <font color="#ff0000"><p>1. Mind.</p></font>       his numbered schema
    …
    <i><font color="#0000ff">Amaurosis</font></i>       emphasis

Clarke's schema is the deepest of the three books, and the numbered sections are
long symptom lists. `SCHEMA_FROM` marks where the schema starts so a caller can
keep the prose sections and drop the schema when size matters.
"""
import os, re, html, glob, collections

TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>')
COLOR = re.compile(r'color\s*=\s*"?#?([0-9a-fA-F]{6})', re.I)
SIZE = re.compile(r'size\s*=\s*"?(\d+)', re.I)
CP1252_FIX = {c: bytes([c]).decode('cp1252', 'replace') for c in range(0x80, 0xA0)}

# Clarke's prose sections, then the numbered symptom schema
PROSE = ['Clinical', 'Characteristics', 'Relations', 'Causation']
SCHEMA_RE = re.compile(r'^\s*(\d{1,2})\s*\.\s*(.+?)\s*\.?\s*$')


def unescape(s):
    # the transcription writes œ/æ as cp1252 bytes and as entities, both
    return html.unescape(s).translate(CP1252_FIX).replace('─', '—')


def runs_of(path):
    src = open(path, encoding='latin-1').read()
    bold = ital = 0
    colors, sizes = [], []
    out = []
    pos = 0
    for m in TAG.finditer(src):
        chunk = src[pos:m.start()]
        pos = m.end()
        if chunk:
            out.append((unescape(chunk), bold > 0, ital > 0,
                        colors[-1] if colors else '', sizes[-1] if sizes else ''))
        close, tag, attr = m.group(1) == '/', m.group(2).lower(), m.group(3)
        if tag in ('b', 'strong'):
            bold = max(0, bold + (-1 if close else 1))
        elif tag in ('i', 'em'):
            ital = max(0, ital + (-1 if close else 1))
        elif tag == 'font':
            if close:
                if colors:
                    colors.pop()
                if sizes:
                    sizes.pop()
            else:
                c = COLOR.search(attr)
                z = SIZE.search(attr)
                colors.append(c.group(1).lower() if c else (colors[-1] if colors else ''))
                sizes.append(z.group(1) if z else (sizes[-1] if sizes else ''))
        elif tag in ('p', 'br', 'dir', 'blockquote', 'tr', 'td'):
            out.append(('\n', False, False, '', ''))
    return out


SKIP = re.compile(
    r'^(main|a dictionary|materia medica|by john|presented by|copyright|'
    r'buy a copy|top|next|previous)\b', re.I)


def clean_runs(runs):
    out = []
    for t, em in runs:
        t = re.sub(r'\s+', ' ', t)
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
    """-> {abbr, name, provenance, sections:[{h, n?, runs}]} or None."""
    abbr = os.path.basename(path).split('_', 1)[-1][:-4].lower()
    abbr = os.path.basename(path)[:-4].lower()
    if abbr.startswith('clarke_'):
        abbr = abbr[len('clarke_'):]
    # 'a_acet_ac' -> letter 'a', abbrev 'acet_ac'
    parts = abbr.split('_', 1)
    if len(parts) == 2 and len(parts[0]) == 1:
        abbr = parts[1]

    src = open(path, encoding='latin-1').read()
    m = re.search(r'<font size="5" color="#800000">\s*(?:<p[^>]*>)?(.*?)(?:</p>)?\s*</font>',
                  src, re.S | re.I)
    if not m:
        return None
    name = re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', m.group(1)))).strip(' .*')
    if not name:
        return None

    runs = runs_of(path)
    prov, sections = [], []
    cur = None
    buf = []
    state = 'masthead'

    def push():
        nonlocal buf
        if cur is None:
            prov.extend(buf)
        else:
            cur['runs'].extend(buf)
        buf = []

    nl = name.lower().rstrip('.')
    for t, b, i, c, z in runs:
        if t == '\n':
            if state == 'body':
                buf.append((' ', False))
            continue
        s = t.strip()
        if not s:
            continue
        if state == 'masthead':
            # the title is the size-5 maroon run carrying the remedy name
            if z == '5' and c == '800000' and s.lower().rstrip('.').startswith(nl[:10]):
                state = 'body'
            continue
        if SKIP.match(s):
            continue
        # a section heading is red: 'Clinical.' or '1. Mind.'
        if c == 'ff0000':
            label = re.sub(r'\s+', ' ', s).strip(' .:—–─')
            sm = SCHEMA_RE.match(label)
            if sm or label.rstrip('.') in PROSE or (len(label) < 40 and label[:1].isupper()):
                push()
                if sm:
                    cur = {'h': sm.group(2).strip(' .'), 'n': int(sm.group(1)), 'runs': []}
                else:
                    cur = {'h': label.rstrip('.'), 'runs': []}
                sections.append(cur)
                continue
        buf.append((t, bool(i)))
    push()

    out = {'abbr': abbr, 'name': name.rstrip('.')}
    p = clean_runs(prov)
    if p:
        out['provenance'] = p
    secs = []
    for s in sections:
        r = clean_runs(s['runs'])
        # 'SYMPTOMS.' is the divider Clarke prints before his numbered schema,
        # not content — it trails the last prose section
        if r:
            last = r[-1]['t'].rstrip()
            if last.upper().endswith('SYMPTOMS.'):
                r[-1]['t'] = last[:-len('SYMPTOMS.')].rstrip()
                r = [x for x in r if x['t'].strip()]
        if r:
            e = {'h': s['h'], 'runs': r}
            if 'n' in s:
                e['n'] = s['n']
            secs.append(e)
    if secs:
        out['sections'] = secs
    if not p and not secs:
        return None
    return out


def parse_all(mirror, verbose=True):
    files = sorted(f for f in glob.glob(os.path.join(mirror, '*.htm'))
                   if not re.match(r'^_.\.htm$', os.path.basename(f))
                   and os.path.basename(f) not in ('index.htm', 'idx.php.htm'))
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
        prose = collections.Counter(s['h'] for r in out for s in r.get('sections', [])
                                    if 'n' not in s)
        schema = collections.Counter(s['h'] for r in out for s in r.get('sections', [])
                                     if 'n' in s)
        print('prose sections  :', prose.most_common(8))
        print('schema sections :', len(schema), '|', schema.most_common(6))
    return out


if __name__ == '__main__':
    import sys, json
    recs = parse_all(sys.argv[1])
    for r in recs[:3]:
        print('---', r['abbr'], '|', r['name'])
        if r.get('provenance'):
            print('   prov:', ''.join(x['t'] for x in r['provenance'])[:130])
        for s in r.get('sections', [])[:4]:
            tag = f"{s.get('n', '')}. {s['h']}".strip('. ')
            print(f'   [{tag}]', ''.join(x['t'] for x in s['runs'])[:110])
    print('total bytes:',
          len(json.dumps(recs, ensure_ascii=False, separators=(',', ':'))) // 1024, 'KB')
