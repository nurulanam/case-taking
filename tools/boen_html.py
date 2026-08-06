# -*- coding: utf-8 -*-
"""Parse the Médi-T HTML edition of Bönninghausen's Characteristics Repertory
(C. M. Boger's compilation).

    http://homeoint.org/books2/boenchar/index.htm

Structurally this is the same kind of export as Kent's — <dir> nesting gives
real sub-rubric depth, and remedy grade is typography:

    <font color="#008080">Puls.</font>                     teal, plain   -> grade 1
    <i><font color="#0000ff">Puls.</font></i>               italic blue  -> grade 2
    <b><font color="#ff0000">Puls.</font></b>               bold red     -> grade 3
    <b><u><font color="#000080">PULS.</font></u></b>        bold+underline navy, caps -> grade 4

Bönninghausen's own four-degree emphasis (ordinary / italic / bold / small
caps) is what this ladder is standing in for — grade 4 is his own top rank,
not an invention of the transcription.

A rubric paragraph is `Name&nbsp;:- remedy, remedy, …`; a heading with no
remedies of its own (opening a <dir> for its children) has nothing after the
':-'. The book is one file per chapter except two: "Sensations and complaints
in general" and "Conditions of aggravation and amelioration in general" are
each split across 23-24 files, one per initial letter, because they are the
largest chapters in the book.
"""
import os, re, html, collections

# ------------------------------------------------------------- chapter map
# Printed order, (English chapter name, [filenames]). 'glands'/'bones' print
# as the tail of the Sensations chapter (pp. 937/940), right before Skin.
CHAPTERS = [
    ('Mind', ['mind.htm']),
    ('Sensorium', ['sensorium.htm']),
    ('Vertigo', ['vertigo.htm']),
    ('Head, internal', ['headinternal.htm']),
    ('Head, external', ['headexternal.htm']),
    ('Eyes', ['eyes.htm']),
    ('Eyes, vision', ['vision.htm']),
    ('Ears', ['ears.htm']),
    ('Nose', ['nose.htm']),
    ('Nose, coryza', ['coryza.htm']),
    ('Face', ['face.htm']),
    ('Teeth', ['teeth.htm']),
    ('Mouth', ['mouth.htm']),
    ('Appetite', ['appetite.htm']),
    ('Thirst', ['thirst.htm']),
    ('Taste', ['taste.htm']),
    ('Eructation', ['eructation.htm']),
    ('Waterbrash and heartburn', ['waterbrash.htm']),
    ('Hiccough', ['hiccough.htm']),
    ('Nausea and vomiting', ['nausea.htm']),
    ('Stomach and epigastrium', ['stomach.htm']),
    ('Hypochondria', ['hypochondria.htm']),
    ('Abdomen', ['abdomen.htm']),
    ('Abdomen, external', ['abdomenexternal.htm']),
    ('Inguinal and pubic region', ['inguinal.htm']),
    ('Flatulence', ['flatulence.htm']),
    ('Stool', ['stool.htm']),
    ('Anus and rectum', ['anus.htm']),
    ('Perineum', ['perineum.htm']),
    ('Prostate gland', ['prostate.htm']),
    ('Urine', ['urine.htm']),
    ('Urinary organs', ['urinary.htm']),
    ('Genitalia', ['genitalia.htm']),
    ('Male organs', ['male.htm']),
    ('Female organs', ['female.htm']),
    ('Sexual impulse', ['sexual.htm']),
    ('Menstruation', ['menstruation.htm']),
    ('Respiration', ['respiration.htm']),
    ('Cough', ['cough.htm']),
    ('Larynx and trachea', ['larynx.htm']),
    ('Voice and speech', ['voice.htm']),
    ('Neck and external throat', ['neck.htm']),
    ('Chest', ['chest.htm']),
    ('Back', ['back.htm']),
    ('Upper extremities', ['upperextremities.htm']),
    ('Lower extremities', ['lowerextremities.htm']),
    ('Sensations and complaints in general',
     [f'sensations{c}.htm' for c in 'abcdefghijklmnopqrstuvw'] + ['glands.htm', 'bones.htm']),
    ('Skin and exterior body', ['skin.htm']),
    ('Sleep', ['sleep.htm']),
    ('Dreams', ['dreams.htm']),
    ('Fever', ['fever.htm']),
    ('Blood', ['blood.htm']),
    ('Circulation', ['circulation.htm']),
    ('Fever, chill, etc', ['feverchill.htm']),
    ('Heat and fever in general', ['heat.htm']),
    ('Sweat', ['sweat.htm']),
    ('Compound fever', ['compoundfever.htm']),
    ('Conditions in general, time', ['time.htm']),
    ('Conditions of aggravation and amelioration in general',
     [f'conditions{c}.htm' for c in 'abcdefghijklmnopqrstuvwy']),
]

TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>')
COLOR = re.compile(r'color\s*=\s*"?#?([0-9a-fA-F]{6})', re.I)
COMPARE = re.compile(r'\(\s*Compare\b.*?\)', re.I | re.S)
# A remedy list is sometimes wholly or partly a cross-reference — '(See Fever,
# Heat, Concomitants.)' — rather than remedies. Left unstripped, its words
# ('Fever', 'Heat', 'Concomitants', …) pass the token shape test and get
# recorded as if they were remedy abbreviations.
SEEREF = re.compile(r'\(\s*See\b.*?\)', re.I | re.S)
# '&nbsp;' unescapes to U+00A0, which Python's Unicode-aware \s matches.
SPLIT = re.compile(r'\s*:-\s*')
CP1252_FIX = {c: bytes([c]).decode('cp1252', 'replace') for c in range(0x80, 0xA0)}


def unescape(s):
    return html.unescape(s).translate(CP1252_FIX)


class Para:
    __slots__ = ('runs', 'depth')

    def __init__(self, runs, depth):
        self.runs, self.depth = runs, depth

    @property
    def text(self):
        return ''.join(t for t, *_ in self.runs)


def walk(path):
    """Linearise one chapter file into paragraphs of (text, bold, ital, underline, color) runs."""
    src = open(path, encoding='latin-1').read()
    depth = bold = ital = under = 0
    colors, out = [], []
    runs, inp, pdepth = [], False, 0
    pos = 0
    for m in TAG.finditer(src):
        chunk = src[pos:m.start()]
        pos = m.end()
        if inp and chunk:
            runs.append((unescape(chunk), bold > 0, ital > 0, under > 0,
                         colors[-1] if colors else ''))
        close, tag, attr = m.group(1) == '/', m.group(2).lower(), m.group(3)
        if tag == 'dir':
            depth = max(0, depth + (-1 if close else 1))
        elif tag == 'p':
            if close:
                if inp:
                    out.append(Para(runs, pdepth))
                inp, runs = False, []
            else:
                if inp and runs:                       # a missing </p>
                    out.append(Para(runs, pdepth))
                inp, runs, pdepth = True, [], depth
                bold = ital = under = 0
                colors = []
        elif tag in ('b', 'strong'):
            bold = max(0, bold + (-1 if close else 1))
        elif tag in ('i', 'em'):
            ital = max(0, ital + (-1 if close else 1))
        elif tag == 'u':
            under = max(0, under + (-1 if close else 1))
        elif tag == 'font':
            if close:
                if colors:
                    colors.pop()
            else:
                c = COLOR.search(attr)
                colors.append(c.group(1).lower() if c else (colors[-1] if colors else ''))
    if inp and runs:
        out.append(Para(runs, pdepth))
    return out


def grade_of(bold, ital, under, color):
    if bold and under:
        return 4
    if bold or color == 'ff0000':
        return 3
    if ital or color == '0000ff':
        return 2
    return 1


TOKEN_OK = re.compile(r'^[A-Za-zÆæŒœ][A-Za-z0-9ÆæŒœ\-\'\.]{0,24}$')
SKIP_WORDS = {'see', 'and', 'or', 'etc', 'compare'}


def remedy_tokens(runs, offset):
    """(abbrev, grade) tokens from `runs`, starting `offset` chars in.

    Built per-character rather than per-run: a '(See …)' cross-reference can
    start or end mid-run, and stripping it from the flattened text first (then
    re-slicing per run) would either miss it or misalign the grade a token's
    characters are read from.
    """
    chars = []                             # (char, bold, ital, under, color)
    for text, bold, ital, under, color in runs:
        for ch in text:
            chars.append((ch, bold, ital, under, color))
    tail = chars[offset:]
    flat = ''.join(c[0] for c in tail)
    keep = bytearray(b'\x01' * len(flat))
    for m in SEEREF.finditer(flat):
        for i in range(m.start(), m.end()):
            keep[i] = 0

    out = []
    piece = []                             # current comma-separated run of chars
    def flush():
        if not piece:
            return
        text = ''.join(c[0] for c in piece)
        tok = text.strip().strip('.').strip().strip('()[]*').strip()
        if tok and TOKEN_OK.match(tok) and tok.lower() not in SKIP_WORDS:
            g = grade_of(piece[0][1], piece[0][2], piece[0][3], piece[0][4])
            out.append((tok, g))
        piece.clear()

    for i, c in enumerate(tail):
        if not keep[i]:
            flush()
            continue
        if c[0] in ',;':
            flush()
        else:
            piece.append(c)
    flush()
    return out


class Rubric:
    __slots__ = ('chapter', 'path', 'name', 'level', 'remedies')

    def __init__(self, chapter, path, remedies):
        self.chapter = chapter
        self.path = path
        self.level = len(path)
        self.name = ', '.join(path)
        self.remedies = remedies

    def __repr__(self):
        return f'<{self.chapter} {self.name} ({len(self.remedies)})>'


class PathStack:
    def __init__(self):
        self.levels = {}

    def set(self, level, name):
        for k in [k for k in self.levels if k >= level]:
            del self.levels[k]
        self.levels[level] = name

    def path(self, level):
        return [self.levels[k] for k in sorted(self.levels) if k <= level]


def parse_file(path, chapter, stats, out):
    stack = PathStack()
    base = None
    for para in walk(path):
        # remedy_tokens() walks para.runs character-for-character, so the split
        # position must be found in that SAME unmodified concatenation — collapsing
        # whitespace first (as the old `raw` did) shortens the string and shifts
        # every offset after it, spilling the heading's last few characters
        # ('...bemoaning' -> stray token 'ng') into the remedy list.
        raw = para.text
        if not raw.strip():
            continue
        m = SPLIT.search(raw)
        if not m:
            continue                       # decorative banner / letter divider / alphabet nav
        if base is None:
            base = para.depth
        level = max(1, para.depth - base + 1)

        name_part = SEEREF.sub(' ', COMPARE.sub(' ', raw[:m.start()]))
        name = re.sub(r'\s+', ' ', name_part).strip(' ,;:.-*')
        if not name:
            stats['blank_name'] += 1
            continue

        stack.set(level, name)
        toks = remedy_tokens(para.runs, m.end())
        if not toks:
            stats['no_remedies'] += 1          # a hollow heading — fine, its children carry the remedies
            continue
        out.append(Rubric(chapter, stack.path(level), toks))


def parse_all(mirror, verbose=True):
    stats = collections.Counter()
    rubs = []
    for chapter, files in CHAPTERS:
        for fn in files:
            fp = os.path.join(mirror, fn)
            if os.path.exists(fp):
                parse_file(fp, chapter, stats, rubs)
            else:
                stats['missing_file'] += 1
    if verbose:
        print(f'rubrics parsed  : {len(rubs)}')
        print(f'skipped         : {dict(stats)}')
    return rubs


# ---------------------------------------------------------------- resolver
# Fold: lowercase, strip trailing dot. The vast majority of this book's
# abbreviations already match our roster ids directly ('am-c', 'nux-v', …),
# cross-checked against the book's own abbreviations.htm key. A handful name
# the same substance our roster carries under a different id/spelling:
ALIASES = {
    'helo': 'helod',        # Heloderma Horridus == our Heloderma
    'ant-ar': 'ant-a',      # Antimonium Arsenicicum == our Antimonium Arsenicosum
    'solid': 'sol-v',       # Solidago Virgaurea == our Solidago Virg. aur.
    'croto-t': 'crot-t', 'æsc': 'aesc', 'æth': 'aeth', 'm-arct': 'mag-arct',
    'm-aust': 'mag-aust', 'ascl': 'asc-c', 'œna': 'oena', 'rad-br': 'radm',
    'bar-acet': 'bar-ac', 'amyg-am': 'amyg', 'lappa': 'lappa-a', 'pæon': 'paeon',
    'caus': 'caust', 'vio-o': 'viol-o', 'both-l': 'both', 'm-p-a': 'mag-p-a',
    'merc-aur': 'merc-c', 'calc-acet': 'calc-ac', 'scroph-n': 'scroph',
    # short repeat-forms the printed book itself uses after a remedy's first
    # full mention in a list ('Sulph., ... Sul.') — not a parsing artifact
    'sul': 'sulph', 'pho': 'phos', 'spo': 'spong', 'cup': 'cupr', 'hyo': 'hyos',
    'lau': 'laur', 'pul': 'puls', 'stra': 'stram', 'stap': 'staph',
    'irid': 'iridium', 'kali-acet': 'kali-a',
}
# Cited by this repertory but genuinely absent from the roster (no Kent/
# Boericke/Clarke entry exists for the same substance) — dropped rather than
# guessed, same policy as Kent's own AMBIGUOUS set.
AMBIGUOUS = {
    'usn', 'lol', 'old-h', 'pix', 'zinc-pic', 'zinc-val', 'stann-i', 'vero-b',
    'uran-m', 'mgs', 'm-art', 'ichth', 'fuc', 'frax', 'diph', 'dict', 'cine',
    'cryp', 'cupr-o', 'cupress', 'cocain', 'cadm-m', 'calc-hp', 'calc-pic',
    'carbn-chl', 'am-i', 'am-p', 'aven', 'lac-ac', 'lac-v-f', 'meli-a', 'orni',
    'pop-c', 'psoral', 'pyre-o', 'rham-cal', 'scorp', 'sulfonal', 'teucr-s',
    'sol', 'helio', 'irid-m', 'kali-perm', 'cadm-s', 'carbn-s', 'epip',
    'carbn-o', 'form-ac', 'merc-au', 'just', 'lact-v',
}


def fold(tok):
    return tok.lower().rstrip('.')


def build_resolver(roster_ids):
    ids = set(roster_ids)

    def resolve(tok):
        f = fold(tok)
        f = ALIASES.get(f, f)
        if f in AMBIGUOUS or f not in ids:
            return None
        return f
    return resolve


if __name__ == '__main__':
    import sys, json
    mirror = sys.argv[1]
    roster = json.load(open(sys.argv[2], encoding='utf-8'))['remedies']
    ids = [r['id'] for r in roster]
    resolve = build_resolver(ids)

    rubs = parse_all(mirror)
    by_ch = collections.Counter(r.chapter for r in rubs)
    for name, _files in CHAPTERS:
        print(f'  {name:<45} {by_ch.get(name, 0):>5}')
    g = collections.Counter(gr for r in rubs for _, gr in r.remedies)
    print('grade entries   :', sum(g.values()), dict(sorted(g.items())))
    print('levels          :', dict(sorted(collections.Counter(r.level for r in rubs).items())))

    unknown = collections.Counter(fold(t) for r in rubs for t, _ in r.remedies if resolve(t) is None)
    print('unresolved toks :', sum(unknown.values()), '| distinct', len(unknown))
    print('  top:', unknown.most_common(40))
    print('sample rubrics:')
    for r in rubs[:3] + rubs[len(rubs) // 2:len(rubs) // 2 + 3]:
        print('   ', r.chapter, '|', r.name[:60], '->', r.remedies[:4])
