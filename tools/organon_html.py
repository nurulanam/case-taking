# -*- coding: utf-8 -*-
"""Parse the Médi-T mirror of Hahnemann's Organon into structured aphorisms.

Same source family as the Kent repertory already in this app
(homeoint.org, Médi-T), so the two references agree on provenance.

The mirror carries BOTH translations side by side — Dudgeon's 5th edition and
Boericke's 6th — and marks an aphorism with an edition label only where the two
actually diverge. §1 has one text; §6 has two. That distinction is Hahnemann's
own revision history and is worth keeping, so an aphorism here is a list of
`versions` rather than a single string.

    <a name="P6E5">§ 6 </a>Fifth Edition      -> number 6, edition '5th'
    <a name="P13">§ 13</a>                    -> number 13, edition None (both)

Footnotes are Hahnemann's own and often carry the argument (§11's footnote is
where the dynamic nature of disease is actually spelled out), so they are kept
attached to their aphorism instead of dropped.
"""
import re, os, html, collections

HERE = os.path.dirname(os.path.abspath(__file__))
MIRROR = os.path.join(HERE, '.cache', 'organon')

BODY_FILES = ['organ001', 'organ020', 'organ040', 'organ060', 'organ080',
              'organ100', 'organ120', 'organ140', 'organ160', 'organ180',
              'organ200', 'organ220', 'organ240', 'organ260', 'organ280']

# <a name="P6E5">§ 6 </a>Fifth Edition
#
# Only the opening tag is matched. The mirror closes </a> inconsistently — §21
# puts it *after* the paragraph break, inside the body's own <p> — so keying on
# the closing tag either swallows the first sentence or runs away looking for a
# </a> that never comes.
ANCHOR = re.compile(r'<a\s+name="P(\d+)(E5|E6)?"[^>]*>', re.I)
PARA = re.compile(r'<p\b[^>]*>(.*?)(?=<p\b|</blockquote>|</body>|\Z)', re.I | re.S)
# a footnote paragraph opens with its own number closing a size-1 font
FOOTNOTE_HEAD = re.compile(r'^\s*(?:<[^>]+>\s*)*?(\d+)\s*</font>', re.I)
# the anchor's own visible label, which is not part of the aphorism
LABEL = re.compile(r'^\s*§?\s*\d*\s*(?:(?:Fifth|Sixth)\s+Edition)?\s*[*.]?\s*$', re.I)

# The scan carries the printed page furniture into the text: a ">>>>> § 140"
# page marker and an "ORGANON OF MEDICINE" running head, which land either as
# their own paragraph or welded onto the tail of whatever footnote was running
# across the page break. Neither is Hahnemann; both must go before anyone
# translates them.
RUNHEAD = re.compile(
    r'\s*(?:>+\s*)?§?\s*\d*\s*(?:(?:Fifth|Sixth)\s+Edition\s*)?'
    r'(?:>+\s*§?\s*\d*\s*(?:(?:Fifth|Sixth)\s+Edition\s*)?)*'
    r'ORGANON\s+OF\s+MEDICINE\s*', re.I)
PAGEMARK = re.compile(r'\s*>+\s*§\s*\d+\s*(?:(?:Fifth|Sixth)\s+Edition)?\s*', re.I)


def _strip_furniture(s):
    """Remove page markers and running heads wherever they landed."""
    s = RUNHEAD.sub(' ', s)
    s = PAGEMARK.sub(' ', s)
    return re.sub(r'\s{2,}', ' ', s).strip()

EDITION = {'E5': '5th', 'E6': '6th', None: None}


def _text(frag):
    """HTML fragment -> plain text, entities resolved, whitespace collapsed."""
    frag = re.sub(r'<br\s*/?>', ' ', frag, flags=re.I)
    frag = re.sub(r'<[^>]+>', '', frag)
    frag = html.unescape(frag)
    frag = frag.replace('\xa0', ' ')
    return re.sub(r'[ \t\r\n]+', ' ', frag).strip()


def _split_body(chunk):
    """One aphorism's HTML -> (body_paragraphs, footnotes).

    Footnotes are numbered and always follow the body, so the first footnote
    marker ends the body — a later plain paragraph belongs to that footnote,
    not back to the main text.
    """
    body, notes = [], []
    cur_note = None
    # the chunk starts mid-paragraph wherever the mirror misplaced </a>, so
    # give it an opening tag of its own — PARA only sees text that follows one
    chunk = '<p>' + chunk
    for m in PARA.finditer(chunk):
        raw = m.group(1)
        fn = FOOTNOTE_HEAD.match(raw)
        txt = _text(raw)
        if fn:
            # strip the leading marker digit off the note's own first line
            txt = re.sub(r'^\s*' + re.escape(fn.group(1)) + r'\s*', '', txt)
            if not txt:
                continue
            cur_note = {'marker': int(fn.group(1)), 'text': txt}
            notes.append(cur_note)
            continue
        txt = _strip_furniture(txt)
        if not txt or LABEL.match(txt):
            continue
        if cur_note is not None:
            cur_note['text'] = (cur_note['text'] + ' ' + txt).strip()
        else:
            body.append(txt)
    return [p for p in body if p], [n for n in notes if n['text']]


def parse_all(mirror=MIRROR, verbose=True):
    """-> [ {number, edition, body:[str], footnotes:[{marker,text}], src} ]"""
    out = []
    for fname in BODY_FILES:
        path = os.path.join(mirror, fname + '.htm')
        raw = open(path, encoding='latin-1').read()
        # keep only the reading area; the nav header repeats the § links and
        # would otherwise register as 300 empty aphorisms
        anchors = list(ANCHOR.finditer(raw))
        for i, m in enumerate(anchors):
            num = int(m.group(1))
            ed = EDITION[m.group(2)]
            end = anchors[i + 1].start() if i + 1 < len(raw) and i + 1 < len(anchors) else len(raw)
            chunk = raw[m.end():end]
            chunk = re.sub(r'^\s*§?\s*\d*\s*</a>', '', chunk, count=1)
            body, notes = _split_body(chunk)
            if not body:
                continue
            out.append({'number': num, 'edition': ed, 'body': body,
                        'footnotes': notes, 'src': fname})
    # a duplicate number+edition means the nav block leaked in; keep the
    # longest, which is always the real reading text
    best = {}
    for a in out:
        key = (a['number'], a['edition'])
        size = sum(len(p) for p in a['body'])
        if key not in best or size > sum(len(p) for p in best[key]['body']):
            best[key] = a
    res = sorted(best.values(), key=lambda a: (a['number'], a['edition'] or ''))
    if verbose:
        nums = sorted({a['number'] for a in res})
        print(f'aphorisms  : {len(res)} records over §{min(nums)}-§{max(nums)}')
        print(f'distinct § : {len(nums)}')
        missing = [n for n in range(1, 292) if n not in set(nums)]
        print(f'missing    : {missing if missing else "none in 1-291"}')
        print(f'footnotes  : {sum(len(a["footnotes"]) for a in res)}')
        print(f'body words : {sum(len(" ".join(a["body"]).split()) for a in res)}')
    return res


if __name__ == '__main__':
    aph = parse_all()
    for a in aph[:3]:
        print()
        print('§', a['number'], a['edition'] or '(both)')
        for p in a['body']:
            print('  ', p[:150])
        for n in a['footnotes']:
            print('   FN', n['marker'], n['text'][:120])
