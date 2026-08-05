# -*- coding: utf-8 -*-
"""Parse the Médi-T HTML edition of Boericke's Repertory.

    http://homeoint.org/books4/boerirep/index.htm

Oscar E. Boericke's *Repertory* (the companion to William Boericke's *Pocket
Manual*) is a much smaller, more clinical book than Kent — organised by system
rather than by Kent's schema, and with only **two** remedy grades.

The transcription encodes structure the same way Kent's does — typographically:

    <b><font color="#ff0000">APPETITE</b>      bold red    -> heading, level 1
    <b><font color="#0000ff">Diminished</b>    bold blue   -> heading, level 2
    <b><font color="#008000">Hungry at night   bold green  -> heading, level 3
    <b><font color="#800000">Bread             bold maroon -> heading, level 4
    <b><font color="#000080">Beer              bold navy   -> heading, level 5

    <i><font color="#0000ff">Æth.</font></i>   italic      -> grade 2
    Apis                                       plain       -> grade 1

A rubric line is `NAME -- remedy, remedy, …`; a line with no `--` is a bare
parent heading. Depth comes from the colour ladder rather than <dir> nesting,
because this export opens and closes <dir> inconsistently around the headings
while the colours stay correct throughout.
"""
import os, re, html, collections

CHAPTERS = [
    ('mind', 'Mind', 'মন'),
    ('head', 'Head', 'মাথা'),
    ('eyes', 'Eyes', 'চোখ'),
    ('ears', 'Ears', 'কান'),
    ('nose', 'Nose', 'নাক'),
    ('face', 'Face', 'মুখমণ্ডল'),
    ('mouth', 'Mouth', 'মুখগহ্বর'),
    ('tongue', 'Tongue', 'জিহ্বা'),
    ('taste', 'Taste', 'স্বাদ'),
    ('gums', 'Gums', 'মাড়ি'),
    ('teeth', 'Teeth', 'দাঁত'),
    ('throat', 'Throat', 'গলা'),
    ('stomach', 'Stomach', 'পাকস্থলী'),
    ('abdomen', 'Abdomen', 'উদর'),
    ('urinary', 'Urinary system', 'মূত্রতন্ত্র'),
    ('male', 'Male sexual system', 'পুরুষ জননতন্ত্র'),
    ('female', 'Female sexual system', 'নারী জননতন্ত্র'),
    ('circulatory', 'Circulatory system', 'রক্ত সঞ্চালন'),
    ('locomotor', 'Locomotor system', 'চলনতন্ত্র'),
    ('respiratory', 'Respiratory system', 'শ্বাসতন্ত্র'),
    ('skin', 'Skin', 'ত্বক'),
    ('fever', 'Fever', 'জ্বর'),
    ('nervous', 'Nervous system', 'স্নায়ুতন্ত্র'),
    ('general', 'Generalities', 'সাধারণ'),
    ('modalities', 'Modalities', 'মোডালিটি'),
]
CHAPTER_ICON = {
    'mind': 'mind', 'head': 'head', 'eyes': 'eye', 'ears': 'ear', 'nose': 'nose',
    'face': 'face', 'mouth': 'mouth', 'tongue': 'mouth', 'taste': 'mouth',
    'gums': 'teeth', 'teeth': 'teeth', 'throat': 'throat', 'stomach': 'stomach',
    'abdomen': 'abdomen', 'urinary': 'bladder', 'male': 'male', 'female': 'female',
    'circulatory': 'chest', 'locomotor': 'extremities', 'respiratory': 'respiration',
    'skin': 'skin', 'fever': 'fever', 'nervous': 'mind', 'general': 'generalities',
    'modalities': 'generalities',
}

# bold colour -> heading depth
DEPTH = {'ff0000': 1, '0000ff': 2, '008000': 3, '800000': 4, '000080': 5}

TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>')
COLOR = re.compile(r'color\s*=\s*"?#?([0-9a-fA-F]{6})', re.I)
SEP = re.compile(r'\s+--+\s+|\s+--+$')
SEE = re.compile(r'\(\s*See\b[^)]*\)', re.I)
CP1252_FIX = {c: bytes([c]).decode('cp1252', 'replace') for c in range(0x80, 0xA0)}


def unescape(s):
    return html.unescape(s).translate(CP1252_FIX)


class Rubric:
    __slots__ = ('chapter', 'chapter_bn', 'path', 'name', 'level', 'remedies')

    def __init__(self, chapter, chapter_bn, path, remedies):
        self.chapter, self.chapter_bn = chapter, chapter_bn
        self.path = path
        self.level = len(path)
        self.name = ', '.join(path)
        self.remedies = remedies

    def __repr__(self):
        return f'<{self.chapter} {self.name} ({len(self.remedies)})>'


def runs_of(path):
    """Linearise a chapter file into (text, bold, italic, colour) runs."""
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
        if tag == 'b' or tag == 'strong':
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
        elif tag in ('p', 'br', 'dir', 'blockquote', 'td', 'tr'):
            out.append(('\n', False, False, ''))     # a structural break
    if pos < len(src):
        out.append((unescape(src[pos:]), bold > 0, ital > 0, colors[-1] if colors else ''))
    return out


TOKEN_OK = re.compile(r'^[A-Za-zÆæŒœ][A-Za-z0-9ÆæŒœ\-\'\. ]{0,26}$')
SKIP_TEXT = re.compile(r'^(main|REPERTORY|by Oscar|Presented by|MATERIA)', re.I)


def parse_file(path, chapter, chapter_bn, stats):
    """Split a chapter into rubrics.

    Headings are recognised by bold + a colour in the depth ladder; the remedy
    list is whatever follows the ' -- ' separator on the same visual line. The
    heading text and its remedies can sit in different runs (the export closes
    </b> mid-line), so runs are accumulated into a line and split afterwards.
    """
    out = []
    stack = {}
    line = []                 # (text, bold, ital, color)
    def flush():
        if not line:
            return
        text = ''.join(t for t, _, _, _ in line)
        if not text.strip() or SKIP_TEXT.match(text.strip()):
            line.clear(); return

        # the heading part is the leading bold run(s) carrying a ladder colour
        depth = None
        for t, b, i, c in line:
            if b and not i and c in DEPTH and t.strip():
                depth = DEPTH[c]
                break
        m = SEP.search(text)
        name_txt = text[:m.start()] if m else text
        name = SEE.sub(' ', name_txt)
        name = re.sub(r'\s+', ' ', name).strip(' ,;:.-*')
        if not name:
            line.clear(); return

        if depth is None:
            # continuation of a remedy list with no heading of its own
            line.clear(); return

        for k in [k for k in stack if k >= depth]:
            del stack[k]
        stack[depth] = name
        path_parts = [stack[k] for k in sorted(stack)]

        if m:
            toks = remedy_tokens(line, m.end())
            if toks:
                out.append(Rubric(chapter, chapter_bn, path_parts, toks))
            else:
                stats['no_remedies'] += 1
        line.clear()

    for run in runs_of(path):
        if run[0] == '\n':
            flush()
        else:
            line.append(run)
    flush()
    return out


def remedy_tokens(line, offset):
    """(abbrev, grade) after `offset` chars — italic is Boericke's higher grade."""
    seen = 0
    out = []
    for text, bold, ital, color in line:
        start = 0
        if seen + len(text) <= offset:
            seen += len(text)
            continue
        if seen < offset:
            start = offset - seen
        seg = text[start:]
        seen += len(text)
        grade = 2 if ital else 1
        for piece in re.split(r'[,;]', seg):
            tok = piece.strip().strip('.').strip().strip('()[]*').strip()
            if not tok or not TOKEN_OK.match(tok):
                continue
            if tok.lower() in ('see', 'and', 'or', 'etc'):
                continue
            out.append((tok, grade))
    return out


def parse_all(mirror, verbose=True):
    stats = collections.Counter()
    rubs = []
    for stem, en, bn in CHAPTERS:
        # a chapter may run across stem.htm, stem2.htm, stem3.htm …
        parts = [stem + '.htm'] + [f'{stem}{n}.htm' for n in range(2, 9)]
        for fn in parts:
            fp = os.path.join(mirror, fn)
            if os.path.exists(fp):
                rubs.extend(parse_file(fp, en, bn, stats))
    if verbose:
        print(f'rubrics parsed  : {len(rubs)}')
        print(f'skipped         : {dict(stats)}')
    return rubs


if __name__ == '__main__':
    import sys
    rubs = parse_all(sys.argv[1])
    by = collections.Counter(r.chapter for r in rubs)
    for _s, en, _b in CHAPTERS:
        print(f'  {en:<22} {by.get(en, 0):>5}')
    g = collections.Counter(gr for r in rubs for _, gr in r.remedies)
    print('grade entries   :', sum(g.values()), dict(sorted(g.items())))
    print('levels          :', dict(sorted(collections.Counter(r.level for r in rubs).items())))
    toks = collections.Counter(t for r in rubs for t, _ in r.remedies)
    print('distinct abbrev :', len(toks))
    print('  top:', toks.most_common(20))
    print('sample rubrics:')
    for r in rubs[:6]:
        print('   ', r.name[:70], '->', r.remedies[:4])
