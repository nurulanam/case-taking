# -*- coding: utf-8 -*-
"""Build assets/data/models/anatomy.glb from the HuBMAP Human Reference Atlas.

    python3 tools/anatomy_model.py fetch    # download the HRA reference organs
    python3 tools/anatomy_model.py build    # decimate + merge into one glb

Why this exists
---------------
The HRA publishes ~81 organ meshes that are all registered into one coordinate
space (body centred on the origin, 1.8 units tall), which is what makes a real
anatomical scene possible: drop them into the same file and every organ is
already in the right place. They are CC-BY 4.0 — attribution only, no
share-alike, and nothing that reaches the application's own licence.

They are also research meshes: 161 MB for the set, with a 51 MB mouth and 26 MB
eyeballs. Unusable on a phone as-is, so each mesh is simplified by vertex
clustering — snap vertices to a grid, average each cell, rebuild the triangles,
drop the ones that collapsed — and the result is merged into a single glb with
one named node per organ. The names matter: they are what lets the page pick an
organ by raycast instead of relying only on hotspot markers.

Source: Human Reference Atlas (HuBMAP), https://humanatlas.io — CC-BY 4.0
"""
import json, os, struct, sys, math, urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, '.cache', 'hra')
OUT = os.path.join(ROOT, 'assets', 'data', 'models', 'anatomy.glb')
HOTSPOTS = os.path.join(ROOT, 'assets', 'data', 'anatomy_hotspots.json')
API = 'https://apps.humanatlas.io/api/v1/reference-organs'

ATTRIBUTION = ('Human Reference Atlas (HuBMAP) — humanatlas.io, CC-BY 4.0. '
               'Visible Human Project ও Allen Brain Atlas অবলম্বনে।')

# organ -> (Bangla label, grid cells along the longest axis, render group)
# A coarser grid means a smaller file; the skin carries the silhouette so it
# gets the finest budget, and blobby viscera survive aggressive clustering.
PLAN = {
    'skin':              ('ত্বক',            190, 'skin'),
    'brain':             ('মস্তিষ্ক',        40,  'organ'),
    'heart':             ('হৃদয়',           46,  'organ'),
    'lung':              ('ফুসফুস',          80,  'organ'),
    'trachea':           ('শ্বাসনালি',       48,  'organ'),
    'main bronchus':     ('মূল ব্রঙ্কাস',    44,  'organ'),
    'larynx':            ('কণ্ঠনালি',        40,  'organ'),
    'liver':             ('যকৃৎ',            48,  'organ'),
    'spleen':            ('প্লীহা',          44,  'organ'),
    'pancreas':          ('অগ্ন্যাশয়',      48,  'organ'),
    'omentum':           ('ওমেন্টাম',        56,  'organ'),
    'small intestine':   ('ক্ষুদ্রান্ত্র',   52,  'organ'),
    'large intestine':   ('বৃহদান্ত্র',      52,  'organ'),
    'left kidney':       ('বাম কিডনি',       36,  'organ'),
    'right kidney':      ('ডান কিডনি',       36,  'organ'),
    'left ureter':       ('বাম মূত্রনালি',   170,  'organ'),
    'right ureter':      ('ডান মূত্রনালি',   170,  'organ'),
    'urinary bladder':   ('মূত্রথলি',        34,  'organ'),
    'prostate':          ('প্রস্টেট',        40,  'organ'),
    'pelvis':            ('শ্রোণী',          72,  'bone'),
    'sternum':           ('বক্ষাস্থি',       48,  'bone'),
    'spinal cord':       ('সুষুম্নাকাণ্ড',   150,  'bone'),
    'thymus':            ('থাইমাস',          36,  'organ'),
}

# Deliberately excluded: mouth (51 MB / 2.0 M triangles) and the eyeballs
# (26 + 20 MB) are a third of the whole download for structures a few
# millimetres across. Their hotspots still work without the geometry.
SKIP = {'mouth', 'left eye', 'right eye'}

COLOUR = {   # base colour per organ, roughly conventional atlas colours
    'skin': (0.86, 0.70, 0.58, 0.14),
    'brain': (0.90, 0.80, 0.82, 1.0),
    'heart': (0.78, 0.20, 0.20, 1.0),
    'lung': (0.88, 0.60, 0.64, 1.0),
    'trachea': (0.80, 0.84, 0.86, 1.0),
    'main bronchus': (0.78, 0.82, 0.84, 1.0),
    'larynx': (0.76, 0.80, 0.84, 1.0),
    'liver': (0.55, 0.28, 0.24, 1.0),
    'spleen': (0.45, 0.24, 0.34, 1.0),
    'pancreas': (0.85, 0.72, 0.45, 1.0),
    'omentum': (0.90, 0.80, 0.58, 1.0),
    'small intestine': (0.88, 0.72, 0.52, 1.0),
    'large intestine': (0.82, 0.64, 0.42, 1.0),
    'left kidney': (0.58, 0.30, 0.28, 1.0),
    'right kidney': (0.58, 0.30, 0.28, 1.0),
    'left ureter': (0.80, 0.76, 0.52, 1.0),
    'right ureter': (0.80, 0.76, 0.52, 1.0),
    'urinary bladder': (0.88, 0.82, 0.50, 1.0),
    'prostate': (0.70, 0.52, 0.50, 1.0),
    'pelvis': (0.92, 0.89, 0.80, 1.0),
    'sternum': (0.92, 0.89, 0.80, 1.0),
    'spinal cord': (0.86, 0.84, 0.74, 1.0),
    'thymus': (0.84, 0.72, 0.60, 1.0),
}

COMP = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


# ───────────────────────────── glb reading ─────────────────────────────
def read_glb(path):
    with open(path, 'rb') as f:
        magic, _ver, total = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF':
            raise ValueError(f'{path}: not a glb')
        js = bin_ = None
        while f.tell() < total:
            head = f.read(8)
            if len(head) < 8:
                break
            ln, ty = struct.unpack('<I4s', head)
            data = f.read(ln)
            if ty.startswith(b'JSON'):
                js = json.loads(data.decode('utf-8'))
            elif ty.startswith(b'BIN'):
                bin_ = data
    return js, bin_


def accessor(g, blob, i):
    a = g['accessors'][i]
    n = NCOMP[a['type']]
    fmt = COMP[a['componentType']]
    itemsize = np.dtype(fmt).itemsize
    v = g['bufferViews'][a['bufferView']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride') or (itemsize * n)
    if stride == itemsize * n:
        buf = np.frombuffer(blob, dtype=fmt, count=a['count'] * n, offset=start)
        return buf.reshape(a['count'], n)
    # interleaved: pull one element at a time
    out = np.empty((a['count'], n), dtype=fmt)
    for k in range(a['count']):
        out[k] = np.frombuffer(blob, dtype=fmt, count=n, offset=start + k * stride)
    return out


def node_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if 'scale' in node:
        m = np.diag(list(node['scale']) + [1.0]) @ m
    if 'rotation' in node:
        x, y, z, w = node['rotation']
        r = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1]])
        m = r @ m
    if 'translation' in node:
        t = np.eye(4); t[:3, 3] = node['translation']
        m = t @ m
    return m


def load_mesh(path):
    """-> (V float32 [n,3] in world space, F int32 [m,3])"""
    g, blob = read_glb(path)
    verts, faces = [], []
    base = 0

    def walk(ni, parent):
        nonlocal base
        node = g['nodes'][ni]
        m = parent @ node_matrix(node)
        if 'mesh' in node:
            for pr in g['meshes'][node['mesh']]['primitives']:
                if pr.get('mode', 4) != 4:
                    continue
                pi = pr['attributes'].get('POSITION')
                if pi is None:
                    continue
                P = accessor(g, blob, pi).astype(np.float64)
                P = (m @ np.c_[P, np.ones(len(P))].T).T[:, :3]
                if 'indices' in pr:
                    I = accessor(g, blob, pr['indices']).ravel().astype(np.int64)
                else:
                    I = np.arange(len(P), dtype=np.int64)
                verts.append(P.astype(np.float32))
                faces.append(I.reshape(-1, 3) + base)
                base += len(P)
        for c in node.get('children', []):
            walk(c, m)

    scene = g.get('scenes', [{}])[g.get('scene', 0)]
    for ni in scene.get('nodes', range(len(g.get('nodes', [])))):
        walk(ni, np.eye(4))
    if not verts:
        return None, None
    return np.concatenate(verts), np.concatenate(faces).astype(np.int64)


# ───────────────────────────── simplification ─────────────────────────────
def cluster_decimate(V, F, cells):
    """Vertex-clustering simplification.

    Snap every vertex into a uniform grid of `cells` divisions along the
    longest axis, replace each occupied cell with the mean of its vertices,
    then rebuild the faces and discard any that collapsed to a line or point.
    Cheap, robust to the messy non-manifold meshes that come out of medical
    segmentation, and it preserves the silhouette which is all this needs.
    """
    lo, hi = V.min(0), V.max(0)
    size = np.maximum(hi - lo, 1e-9)
    step = size.max() / max(cells, 4)
    key = np.floor((V - lo) / step).astype(np.int64)
    # one integer per cell so np.unique collapses them in a single pass
    dims = key.max(0) + 1
    flat = (key[:, 0] * dims[1] + key[:, 1]) * dims[2] + key[:, 2]
    uniq, inv = np.unique(flat, return_inverse=True)

    n = len(uniq)
    sums = np.zeros((n, 3), dtype=np.float64)
    np.add.at(sums, inv, V)
    counts = np.bincount(inv, minlength=n).reshape(-1, 1)
    NV = (sums / counts).astype(np.float32)

    NF = inv[F]
    ok = (NF[:, 0] != NF[:, 1]) & (NF[:, 1] != NF[:, 2]) & (NF[:, 0] != NF[:, 2])
    NF = NF[ok]
    # drop duplicate faces (clustering makes many coincide)
    if len(NF):
        srt = np.sort(NF, axis=1)
        _, keep = np.unique(srt, axis=0, return_index=True)
        NF = NF[np.sort(keep)]
    return NV, NF.astype(np.int64)


def vertex_normals(V, F):
    N = np.zeros_like(V, dtype=np.float64)
    tri = V[F]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    ln = np.linalg.norm(N, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return (N / ln).astype(np.float32)


# ───────────────────────────── glb writing ─────────────────────────────
def write_glb(path, parts):
    """parts: [(name, V, N, F, rgba)] -> one node+mesh each, single buffer."""
    blob = bytearray()
    accessors, views, meshes, nodes, materials = [], [], [], [], []

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['bufferTarget'] = target
        views.append(v)
        return len(views) - 1

    for name, V, N, F, rgba in parts:
        idx_dtype = np.uint16 if len(V) < 65536 else np.uint32
        vi = add_view(V.astype('<f4').tobytes())
        ni = add_view(N.astype('<f4').tobytes())
        fi = add_view(F.astype(idx_dtype).ravel().tobytes())
        views[vi]['target'] = 34962
        views[ni]['target'] = 34962
        views[fi]['target'] = 34963

        accessors.append({'bufferView': vi, 'componentType': 5126, 'count': len(V),
                          'type': 'VEC3', 'min': V.min(0).tolist(), 'max': V.max(0).tolist()})
        a_pos = len(accessors) - 1
        accessors.append({'bufferView': ni, 'componentType': 5126, 'count': len(N),
                          'type': 'VEC3'})
        a_nrm = len(accessors) - 1
        accessors.append({'bufferView': fi,
                          'componentType': 5123 if idx_dtype == np.uint16 else 5125,
                          'count': int(F.size), 'type': 'SCALAR'})
        a_idx = len(accessors) - 1

        r, g_, b, a = rgba
        materials.append({
            'name': f'mat-{name}',
            'pbrMetallicRoughness': {
                'baseColorFactor': [r, g_, b, a],
                'metallicFactor': 0.0,
                'roughnessFactor': 0.62,
            },
            'doubleSided': True,
            **({'alphaMode': 'BLEND'} if a < 1.0 else {}),
        })
        meshes.append({'name': name, 'primitives': [{
            'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm},
            'indices': a_idx, 'material': len(materials) - 1, 'mode': 4}]})
        nodes.append({'name': name, 'mesh': len(meshes) - 1})

    while len(blob) % 4:
        blob.append(0)

    g = {
        'asset': {'version': '2.0',
                  'generator': 'homeo-case-studio anatomy_model.py',
                  'copyright': ATTRIBUTION},
        'scene': 0,
        'scenes': [{'nodes': list(range(len(nodes)))}],
        'nodes': nodes, 'meshes': meshes, 'materials': materials,
        'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(blob)}],
    }
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\x00')); f.write(bytes(blob))


# ───────────────────────────── commands ─────────────────────────────
def cmd_fetch():
    os.makedirs(CACHE, exist_ok=True)
    items = json.load(urllib.request.urlopen(API))
    picked, total = {}, 0
    for o in items:
        label = str(o.get('label', '')).lower()
        if label in SKIP or label not in PLAN:
            continue
        # prefer the male reference; a few structures only exist as female
        if label in picked and picked[label]['sex'] == 'Male':
            continue
        if o.get('sex') in ('Male', 'Female'):
            if label not in picked or o['sex'] == 'Male':
                picked[label] = o
    for label, o in sorted(picked.items()):
        url = o['object']['file']
        dest = os.path.join(CACHE, url.rsplit('/', 1)[-1])
        if not os.path.exists(dest):
            print(f'  fetching {label} …', flush=True)
            urllib.request.urlretrieve(url, dest)
        total += os.path.getsize(dest)
        print(f'  {label:<20} {o["sex"]:<7} {os.path.getsize(dest)/1048576:6.1f} MB')
    json.dump({k: v['object']['file'] for k, v in picked.items()},
              open(os.path.join(CACHE, 'manifest.json'), 'w'), indent=1)
    print(f'downloaded {len(picked)} organs, {total/1048576:.1f} MB raw')


def cmd_build():
    man = os.path.join(CACHE, 'manifest.json')
    if not os.path.exists(man):
        sys.exit('run `python3 tools/anatomy_model.py fetch` first')
    urls = json.load(open(man))

    parts, tri_in, tri_out = [], 0, 0
    for label, url in sorted(urls.items(), key=lambda kv: kv[0] != 'skin'):
        src = os.path.join(CACHE, url.rsplit('/', 1)[-1])
        if not os.path.exists(src):
            print(f'  ! missing {label}'); continue
        bn, cells, _grp = PLAN[label]
        V, F = load_mesh(src)
        if V is None:
            print(f'  ! no geometry in {label}'); continue
        tri_in += len(F)
        V2, F2 = cluster_decimate(V, F, cells)
        if not len(F2):
            print(f'  ! {label} collapsed entirely'); continue
        N2 = vertex_normals(V2, F2)
        tri_out += len(F2)
        parts.append((label, V2, N2, F2, COLOUR.get(label, (0.8, 0.6, 0.5, 1.0))))
        print(f'  {label:<20} {len(F):>8,} -> {len(F2):>7,} tris  ({bn})')

    write_glb(OUT, parts)
    mb = os.path.getsize(OUT) / 1048576
    print(f'\norgans   : {len(parts)}')
    print(f'triangles: {tri_in:,} -> {tri_out:,}  ({100*tri_out/max(tri_in,1):.1f}%)')
    print(f'written  : {OUT} ({mb:.1f} MB)')

    # record the attribution CC-BY requires, where the page renders it
    if os.path.exists(HOTSPOTS):
        h = json.load(open(HOTSPOTS, encoding='utf-8'))
        h['attribution'] = ATTRIBUTION
        h['organ_names'] = {k: PLAN[k][0] for k in sorted(urls) if k in PLAN}
        h['hotspots'] = derive_hotspots(parts)
        h['assumes_bn'] = ('অবস্থানগুলি মডেলের প্রকৃত মেশ থেকে গোনা — অনুমান নয়। '
                           'অন্য মডেল বসালে ‘স্থান নির্ধারণ’ মোড দিয়ে ঠিক করে নিন।')
        by = {n: (V.min(0).tolist(), V.max(0).tolist()) for n, V, _N, _F, _c in parts}
        h['bounds'] = {k: [[round(x, 4) for x in lo], [round(x, 4) for x in hi]]
                       for k, (lo, hi) in by.items()}
        json.dump(h, open(HOTSPOTS, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'hotspots derived from mesh: {len(h["hotspots"])}')
        print('attribution written into anatomy_hotspots.json')


def derive_hotspots(parts):
    """Place each region's marker on the real skin surface.

    Guessing coordinates was the wrong instinct: the model is centred on the
    origin, not standing on it, so every hand-written Y was out by ~0.9. The
    meshes already know where everything is, so read it off them instead —
    take the organ that defines a region, and push out to the skin vertex that
    is furthest front (or back) within that organ's height band.
    """
    mesh = {n: V for n, V, _N, _F, _c in parts}
    skin = mesh.get('skin')
    if skin is None:
        return {}

    def band(y_lo, y_hi, x_lo=-9, x_hi=9, front=True):
        m = ((skin[:, 1] >= y_lo) & (skin[:, 1] <= y_hi) &
             (skin[:, 0] >= x_lo) & (skin[:, 0] <= x_hi))
        pts = skin[m]
        if not len(pts):
            return None
        i = pts[:, 2].argmax() if front else pts[:, 2].argmin()
        p = pts[i]
        # nudge clear of the surface so the marker is not z-fighting the skin
        z = p[2] + (0.02 if front else -0.02)
        return {'position': f'{p[0]:.3f} {p[1]:.3f} {z:.3f}',
                'normal': f'0 0 {1 if front else -1}'}

    def ymid(name, default=None):
        V = mesh.get(name)
        if V is None:
            return default
        return float((V[:, 1].min() + V[:, 1].max()) / 2)

    top = float(skin[:, 1].max())
    bot = float(skin[:, 1].min())
    span = top - bot

    # heights anchored to real organs where one exists, else to body fractions
    y_brain = ymid('brain', top - 0.09)
    y_larynx = ymid('larynx', top - 0.20)
    y_heart = ymid('heart', top - 0.34)
    y_liver = ymid('liver', top - 0.46)
    y_gut = ymid('small intestine', top - 0.56)
    y_blad = ymid('urinary bladder', top - 0.70)
    y_pros = ymid('prostate', top - 0.74)

    eps = 0.03
    spec = {
        'head':     (y_brain + 0.03, top,                -9, 9, True),
        'face':     (y_brain - 0.09, y_brain - 0.03,    0.03, 0.09, True),
        'eye':      (y_brain - 0.06, y_brain - 0.02,   -0.06, -0.01, True),
        'ear':      (y_brain - 0.08, y_brain - 0.02,      -9, 9, True),
        'nose':     (y_brain - 0.10, y_brain - 0.05,   -0.015, 0.015, True),
        'mouth':    (y_brain - 0.13, y_brain - 0.09,   -0.03, 0.03, True),
        'throat':   (y_larynx - eps, y_larynx + eps,      -9, 9, True),
        'chest':    (y_heart - 0.04, y_heart + 0.06,      -9, 9, True),
        'stomach':  (y_liver - 0.02, y_liver + 0.04,    0.01, 9, True),
        'abdomen':  (y_gut - 0.04, y_gut + 0.04,          -9, 9, True),
        'urinary':  (y_blad - eps, y_blad + eps,          -9, 9, True),
        'genitals': (y_pros - 0.07, y_pros - 0.03,     -0.04, 0.04, True),
        'leg':      (bot + span * 0.30, bot + span * 0.36, -0.20, -0.05, True),
        'foot':     (bot + 0.01, bot + 0.06,             -0.22, -0.04, True),
        'backhead': (y_brain, top,                        -9, 9, False),
        'nape':     (y_larynx - eps, y_larynx + eps,      -9, 9, False),
        'back':     (y_heart - 0.06, y_heart + 0.06,      -9, 9, False),
        'rectum':   (y_pros - 0.03, y_pros + 0.05,     -0.05, 0.05, False),
        'backleg':  (bot + span * 0.30, bot + span * 0.36, -0.20, -0.05, False),
        'backfoot': (bot + 0.01, bot + 0.06,             -0.22, -0.04, False),
    }
    out = {}
    for rid, (lo, hi, xlo, xhi, front) in spec.items():
        h = band(lo, hi, xlo, xhi, front)
        if h:
            out[rid] = h
    # Limbs and ears must be placed by *lateral* extreme, not by depth: taking
    # the front-most vertex in an arm's height band lands on the edge of the
    # chest, which is what put the arm marker on the torso. This pose is the
    # anatomical one — arms abducted — so the widest point of the whole body is
    # the hand, and the arm proper is the widest point higher up.
    def lateral(y_lo, y_hi, front=None, push=0.02):
        m = (skin[:, 1] >= y_lo) & (skin[:, 1] <= y_hi)
        if front is not None:
            m &= (skin[:, 2] >= 0) if front else (skin[:, 2] < 0)
        pts = skin[m]
        if not len(pts):
            return None
        p = pts[pts[:, 0].argmin()]
        return {'position': f'{p[0]-push:.3f} {p[1]:.3f} {p[2]:.3f}',
                'normal': '-1 0 0'}

    # widest slice of the body = the hand; step up the arm for the arm marker
    lo_h = bot + span * 0.47
    hi_h = bot + span * 0.53
    for rid, yl, yh, fr in (('hand', lo_h, hi_h, None),
                            ('backhand', lo_h, hi_h, False),
                            ('arm', bot + span * 0.62, bot + span * 0.68, None),
                            ('backarm', bot + span * 0.62, bot + span * 0.68, False),
                            ('ear', y_brain - 0.08, y_brain - 0.02, None)):
        h = lateral(yl, yh, fr)
        if h:
            out[rid] = h
    return out


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    {'fetch': cmd_fetch, 'build': cmd_build}[cmd]()
