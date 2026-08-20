#!/usr/bin/env python3
"""Export the recreated Bangla entries to versioned files inside the repo.

Twice now the recreation work has been at risk from something outside this
process: once the roster itself was overwritten with a stale copy, and once the
scratchpad holding the payloads was wiped. Keeping the written content only in
remedies.json (a single 2.8 MB file an editor can clobber) or only in /tmp is
not durable enough.

This writes one file per shard of recreated entries under
docs/materia-bn-payloads/, containing exactly the content fields
materia_bn_rebuild is allowed to write. Those files are what
materia_bn_verify.py compares against, so a snapshot taken now can restore the
roster later. They are a snapshot of the applied state — not the original
payload text — and are safe to re-export at any time.

Run:  python3 tools/materia_bn_snapshot.py [--write]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
OUT = ROOT / "docs" / "materia-bn-payloads"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from materia_bn_rebuild import CONTENT_FIELDS  # noqa: E402

PER_FILE = 40


def main():
    write = "--write" in sys.argv
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]
    done = [r for r in roster if r.get("bn_rebuilt")]

    shards, cur = [], {}
    for r in done:
        cur[r["id"]] = {f: r[f] for f in sorted(CONTENT_FIELDS) if f in r}
        if len(cur) == PER_FILE:
            shards.append(cur)
            cur = {}
    if cur:
        shards.append(cur)

    print(f"recreated entries : {len(done)}")
    print(f"snapshot files    : {len(shards)}  ({PER_FILE} entries each)")
    print(f"destination       : {OUT.relative_to(ROOT)}")
    if not write:
        print("\n(dry run — pass --write to save)")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("snapshot-*.json"):
        old.unlink()
    for i, shard in enumerate(shards, 1):
        (OUT / f"snapshot-{i:02d}.json").write_text(
            json.dumps(shard, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(s) for s in shards)
    print(f"\nwritten: {total} entries across {len(shards)} files")


if __name__ == "__main__":
    main()
