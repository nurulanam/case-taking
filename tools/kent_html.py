# -*- coding: utf-8 -*-
"""Parse the Médi-T HTML edition of Kent's Repertory into structured rubrics.

The HTML (Word 97 export, http://homeoint.org/books/kentrep/) is the only freely
readable Kent edition that still carries the *typography*, and in Kent the
typography IS the data:

    <b><font COLOR="#ff0000">Apis.</b></font>   bold red     -> grade 3
    <i><font COLOR="#0000ff">acon.</font></i>   italic blue  -> grade 2
    ars.                                        plain        -> grade 1

Sub-rubric nesting is real <dir> nesting, so the hierarchy is recoverable too;
that is what the archive.org OCR could not give us (see import_kent_pd.py).

    from kent_html import parse_all
    rubrics = parse_all('/path/to/mirror')   # -> list[Rubric]

Nothing here is network-aware: point it at a local mirror of the page files
(kent0000.htm ... kent1460.htm) plus the chapter index files.
"""
import os, re, html, collections

# ---------------------------------------------------------------- chapter map
# chapter index filename -> (Kent chapter order, English name)
CHAPTER_FILES = {
    'kentmind': (1, 'Mind'),            'kentvert': (2, 'Vertigo'),
    'kenthead': (3, 'Head'),            'kenteye': (4, 'Eye'),
    'kentvisi': (5, 'Vision'),          'kentear': (6, 'Ear'),
    'kenthear': (7, 'Hearing'),         'kentnose': (8, 'Nose'),
    'kentface': (9, 'Face'),            'kentmout': (10, 'Mouth'),
    'kentteet': (11, 'Teeth'),          'kentthro': (12, 'Throat'),
    'kentexth': (13, 'External throat'), 'kentstom': (14, 'Stomach'),
    'kentabdo': (15, 'Abdomen'),        'kentrect': (16, 'Rectum'),
    'kentstoo': (17, 'Stool'),          'kenturor': (18, 'Urinary organs'),
    'kentblad': (19, 'Bladder'),        'kentkidn': (20, 'Kidneys'),
    'kentpros': (21, 'Prostate gland'), 'kenturet': (22, 'Urethra'),
    'kenturin': (23, 'Urine'),          'kentgenm': (24, 'Genitalia male'),
    'kentgenf': (25, 'Genitalia female'), 'kentlary': (26, 'Larynx & trachea'),
    'kentresp': (27, 'Respiration'),    'kentcoug': (28, 'Cough'),
    'kentexpe': (29, 'Expectoration'),  'kentches': (30, 'Chest'),
    'kentback': (31, 'Back'),           'kentextr': (32, 'Extremities'),
    'kentslee': (33, 'Sleep'),          'kentchil': (34, 'Chill'),
    'kentfeve': (35, 'Fever'),          'kentpers': (36, 'Perspiration'),
    'kentskin': (37, 'Skin'),           'kentgene': (38, 'Generalities'),
}
CHAPTER_UPPER = {v[1].upper(): v for v in CHAPTER_FILES.values()}
CHAPTER_UPPER['LARYNX AND TRACHEA'] = CHAPTER_FILES['kentlary']
CHAPTER_UPPER['EXTERNAL THROAT'] = CHAPTER_FILES['kentexth']

TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>')
COLOR = re.compile(r'color\s*=\s*"?#?([0-9a-fA-F]{6})', re.I)
HREF = re.compile(r'href\s*=\s*"([^"]+)"', re.I)
ANAME = re.compile(r'name\s*=\s*"P(\d+)"', re.I)
RULE = re.compile(r'^[-\s>»<«*]+$')
SEE = re.compile(r'\(\s*See\b(.*?)\)', re.I | re.S)
# 'HEAD p. 156' and 'HEADp. 155' both occur — a \b before the p only matches the
# spaced form, which silently turned every unspaced banner into a rubric heading.
PAGEREF = re.compile(r'p\.\s*\d+\s*$')
FOOTER = re.compile(r'copyright|medi-t|all rights reserved', re.I)

# ':' separates rubric text from the remedy list. The export is inconsistent
# about the space before it ('Sleepiness:' vs 'Abrupt : '), and requiring one
# silently glues a 2000-character remedy list onto the rubric name.
SPLIT = re.compile(r'\s*:(?=\s|$)')


CP1252_FIX = {c: bytes([c]).decode('cp1252', 'replace') for c in range(0x80, 0xA0)}


def unescape(s):
    """html.unescape + the windows-1252 numeric references this export uses.

    The pages write œ as '&#156;', which is a C1 control character in Unicode —
    'diarrh&#156;a' would otherwise decode to an unsearchable 'diarrh\\x9ca'.
    """
    return html.unescape(s).translate(CP1252_FIX)


class Para:
    __slots__ = ('runs', 'depth', 'chapter', 'page', 'file')

    def __init__(self, runs, depth, chapter, page, file):
        self.runs, self.depth, self.chapter, self.page, self.file = runs, depth, chapter, page, file

    @property
    def text(self):
        return ''.join(t for t, _, _, _ in self.runs)


def walk(path):
    """Linearise one page file into paragraphs of style-tagged runs.

    Word's export nests tags illegally (``<b><p>NAME</b> : ...``), so bold and
    italic are tracked as clamped counters rather than a stack, and both are
    reset at every <p> — a remedy list never begins in a previous paragraph.
    """
    src = open(path, encoding='latin-1').read()
    base = os.path.basename(path)
    depth = bold = ital = 0
    colors, out = [], []
    chapter = page = None
    pending_chapter = None
    runs, inp, pdepth = [], False, 0
    pos = 0
    for m in TAG.finditer(src):
        chunk = src[pos:m.start()]
        pos = m.end()
        if inp and chunk.strip():
            runs.append((unescape(chunk), bold > 0, ital > 0,
                         colors[-1] if colors else ''))
        close, tag, attr = m.group(1) == '/', m.group(2).lower(), m.group(3)
        if tag == 'dir':
            depth = max(0, depth + (-1 if close else 1))
        elif tag == 'p':
            if close:
                if inp:
                    out.append(Para(runs, pdepth, chapter, page, base))
                inp, runs = False, []
            else:
                if inp and runs:                       # a missing </p>
                    out.append(Para(runs, pdepth, chapter, page, base))
                inp, runs, pdepth = True, [], depth
                bold = ital = 0
                colors = []
                pending_chapter = None
        elif tag == 'b' or tag == 'strong':
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
        elif tag == 'a' and not close:
            h = HREF.search(attr)
            if h:
                stem = os.path.basename(h.group(1)).split('#')[0].split('.')[0].lower()
                if stem in CHAPTER_FILES:
                    # Only the page banner sets the chapter. A body cross-reference
                    # — '(See Genitalia)' — also links to a chapter file, and
                    # honouring it would misfile every rubric that follows.
                    pending_chapter = CHAPTER_FILES[stem]
            n = ANAME.search(attr)
            if n:
                page = int(n.group(1))
                if pending_chapter:
                    chapter, pending_chapter = pending_chapter, None
    if inp and runs:
        out.append(Para(runs, pdepth, chapter, page, base))
    return out


def grade_of(bold, ital, color):
    if bold or color == 'ff0000':
        return 3
    if ital or color == '0000ff':
        return 2
    return 1


TOKEN_OK = re.compile(r'^[A-Za-zÆæŒœ][A-Za-z0-9ÆæŒœ\-\'\. ]{0,24}$')


def remedy_tokens(runs, offset):
    """Extract (abbrev, grade) from the run list, starting `offset` chars in.

    Grade comes from the style of the run the token sits in, so the split has to
    happen run by run — flattening to text first would throw the typography away.
    """
    seen = 0
    out = []
    for text, bold, ital, color in runs:
        start = 0
        if seen + len(text) <= offset:
            seen += len(text)
            continue
        if seen < offset:
            start = offset - seen
        seg = text[start:]
        seen += len(text)
        g = grade_of(bold, ital, color)
        for piece in re.split(r'[,;]', seg):
            tok = piece.strip().strip('.').strip()
            tok = tok.strip('()[]').strip()
            if not tok or not TOKEN_OK.match(tok):
                continue
            out.append((tok, g))
    return out


def clean_name(txt):
    """Strip page refs and cross-references; return (name, see_also)."""
    see = [s.strip(' .,') for s in SEE.findall(txt)]
    txt = SEE.sub(' ', txt)
    txt = re.sub(r'\(\s*\)', ' ', txt)
    txt = re.sub(r'\s+', ' ', txt).strip(' ,;:')
    return txt, see


def is_main(name):
    """Kent prints a main rubric's catchword in capitals."""
    w = re.split(r'[ ,]', name.strip(), 1)[0].strip('()')
    return len(w) >= 2 and w.isupper() and any(c.isalpha() for c in w)


def tidy_caps(name):
    """'Sexual PASSION diminished' -> 'Sexual passion diminished'.

    Kent shouts the catchword so the eye can find it in a column; inside a
    normal-cased UI list that shouting reads as an error.
    """
    words = name.split(' ')
    out = []
    for i, w in enumerate(words):
        core = w.strip('(),.;:')
        # hyphens and apostrophes are part of Kent's catchwords ('ABSENT-MINDED',
        # 'SHOEMAKER'S cramp'), so they must not disqualify the caps test
        alpha = core.replace('-', '').replace("'", '')
        if len(core) >= 2 and core.isupper() and alpha.isalpha():
            lo = w.lower()
            out.append(lo.capitalize() if i == 0 else lo)
        else:
            out.append(w)
    s = ' '.join(out)
    return s[:1].upper() + s[1:] if s else s


class Rubric:
    __slots__ = ('chapter_no', 'chapter', 'path', 'name', 'remedies', 'page', 'level', 'see')

    def __init__(self, chapter_no, chapter, path, remedies, page, see):
        self.chapter_no, self.chapter = chapter_no, chapter
        self.path = path
        self.level = len(path)
        # Kent capitalises sub-headings ('Pain, Forehead, in') so the eye can
        # find them in a dense column; in a normal-cased list that reads as an
        # error, so only the first segment keeps its capital.
        segs = [tidy_caps(p) for p in path]
        segs = [segs[0]] + [s[:1].lower() + s[1:] for s in segs[1:]]
        self.name = ', '.join(segs)
        self.remedies = remedies
        self.page = page
        self.see = see

    def __repr__(self):
        return f'<{self.chapter} p{self.page} {self.name} ({len(self.remedies)})>'


SKIP_EXACT = {'KENT', 'TOP', 'INDEX', 'CONTENTS'}


def first_word(s):
    return re.split(r'[ ,;]', s.strip('() '), 1)[0].strip('.,').lower()


class PathStack:
    """The ancestor chain, carried across page and file boundaries.

    Kent's sub-rubrics are printed as bare fragments ('right side', 'morning'),
    so a rubric's real name only exists as the chain of headings above it — and
    that chain routinely spans a page break. Each page reprints the chain as a
    running head; that head is a *banner*, not a rubric, and treating it as one
    is what produced 'Pain, forehead, right side, right side'.
    """

    def __init__(self):
        self.levels = {}          # level (1-based) -> heading text

    def set(self, level, name):
        for k in [k for k in self.levels if k >= level]:
            del self.levels[k]
        self.levels[level] = name

    def path(self, level):
        return [self.levels[k] for k in sorted(self.levels) if k <= level]

    def reset(self):
        self.levels.clear()

    def repair(self, head):
        """Use a page's running head to fix a stale chain. Returns True if used.

        The head cannot be split back into levels — it joins ancestor names with
        ', ' and the names themselves contain commas ('bacon, amel.'). But its
        *catchword* is unambiguous, so it can repair level 1 when the carried
        chain has drifted (chapter change, or a page the export shuffled).
        """
        catch = head.split(',')[0].strip()
        cur = self.levels.get(1)
        if cur and first_word(cur) == first_word(catch):
            return False
        self.set(1, catch)
        return True


def parse_file(path, stack, stats, out):
    """Append this page file's rubrics to `out`, threading `stack` through."""
    base = None
    after_banner = False
    for para in walk(path):
        raw = re.sub(r'\s+', ' ', para.text).strip()
        if not raw or RULE.match(raw) or raw.upper() in SKIP_EXACT or FOOTER.search(raw):
            after_banner = False       # the rule closes the banner block
            continue
        if para.chapter is None:
            stats['no_chapter'] += 1
            continue
        # 'HEADp. 153' — the page banner; the next paragraph is the running head
        if PAGEREF.search(raw) and len(raw) < 40:
            base = para.depth if base is None else min(base, para.depth)
            after_banner = True
            continue
        if base is None:
            base = para.depth
        if raw.upper().rstrip('.').strip() in CHAPTER_UPPER:
            after_banner = False
            continue
        if para.chapter[0] != stats.get('_chapter'):
            stack.reset()                  # a new chapter starts a new chain
            stats['_chapter'] = para.chapter[0]

        # <dir> depth is absolute: banner depth = main rubric depth = level 1
        level = max(1, para.depth - base + 1)

        m = SPLIT.search(raw)
        name_part = raw[:m.start()] if m else raw
        name, see = clean_name(name_part)
        if not name:
            continue

        if after_banner and level <= 1 and not m:
            # Running head — a continuation banner, not a rubric. Storing it
            # would append the whole ancestor chain a second time, which is how
            # 'Pain, forehead, right side, right side' happened.
            if stack.repair(name):
                stats['chain_repaired'] += 1
            after_banner = False
            continue
        after_banner = False

        if level == 1:
            # Kent prints the catchword and its first sub-rubric on one line —
            # 'FOOD, bacon, amel.' is the rubric FOOD with sub 'bacon, amel.'.
            # Keeping the whole line as level 1 would nest every later sibling
            # ('beer agg.') under 'bacon, amel.' instead of under FOOD.
            catch, _, rest = name.partition(',')
            stack.set(1, catch.strip())
            if rest.strip():
                stack.set(2, rest.strip())
                level = 2
        else:
            stack.set(level, name)

        if not m:
            continue                       # heading only; remedies are in children
        toks = remedy_tokens(para.runs, m.end())
        if not toks:
            stats['no_remedies'] += 1
            continue
        out.append(Rubric(para.chapter[0], para.chapter[1], stack.path(level),
                          toks, para.page, see))


def parse_all(mirror, verbose=True):
    files = sorted(f for f in os.listdir(mirror)
                   if re.fullmatch(r'kent\d{4}\.htm', f))
    stats = collections.Counter()
    stack = PathStack()
    rubs = []
    for f in files:
        parse_file(os.path.join(mirror, f), stack, stats, rubs)
    if verbose:
        print(f'page files      : {len(files)}')
        print(f'rubrics parsed  : {len(rubs)}')
        print(f'skipped         : {dict(stats)}')
    return rubs


def abbrev_key(mirror):
    """Abbrev -> full Latin name, from the book's own key page (kentreme.htm)."""
    p = os.path.join(mirror, 'kentreme.htm')
    src = open(p, encoding='latin-1').read()
    txt = re.sub(r'<br[^>]*>', '\n', src, flags=re.I)
    txt = re.sub(r'<[^>]+>', '', txt)
    txt = unescape(txt)
    out = {}
    for line in txt.split('\n'):
        m = re.match(r'\s*(\S{1,18}?)\s*-{3,}\s*(.+?)\s*$', line)
        if not m:
            continue
        ab, full = m.group(1), m.group(2)
        full = re.sub(r'\s+', ' ', full).strip(' .')
        if not full or len(full) < 3:
            continue
        out[ab.lower().rstrip('.')] = full
    return out


def fold(ab):
    """Normalise an abbreviation for lookup: case, trailing dot, æ/œ ligatures.

    Kent's body text and its own key disagree on the ligatures — the key prints
    'Æth.' while the pages print 'aeth.' — so both sides get folded.
    """
    return (ab.lower().rstrip('.').replace('æ', 'ae').replace('œ', 'oe')
            .replace('ae', 'ae'))


# Body abbreviations absent from the key page, resolved from Kent's own usage.
EXTRA_ABBREV = {
    'bism': 'bism-ox',        # 'Bism.' in the text; key lists Bismuthum Oxidum
    'chen-a': 'chen-an',      # Chenopodium Anthelminticum
}
EXTRA_NAMES = {
    'cund': 'Cundurango',     # used throughout Kent, missing from the key page
}
# Abbreviations that are genuinely ambiguous in this edition. Guessing would
# attribute symptoms to the wrong remedy, so they are dropped and counted.
AMBIGUOUS = {'gent', 'ir-f', 'cocaine', 'cocain'}


def build_resolver(mirror):
    """Return (resolve, key) where resolve(token) -> folded abbreviation or None.

    The abbreviation, not the name, is the identity: this edition's key page and
    our curated roster disagree on 66 Latin spellings ('Cantharis' vs 'Cantharis
    Vesicatoria'), so resolving to a name would not join back to the roster.
    `key` maps the same folded abbreviations to the book's Latin names.
    """
    key = {fold(k): v for k, v in abbrev_key(mirror).items()}
    key.update({k: key[v] for k, v in EXTRA_ABBREV.items() if v in key})
    key.update(EXTRA_NAMES)

    def resolve(tok):
        f = fold(tok)
        if f in AMBIGUOUS or f not in key:
            return None
        return f
    return resolve, key


if __name__ == '__main__':
    import sys
    mirror = sys.argv[1]
    key = abbrev_key(mirror)
    print('abbreviations   :', len(key))
    rubs = parse_all(mirror)
    by_ch = collections.Counter(r.chapter for r in rubs)
    for n, name in sorted(CHAPTER_FILES.values()):
        print(f'  {n:>2}. {name:<18} {by_ch.get(name, 0):>6}')
    g = collections.Counter(gr for r in rubs for _, gr in r.remedies)
    print('grade entries   :', sum(g.values()), dict(sorted(g.items())))
    unknown = collections.Counter(t.lower().rstrip('.') for r in rubs for t, _ in r.remedies
                                  if t.lower().rstrip('.') not in key)
    print('unresolved toks :', sum(unknown.values()), '| distinct', len(unknown))
    print('  top:', unknown.most_common(25))
