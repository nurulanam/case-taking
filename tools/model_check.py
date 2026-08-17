# -*- coding: utf-8 -*-
"""Inspect a .glb before trusting it in the app.

    python3 tools/model_check.py assets/data/models/anatomy.glb

Answers the three things that decide whether a downloaded model is usable:
how heavy it is, whether the meshes carry real anatomical names (which is what
makes per-organ clicking possible instead of hotspot markers), and how tall it
is in model units (which is what the default hotspot coordinates assume).

glTF-binary is a 12-byte header then length-prefixed chunks; the first chunk is
the JSON scene graph. No dependency needed to read that much.
"""
import sys, os, json, struct, collections

# names worth flagging — if these turn up as meshes, the model can be picked
# per organ and the hotspot fallback is not needed
ORGANS = ('lung', 'heart', 'liver', 'stomach', 'kidney', 'bladder', 'spleen',
          'intestine', 'colon', 'brain', 'skull', 'rib', 'spine', 'vertebra',
          'pelvis', 'femur', 'humerus', 'skin', 'muscle', 'trachea', 'pancreas')


def read_glb(path):
    with open(path, 'rb') as f:
        magic, version, total = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF':
            raise SystemExit(f'not a glTF binary (magic={magic!r}) — is it .gltf or a zip?')
        chunks = []
        while f.tell() < total:
            head = f.read(8)
            if len(head) < 8:
                break
            clen, ctype = struct.unpack('<I4s', head)
            chunks.append((ctype, f.read(clen)))
    return version, chunks


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    path = sys.argv[1]
    if not os.path.exists(path):
        raise SystemExit(f'no such file: {path}')

    mb = os.path.getsize(path) / 1024 / 1024
    version, chunks = read_glb(path)
    js = next((d for t, d in chunks if t.startswith(b'JSON')), None)
    if not js:
        raise SystemExit('no JSON chunk — file is truncated or not a real glb')
    g = json.loads(js.decode('utf-8'))

    print(f'file        : {path}')
    print(f'size        : {mb:.1f} MB' + ('   ⚠ over the ~15 MB guideline' if mb > 15 else ''))
    print(f'glTF version: {version}')
    print(f'meshes      : {len(g.get("meshes", []))}')
    print(f'nodes       : {len(g.get("nodes", []))}')
    print(f'materials   : {len(g.get("materials", []))}')
    print(f'textures    : {len(g.get("textures", []))}')
    print(f'draco       : {"KHR_draco_mesh_compression" in g.get("extensionsUsed", [])}')

    names = [n['name'] for n in g.get('nodes', []) if n.get('name')]
    print(f'named nodes : {len(names)}/{len(g.get("nodes", []))}')

    hits = collections.Counter()
    for n in names:
        low = n.lower()
        for o in ORGANS:
            if o in low:
                hits[o] += 1
    if hits:
        print('\nanatomical names found — per-organ picking is viable:')
        for o, c in hits.most_common():
            print(f'  {o:<12} ×{c}')
    else:
        print('\nno recognisable anatomical node names.')
        print('  -> use the hotspot markers; mesh picking would have nothing to key on.')

    if names:
        print('\nfirst 25 node names:')
        for n in names[:25]:
            print('  -', n)

    # model height in its own units decides whether the default hotspot
    # coordinates (upright, Y-up, ~1.8 tall, origin at feet) will land
    mins, maxs = [], []
    for a in g.get('accessors', []):
        if a.get('type') == 'VEC3' and 'min' in a and 'max' in a and len(a['min']) == 3:
            mins.append(a['min']); maxs.append(a['max'])
    if mins:
        lo = [min(v[i] for v in mins) for i in range(3)]
        hi = [max(v[i] for v in maxs) for i in range(3)]
        size = [hi[i] - lo[i] for i in range(3)]
        print(f'\nbounds  min : {[round(v, 3) for v in lo]}')
        print(f'bounds  max : {[round(v, 3) for v in hi]}')
        print(f'size        : {[round(v, 3) for v in size]}')
        up = 'Y' if size[1] == max(size) else ('Z' if size[2] == max(size) else 'X')
        print(f'tallest axis: {up}  (defaults assume Y-up, ~1.8 units tall)')
        if up != 'Y':
            print('  ⚠ not Y-up — recalibrate hotspots in the app, or rotate on export')
        elif not 1.2 < size[1] < 2.6:
            print(f'  ⚠ height {size[1]:.2f} is far from 1.8 — recalibrate hotspots in the app')


if __name__ == '__main__':
    main()
