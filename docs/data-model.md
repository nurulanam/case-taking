# Data model — remedy identity

Every module that names a medicine stores a **remedy id**, not a display
name, abbreviation, or array index (except repertory grades, below).

## Catalog

`assets/data/remedies/catalog.json` is the canonical table.

| field | meaning |
| --- | --- |
| `id` | primary key — Kent slug (`nux-v`, `sulph`, `hep`) |
| `name` | English display name |
| `bangla` | Bangla display name |
| `abbr` | short form, same as `id` |
| `abbr_display` | dotted form for UI (`Nux-v.`) |
| `family` | botanical / chemical family |
| `aliases` | extra strings that historically pointed here |

Array **order is frozen**. It matches `assets/data/repatories/remedies.json`,
which is the materia-medica source. Do not shuffle it.

Runtime lookup: `assets/js/remedy-store.js` → `RemedyStore.get(id)`,
`.label(id)`, `.abbr(id)`.

## Foreign keys by module

| module | file | stores |
| --- | --- | --- |
| Temperament | `tempraz.json` | trait `scores` keyed by id; `remedies[].id` |
| Miasm | `miasm.json` | `associated_remedies: ["sulph", …]` |
| Theory of Acutes | `acutes.json` | `remedies[].id`; FLOW in `acutes.js` is `R(n, id)` |
| Repertory | `*_rubrics.json` | compact `"idx:grade"` — `idx` is `catalog.remedies[i]` |

Repertory files stay numeric so the multi-megabyte JSON does not balloon.
A SQL import maps `idx → catalog.remedies[idx].id`.

## Rebuild

```bash
python3 tools/build_remedy_catalog.py
```

Regenerates the catalog from the roster and retargets tempraz / miasm /
acutes onto those ids. Safe to re-run.

## Web-app conversion

One table:

```sql
remedies (id TEXT PRIMARY KEY, name TEXT, bangla TEXT, abbr TEXT, family TEXT)
```

Everything else is `REFERENCES remedies(id)`. Repertory grades become
`(rubric_id, remedy_id, grade)` after expanding the compact `r` string.
