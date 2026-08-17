# ৩ডি মডেল — anatomy GLB slot

Drop a glTF binary here as **`anatomy.glb`** and the ৩ডি tab picks it up
automatically. Nothing else needs editing.

```
assets/data/models/anatomy.glb
```

The viewer (`assets/vendor/model-viewer/`, Apache-2.0) and a real anatomical
model both ship with the app — see below for what it is and how it was built.

---

## What is bundled

`anatomy.glb` is built, not hand-picked — `python3 tools/anatomy_model.py fetch`
then `build` regenerates it from source:

| | |
|---|---|
| Source | **Human Reference Atlas (HuBMAP)** — <https://humanatlas.io> |
| Licence | **CC-BY 4.0** — attribution only, *no* share-alike |
| Derived from | Visible Human Project, Allen Brain Atlas |
| Organs | 23, each a separately named node |
| Size | 5.8 MB (from 64 MB of source meshes) |
| Triangles | 402 k, down from 2.73 M (14.7 %) |

Every organ is spatially registered in one coordinate space, which is what
makes merging them into a single correct scene possible at all. The body is
centred on the origin, Y-up, 1.82 units tall.

### Why CC-BY and not anatomytool

anatomytool's models are CC-BY-**SA** and its viewer is **GPL3** — the viewer
would have forced this application's own source open. HRA is CC-BY, so the only
obligation is visible attribution, which the ৩ডি tab renders under the viewer
from `attribution` in `anatomy_hotspots.json`. **Do not remove it.**

Its models are also region-only (skeleton, skull, limbs, hand) with no viscera,
so they could not have produced an organ view regardless.

### What is deliberately missing

- **Stomach** — the HRA has no stomach reference organ, and Kent's Stomach
  chapter is 2,972 rubrics. Its hotspot works; there is simply no mesh under it.
- **Mouth and eyeballs** — 51 MB and 46 MB of source geometry for structures a
  few millimetres across. Dropped; their hotspots still work.

### Rebuilding

```bash
python3 tools/anatomy_model.py fetch   # ~64 MB into tools/.cache/hra (gitignored)
python3 tools/anatomy_model.py build   # decimate, merge, rewrite hotspots
python3 tools/model_check.py assets/data/models/anatomy.glb
```

`build` also rewrites the hotspot coordinates by reading them off the actual
skin mesh, so they cannot drift from the geometry. Per-organ triangle budgets
live in `PLAN` in the build script — raise a number for more detail, lower it
for a smaller file.

## Swapping in a different model

Drop any glTF binary in as `anatomy.glb`. Then:

1. `python3 tools/model_check.py assets/data/models/anatomy.glb` — check the
   size, whether meshes carry organ names, and the height/axis.
2. If the pose or scale differs, the hotspots will be wrong. Open the ৩ডি tab,
   press **স্থান নির্ধারণ**, pick a region, click that point on the model, then
   **কোড কপি** and paste into `anatomy_hotspots.json`.
3. Put the new creator credit in `attribution`.

Keep it under roughly 15 MB. Mind the licence: CC-BY-SA obliges you to release
a modified model under CC-BY-SA, and never link a GPL3 viewer.
