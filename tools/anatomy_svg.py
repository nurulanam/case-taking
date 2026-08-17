# -*- coding: utf-8 -*-
"""Generate the two body figures in anatomy.html.

Hand-writing bezier coordinates for a symmetrical figure means authoring every
limb twice and getting the mirror subtly wrong; fingers and toes make it worse,
because each one is the same shape at five offsets. So the left side is authored
once and `mir()` reflects it about the midline, and the digits are emitted by a
loop. Regenerating is `python3 tools/anatomy_svg.py`.

Region hit areas stay as transparent bands clipped to the silhouette. The art
below them can get as detailed as it likes without ever stealing a click.
"""
import re, os

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(os.path.dirname(HERE), 'anatomy.html')

W, H = 240, 610
MID = W / 2          # mirror axis

_NUM = re.compile(r'-?\d*\.?\d+')


def mir(d):
    """Reflect an absolute-command path about the midline.

    Only M/L/C/Q/Z with absolute coordinates are used here, so every number
    pair is (x, y) and flipping means x -> W - x. Relative commands would need
    the first pair treated differently, so they are rejected rather than
    silently mangled.
    """
    if re.search(r'[mlcqsahvtz](?=[\s\d\-.])', d):
        raise ValueError('relative path commands are not mirrorable here: ' + d[:40])
    out, i = [], 0
    for tok in re.findall(r'[MLCQZ]|-?\d*\.?\d+', d):
        if tok in 'MLCQZ':
            out.append(tok)
            i = 0
        else:
            out.append(f'{W - float(tok):g}' if i % 2 == 0 else f'{float(tok):g}')
            i += 1
    # re-join: command letters get a space, numbers comma-separated in pairs
    s, n = '', 0
    for tok in out:
        if tok in 'MLCQZ':
            s += ' ' + tok
            n = 0
        else:
            s += (',' if n % 2 else ' ') + tok
            n += 1
    return s.strip()


# ─────────────────────────── silhouette geometry ───────────────────────────
HEAD = dict(cx=120, cy=54, rx=33, ry=40)
# short neck: a long one is what made the earlier figure read as a mannequin
NECK = 'M108,84 L132,84 L133,110 L107,110 Z'

# Shoulders slope, waist pinches, hips flare, and the groin is a curve rather
# than a flat cut — a straight bottom edge is what made the legs look bolted on.
TORSO = ('M62,118 C72,108 94,102 120,102 C146,102 168,108 178,118 '
         'L183,162 C183,180 175,194 169,204 L164,232 '
         'C162,248 163,266 167,282 L169,306 '
         'C169,314 163,320 154,320 C142,320 132,322 120,326 '
         'C108,322 98,320 86,320 C77,320 71,314 71,306 '
         'L73,282 C77,266 78,248 76,232 '
         'L71,204 C65,194 57,180 57,162 Z')

# deltoid swell, elbow narrowing, forearm taper into the wrist
ARM_L = ('M58,120 C47,129 41,150 39,174 '
         'L36,210 C35,222 34,234 33,248 '
         'L32,296 C32,303 36,307 42,307 C48,307 51,303 51,296 '
         'L52,248 C53,234 55,222 56,210 '
         'L60,176 C63,154 69,136 76,127 Z')

# thigh swell, knee, calf belly, ankle
LEG_L = ('M86,322 C82,344 80,366 82,388 '
         'L84,412 C83,426 84,434 86,442 '
         'C89,464 87,488 85,512 L84,532 '
         'C84,540 88,545 93,545 C99,545 103,540 103,532 '
         'L104,512 C106,488 108,464 110,442 '
         'C112,434 113,426 112,412 '
         'L114,388 C116,366 117,344 118,322 Z')


def hand(cx, top):
    """A palm plus four fingers and a thumb, each with a nail.

    Digits are generated rather than drawn: same rounded shape, five offsets,
    lengths following the real pattern (middle longest, little shortest).
    """
    p = []
    # palm
    p.append(f'<path d="M{cx-13},{top} C{cx-14},{top+16} {cx-13},{top+26} {cx-10},{top+30} '
             f'L{cx+10},{top+30} C{cx+13},{top+26} {cx+14},{top+16} {cx+13},{top} Z" '
             f'fill="url(#gSkin)"/>')
    # four fingers: (x offset, length)
    for dx, ln in ((-9.0, 25), (-3.0, 29), (3.0, 27), (8.6, 21)):
        x, y0 = cx + dx, top + 28
        w = 2.7
        p.append(f'<path d="M{x-w},{y0} C{x-w-.5},{y0+ln*.6} {x-w},{y0+ln-3} {x},{y0+ln} '
                 f'C{x+w},{y0+ln-3} {x+w+.5},{y0+ln*.6} {x+w},{y0} Z" fill="url(#gSkin)"/>')
        p.append(f'<ellipse cx="{x}" cy="{y0+ln-3.4:g}" rx="1.7" ry="2.4" '
                 f'fill="var(--an-nail)" opacity=".9"/>')
        p.append(f'<path class="an-crease" d="M{x-w+.6},{y0+ln*.42:g} L{x+w-.6},{y0+ln*.42:g}"/>')
    # thumb, angled off the radial side
    tx = cx - 13
    p.append(f'<path d="M{tx},{top+10} C{tx-8},{top+14} {tx-11},{top+24} {tx-9},{top+32} '
             f'C{tx-6},{top+36} {tx-2},{top+34} {tx-1},{top+29} '
             f'C{tx-2},{top+22} {tx},{top+16} {tx+2},{top+13} Z" fill="url(#gSkin)"/>')
    p.append(f'<ellipse cx="{tx-6.5:g}" cy="{top+31}" rx="2" ry="2.6" '
             f'fill="var(--an-nail)" opacity=".9"/>')
    return '\n                    '.join(p)


def foot(cx, top):
    """Foot seen from the front: instep plus five toes with nails."""
    p = [f'<path d="M{cx-11},{top} C{cx-14},{top+10} {cx-13},{top+20} {cx-9},{top+24} '
         f'L{cx+11},{top+24} C{cx+14},{top+20} {cx+14},{top+8} {cx+11},{top} Z" '
         f'fill="url(#gSkin)"/>']
    for dx, r in ((-7.2, 3.4), (-2.4, 3.0), (1.8, 2.7), (5.6, 2.4), (9.0, 2.0)):
        x, y = cx + dx, top + 26
        p.append(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*1.25:g}" fill="url(#gSkin)"/>')
        p.append(f'<ellipse cx="{x}" cy="{y-r*.35:g}" rx="{r*.55:g}" ry="{r*.55:g}" '
                 f'fill="var(--an-nail)" opacity=".85"/>')
    return '\n                    '.join(p)


# ─────────────────────────── front viscera ───────────────────────────
LUNG_L = ('M114,124 C100,122 88,130 84,146 C80,164 82,186 89,200 '
          'C96,210 109,211 113,204 L114,158 Z')
HEART = ('M117,158 C105,160 99,173 103,187 C107,200 118,208 126,206 '
         'C136,204 142,192 140,178 C138,166 128,156 117,158 Z')
LIVER = 'M79,212 C94,207 114,209 119,218 C121,228 116,238 106,242 C94,246 82,240 79,230 Z'
STOMACH = 'M126,216 C134,209 148,211 152,221 C154,231 147,239 138,239 C129,239 123,231 126,223 Z'
SPLEEN = 'M154,214 C160,212 164,218 163,226 C162,233 156,236 152,232 C149,228 150,217 154,214 Z'
BLADDER = 'M106,304 C111,298 129,298 134,304 C136,312 129,320 120,320 C111,320 104,312 106,304 Z'


def ribs():
    out = []
    for y, x0, x1, cy in ((132, 93, 119, 126), (146, 89, 119, 139), (160, 88, 119, 153),
                          (174, 89, 118, 168), (188, 93, 117, 183)):
        d = f'M{x0},{y} C{x0+12},{cy} {x1-2},{cy-1} {x1},{cy+1}'
        out.append(f'<path d="{d}"/><path d="{mir(d)}"/>')
    return '\n                      '.join(out)


def front_art():
    return f'''<use href="#pArmL" fill="url(#gSkin)"/><use href="#pArmL" class="an-outline-s"/>
                  <use href="#pArmR" fill="url(#gSkin)"/><use href="#pArmR" class="an-outline-s"/>
                  {hand(41, 304)}
                  {hand(199, 304)}
                  <use href="#pLegL" fill="url(#gSkin)"/><use href="#pLegL" class="an-outline-s"/>
                  <use href="#pLegR" fill="url(#gSkin)"/><use href="#pLegR" class="an-outline-s"/>
                  {foot(93, 540)}
                  {foot(147, 540)}
                  <path d="{NECK}" fill="url(#gSkin)"/>
                  <use href="#pTorso" fill="url(#gSkin)"/>

                  <g clip-path="url(#cTorso)">
                    <!-- airway: thyroid, trachea, bronchi -->
                    <path d="M112,102 C116,98 124,98 128,102 C129,110 125,114 120,114 C115,114 111,110 112,102 Z" fill="var(--an-thyroid)" opacity=".85"/>
                    <path d="M117,110 L123,110 L123,140 L117,140 Z" fill="var(--an-bone2)" opacity=".8"/>
                    <path d="M118,138 C110,144 104,150 100,158" class="an-bronchus"/>
                    <path d="{mir('M118,138 C110,144 104,150 100,158')}" class="an-bronchus"/>
                    <!-- clavicles -->
                    <path d="M76,118 C90,112 106,112 114,116" class="an-boneline"/>
                    <path d="{mir('M76,118 C90,112 106,112 114,116')}" class="an-boneline"/>
                    <!-- lungs, heart, ribs, sternum -->
                    <path d="{LUNG_L}" fill="url(#gLung)" opacity=".9"/>
                    <path d="{mir(LUNG_L)}" fill="url(#gLung)" opacity=".9"/>
                    <rect x="117" y="128" width="6" height="60" rx="3" fill="url(#gBone)" opacity=".9"/>
                    <path d="{HEART}" fill="url(#gHeart)"/>
                    <path d="M116,166 C112,172 113,180 118,186" stroke="var(--an-heart2)" stroke-width="1.6" fill="none" opacity=".5"/>
                    <g class="an-rib">
                      {ribs()}
                    </g>
                    <!-- diaphragm -->
                    <path d="M86,204 C100,214 140,214 154,204" class="an-crease" stroke-opacity=".5"/>
                    <!-- kidneys, ureters, adrenals -->
                    <ellipse cx="94" cy="234" rx="8" ry="13" fill="var(--an-kidney)" opacity=".5"/>
                    <ellipse cx="146" cy="234" rx="8" ry="13" fill="var(--an-kidney)" opacity=".5"/>
                    <path d="M96,246 C100,268 104,288 112,300" class="an-ureter"/>
                    <path d="{mir('M96,246 C100,268 104,288 112,300')}" class="an-ureter"/>
                    <!-- liver, gallbladder, stomach, spleen, pancreas -->
                    <path d="{LIVER}" fill="url(#gLiver)"/>
                    <ellipse cx="104" cy="240" rx="5" ry="7" fill="var(--an-gall)" opacity=".9"/>
                    <path d="{STOMACH}" fill="url(#gStom)"/>
                    <path d="{SPLEEN}" fill="var(--an-spleen)" opacity=".85"/>
                    <path d="M104,232 C116,228 134,229 146,234" stroke="var(--an-pancreas)" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8"/>
                    <!-- colon frame, small bowel coils, appendix -->
                    <path class="an-gutline" d="M92,294 L92,252 C92,243 101,238 120,238 C139,238 148,243 148,252 L148,294 C148,302 140,306 130,306"/>
                    <g class="an-gutline" stroke-width="4.2" opacity=".8">
                      <path d="M104,258 C118,252 134,256 138,264 C140,272 130,276 118,274"/>
                      <path d="M106,280 C120,274 134,278 136,286"/>
                      <path d="M108,294 C120,300 132,298 138,292"/>
                    </g>
                    <path d="M94,296 C92,302 94,307 98,309" stroke="var(--an-gut2)" stroke-width="3" stroke-linecap="round" fill="none"/>
                    <path d="{BLADDER}" fill="url(#gBlad)"/>
                    <!-- surface: pectorals, linea alba, rectus bands, inguinal -->
                    <g class="an-crease">
                      <path d="M97,150 C107,159 133,159 143,150"/>
                      <path d="M92,132 C98,146 100,158 99,168"/>
                      <path d="{mir('M92,132 C98,146 100,158 99,168')}"/>
                      <path d="M120,206 L120,300"/>
                      <path d="M101,234 L139,234"/><path d="M103,260 L137,260"/><path d="M105,286 L135,286"/>
                      <path d="M84,292 C97,304 143,304 156,292"/>
                    </g>
                  </g>
                  <use href="#pTorso" class="an-outline-s"/>

                  <use href="#pHead" fill="url(#gHead)"/>
                  <g clip-path="url(#cHead)">
                    <path d="M89,43 C90,21 105,13 120,13 C135,13 150,21 151,43 C144,31 133,26 120,26 C107,26 96,31 89,43 Z" fill="var(--an-hair)"/>
                    <path d="M90,86 C100,74 140,74 150,86 L150,92 L90,92 Z" fill="var(--an-skin4)" opacity=".3"/>
                  </g>
                  <use href="#pHead" class="an-outline-s"/>
                  <path d="M90,48 C83,46 81,58 85,64 C88,68 91,66 91,62 Z" fill="url(#gSkin)"/>
                  <path d="M88,52 C86,55 87,60 89,62" class="an-crease"/>
                  <path d="{mir('M90,48 C83,46 81,58 85,64 C88,68 91,66 91,62 Z')}" fill="url(#gSkin)"/>
                  <path d="{mir('M88,52 C86,55 87,60 89,62')}" class="an-crease"/>
                  <g class="an-crease" stroke-width="1.8" stroke-opacity=".55">
                    <path d="M99,43 C104,40 111,40 115,42"/>
                    <path d="{mir('M99,43 C104,40 111,40 115,42')}"/>
                  </g>
                  <ellipse cx="107" cy="50" rx="7.2" ry="4.3" fill="#fff" opacity=".93"/>
                  <ellipse cx="133" cy="50" rx="7.2" ry="4.3" fill="#fff" opacity=".93"/>
                  <circle cx="107" cy="50" r="2.9" fill="var(--an-iris)"/>
                  <circle cx="133" cy="50" r="2.9" fill="var(--an-iris)"/>
                  <circle cx="107" cy="50" r="1.2" fill="#14100c"/>
                  <circle cx="133" cy="50" r="1.2" fill="#14100c"/>
                  <circle cx="105.6" cy="48.6" r=".9" fill="#fff" opacity=".85"/>
                  <circle cx="131.6" cy="48.6" r=".9" fill="#fff" opacity=".85"/>
                  <path d="M100,47 C104,44 111,44 114,47" class="an-crease" stroke-opacity=".45"/>
                  <path d="{mir('M100,47 C104,44 111,44 114,47')}" class="an-crease" stroke-opacity=".45"/>
                  <path d="M120,52 L115,66 L125,66 Z" fill="var(--an-skin3)" opacity=".4"/>
                  <path d="M116,68 C117,70 119,70 120,68" class="an-crease"/>
                  <path d="{mir('M116,68 C117,70 119,70 120,68')}" class="an-crease"/>
                  <path d="M118,70 L118,74" class="an-crease" stroke-opacity=".3"/>
                  <path d="M111,77 C115,74 125,74 129,77 C125,82 115,82 111,77 Z" fill="var(--an-lips)" opacity=".7"/>
                  <path d="M111,77 C116,78 124,78 129,77" class="an-crease"/>
                  <path d="M106,84 C110,94 130,94 134,84 L134,90 C130,98 110,98 106,90 Z" fill="var(--an-skin4)" opacity=".38"/>
                  <path d="M110,96 C114,104 116,108 116,112" class="an-crease"/>
                  <path d="{mir('M110,96 C114,104 116,108 116,112')}" class="an-crease"/>'''


def back_art():
    verts = []
    y, i = 106, 0
    while y < 268:
        w = 10 + i * 0.55
        h = 7 + i * 0.28
        verts.append(f'<rect x="{120-w/2:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="3"/>')
        y += h + 3.4
        i += 1
    scap = 'M94,128 C106,126 113,134 112,149 C111,162 101,168 94,163 C87,157 86,137 94,128 Z'
    ilium = 'M88,280 C97,274 110,276 113,286 L113,300 L95,300 C88,296 84,287 88,280 Z'
    lat = 'M82,150 C93,176 97,202 97,228'
    return f'''<use href="#pArmL" fill="url(#gSkin)"/><use href="#pArmL" class="an-outline-s"/>
                  <use href="#pArmR" fill="url(#gSkin)"/><use href="#pArmR" class="an-outline-s"/>
                  {hand(41, 304)}
                  {hand(199, 304)}
                  <use href="#pLegL" fill="url(#gSkin)"/><use href="#pLegL" class="an-outline-s"/>
                  <use href="#pLegR" fill="url(#gSkin)"/><use href="#pLegR" class="an-outline-s"/>
                  {foot(93, 540)}
                  {foot(147, 540)}
                  <path d="{NECK}" fill="url(#gSkin)"/>
                  <use href="#pTorso" fill="url(#gSkin)"/>

                  <g clip-path="url(#cTorso)">
                    <path d="{scap}" fill="url(#gBone)" opacity=".8"/>
                    <path d="{mir(scap)}" fill="url(#gBone)" opacity=".8"/>
                    <path d="M76,120 C90,114 106,114 114,118" class="an-boneline"/>
                    <path d="{mir('M76,120 C90,114 106,114 114,118')}" class="an-boneline"/>
                    <g fill="url(#gBone)">
                      {''.join(verts)}
                      <path d="M110,268 L130,268 L127,300 L113,300 Z"/>
                    </g>
                    <!-- floating ribs, seen from behind -->
                    <g class="an-rib" opacity=".55">
                      <path d="M96,150 C104,158 110,162 114,164"/>
                      <path d="{mir('M96,150 C104,158 110,162 114,164')}"/>
                      <path d="M94,170 C102,178 109,182 113,184"/>
                      <path d="{mir('M94,170 C102,178 109,182 113,184')}"/>
                    </g>
                    <path d="{ilium}" fill="url(#gBone)" opacity=".7"/>
                    <path d="{mir(ilium)}" fill="url(#gBone)" opacity=".7"/>
                    <g class="an-crease">
                      <path d="M101,112 C110,128 130,128 139,112"/>
                      <path d="{lat}"/><path d="{mir(lat)}"/>
                      <path d="M120,302 L120,318"/>
                      <path d="M88,298 C99,312 141,312 152,298"/>
                      <path d="M104,240 C110,244 130,244 136,240"/>
                    </g>
                  </g>
                  <use href="#pTorso" class="an-outline-s"/>

                  <use href="#pHead" fill="url(#gHead)"/>
                  <g clip-path="url(#cHead)">
                    <path d="M88,58 C86,25 103,13 120,13 C137,13 154,25 152,58 C152,72 144,84 120,84 C96,84 88,72 88,58 Z" fill="var(--an-hair)"/>
                    <path d="M120,22 C113,38 111,56 113,84" stroke="#000" stroke-opacity=".16" stroke-width="2" fill="none"/>
                    <path d="M128,24 C136,40 140,58 139,84" stroke="#000" stroke-opacity=".1" stroke-width="2" fill="none"/>
                  </g>
                  <use href="#pHead" class="an-outline-s"/>
                  <path d="M90,48 C83,46 81,58 85,64 C88,68 91,66 91,62 Z" fill="url(#gSkin)"/>
                  <path d="{mir('M90,48 C83,46 81,58 85,64 C88,68 91,66 91,62 Z')}" fill="url(#gSkin)"/>'''


DEFS = f'''<defs>
                  <linearGradient id="gSkin" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="var(--an-skin3)"/><stop offset="13%" stop-color="var(--an-skin1)"/>
                    <stop offset="45%" stop-color="var(--an-skin2)"/><stop offset="79%" stop-color="var(--an-skin3)"/>
                    <stop offset="100%" stop-color="var(--an-skin4)"/>
                  </linearGradient>
                  <radialGradient id="gHead" cx="36%" cy="28%" r="80%">
                    <stop offset="0%" stop-color="var(--an-skin1)"/><stop offset="52%" stop-color="var(--an-skin2)"/>
                    <stop offset="100%" stop-color="var(--an-skin4)"/>
                  </radialGradient>
                  <linearGradient id="gLung" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="var(--an-lung1)"/><stop offset="100%" stop-color="var(--an-lung2)"/>
                  </linearGradient>
                  <radialGradient id="gHeart" cx="34%" cy="28%" r="82%">
                    <stop offset="0%" stop-color="var(--an-heart1)"/><stop offset="100%" stop-color="var(--an-heart2)"/>
                  </radialGradient>
                  <linearGradient id="gLiver" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="var(--an-liver1)"/><stop offset="100%" stop-color="var(--an-liver2)"/>
                  </linearGradient>
                  <linearGradient id="gStom" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="var(--an-stom1)"/><stop offset="100%" stop-color="var(--an-stom2)"/>
                  </linearGradient>
                  <radialGradient id="gBlad" cx="38%" cy="28%" r="82%">
                    <stop offset="0%" stop-color="var(--an-blad1)"/><stop offset="100%" stop-color="var(--an-blad2)"/>
                  </radialGradient>
                  <linearGradient id="gBone" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="var(--an-bone1)"/><stop offset="100%" stop-color="var(--an-bone2)"/>
                  </linearGradient>

                  <path id="pTorso" d="{TORSO}"/>
                  <path id="pArmL" d="{ARM_L}"/>
                  <path id="pArmR" d="{mir(ARM_L)}"/>
                  <path id="pLegL" d="{LEG_L}"/>
                  <path id="pLegR" d="{mir(LEG_L)}"/>
                  <ellipse id="pHead" cx="{HEAD['cx']}" cy="{HEAD['cy']}" rx="{HEAD['rx']}" ry="{HEAD['ry']}"/>

                  <clipPath id="cTorso"><use href="#pTorso"/></clipPath>
                  <clipPath id="cHead"><use href="#pHead"/></clipPath>
                </defs>'''

FRONT_HITS = '''<g clip-path="url(#cTorso)">
                    <rect class="an-r" data-region="chest"    x="40" y="101" width="160" height="101"/>
                    <rect class="an-r" data-region="stomach"  x="40" y="202" width="160" height="38"/>
                    <rect class="an-r" data-region="abdomen"  x="40" y="240" width="160" height="40"/>
                    <rect class="an-r" data-region="urinary"  x="40" y="280" width="160" height="22"/>
                    <rect class="an-r" data-region="genitals" x="40" y="302" width="160" height="20"/>
                  </g>
                  <g clip-path="url(#cHead)">
                    <rect class="an-r" data-region="head" x="84" y="14" width="72" height="30"/>
                    <rect class="an-r" data-region="face" x="84" y="44" width="72" height="52"/>
                  </g>
                  <rect class="an-r" data-region="throat" x="104" y="82" width="32" height="32" rx="5"/>
                  <ellipse class="an-r an-sm" data-region="eye" cx="107" cy="50" rx="8.6" ry="5.8"/>
                  <ellipse class="an-r an-sm" data-region="eye" cx="133" cy="50" rx="8.6" ry="5.8"/>
                  <ellipse class="an-r an-sm" data-region="ear" cx="88"  cy="56" rx="6" ry="9.5"/>
                  <ellipse class="an-r an-sm" data-region="ear" cx="152" cy="56" rx="6" ry="9.5"/>
                  <path    class="an-r an-sm" data-region="nose" d="M120,50 L113,68 L127,68 Z"/>
                  <ellipse class="an-r an-sm" data-region="mouth" cx="120" cy="78" rx="11" ry="5.5"/>
                  <use class="an-r" data-region="arm" href="#pArmL"/>
                  <use class="an-r" data-region="arm" href="#pArmR"/>
                  <rect class="an-r" data-region="hand" x="24" y="302" width="36" height="62" rx="12"/>
                  <rect class="an-r" data-region="hand" x="180" y="302" width="36" height="62" rx="12"/>
                  <use class="an-r" data-region="leg" href="#pLegL"/>
                  <use class="an-r" data-region="leg" href="#pLegR"/>
                  <rect class="an-r" data-region="foot" x="76" y="538" width="34" height="40" rx="10"/>
                  <rect class="an-r" data-region="foot" x="130" y="538" width="34" height="40" rx="10"/>'''

BACK_HITS = '''<g clip-path="url(#cTorso)">
                    <rect class="an-r" data-region="back"   x="40" y="101" width="160" height="181"/>
                    <rect class="an-r" data-region="rectum" x="40" y="282" width="160" height="40"/>
                  </g>
                  <ellipse class="an-r" data-region="backhead" cx="120" cy="54" rx="33" ry="40"/>
                  <rect class="an-r" data-region="nape" x="104" y="82" width="32" height="32" rx="5"/>
                  <use class="an-r" data-region="arm" href="#pArmL"/>
                  <use class="an-r" data-region="arm" href="#pArmR"/>
                  <rect class="an-r" data-region="hand" x="24" y="302" width="36" height="62" rx="12"/>
                  <rect class="an-r" data-region="hand" x="180" y="302" width="36" height="62" rx="12"/>
                  <use class="an-r" data-region="leg" href="#pLegL"/>
                  <use class="an-r" data-region="leg" href="#pLegR"/>
                  <rect class="an-r" data-region="foot" x="76" y="538" width="34" height="40" rx="10"/>
                  <rect class="an-r" data-region="foot" x="130" y="538" width="34" height="40" rx="10"/>'''


def svg(label, defs, art, hits):
    d = f'\n                {defs}\n' if defs else '\n'
    return (f'              <svg viewBox="0 0 {W} {H}" role="img" aria-label="{label}">'
            f'{d}'
            f'                <g class="an-art">\n                  {art}\n                </g>\n\n'
            f'                <g class="an-regions">\n                  {hits}\n                </g>\n'
            f'              </svg>')


def main():
    html = open(HTML, encoding='utf-8').read()
    front = svg('সামনের শরীর-চিত্র — অঙ্গসহ', DEFS, front_art(), FRONT_HITS)
    back = svg('পিছনের শরীর-চিত্র — মেরুদণ্ডসহ', '', back_art(), BACK_HITS)

    blocks = list(re.finditer(r'[ ]*<svg viewBox="0 0 240 \d+".*?</svg>', html, re.S))
    if len(blocks) != 2:
        raise SystemExit(f'expected 2 svg blocks in anatomy.html, found {len(blocks)}')
    html = html[:blocks[1].start()] + back + html[blocks[1].end():]
    html = html[:blocks[0].start()] + front + html[blocks[0].end():]
    open(HTML, 'w', encoding='utf-8').write(html)

    import xml.etree.ElementTree as ET
    for b in re.finditer(r'<svg\b.*?</svg>', open(HTML, encoding='utf-8').read(), re.S):
        ET.fromstring(b.group(0))
    print(f'front {len(front):,} chars   back {len(back):,} chars')
    print('both figures regenerated and parse as XML')


if __name__ == '__main__':
    main()
