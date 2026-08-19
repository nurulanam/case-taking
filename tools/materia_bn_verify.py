#!/usr/bin/env python3
"""Verify the roster still carries every recreated Bangla entry — and repair it.

The recreation payloads are kept as files. This replays them against
remedies.json and reports, per remedy and per field, where the file no longer
matches what was written. That catches the case where something outside this
process (an editor saving a stale buffer, a partial restore) has overwritten the
roster with older content while leaving the `bn_rebuilt` flags in place — the
flags then claim work that is no longer in the file.

With --repair the payloads are re-applied through materia_bn_rebuild's normal
`apply`, so every write-time rule (identity fields, keynote cap, duplicate
checks, roster order) is enforced exactly as it was the first time. Nothing is
written here directly.

Payloads are replayed in modification-time order, so a later correction of an
entry wins over the earlier version of it, just as it did originally.

Run:  python3 tools/materia_bn_verify.py <payload-dir> [--repair]
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "assets" / "data" / "repatories" / "remedies.json"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from materia_bn_rebuild import CONTENT_FIELDS  # noqa: E402


def payloads(dirpath):
    """Every file that looks like a recreation payload, oldest write first."""
    out = []
    for f in sorted(Path(dirpath).glob("*.json"), key=lambda p: p.stat().st_mtime):
        try:
            doc = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(doc, dict) or not doc:
            continue
        entries = {k: v for k, v in doc.items()
                   if isinstance(v, dict) and set(v) <= CONTENT_FIELDS and v}
        if not entries:
            continue
        # A payload the gate refuses was never applied — some files are
        # deliberate gate tests (an over-cap keynote list, a duplicated claim).
        # Treating them as expected state would report a phantom mismatch.
        chk = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "materia_bn_check.py"), str(f)],
            capture_output=True, text=True)
        if chk.returncode != 0:
            continue
        out.append((f, entries))
    return out


def main():
    src = sys.argv[1]
    repair = "--repair" in sys.argv
    roster = {r["id"]: r for r in
              json.loads(ROSTER.read_text(encoding="utf-8"))["remedies"]}

    files = payloads(src)
    # last writer wins, mirroring the original order of applies
    want, origin = {}, {}
    for f, entries in files:
        for rid, fields in entries.items():
            want.setdefault(rid, {}).update(fields)
            origin[rid] = f

    missing, ok = {}, 0
    for rid, fields in want.items():
        r = roster.get(rid)
        if r is None:
            missing[rid] = ["not in roster"]
            continue
        bad = [f for f, v in fields.items()
               if (v is None and f in r) or (v is not None and r.get(f) != v)]
        if bad:
            missing[rid] = bad
        else:
            ok += 1

    print(f"payload files      : {len(files)}")
    print(f"remedies covered   : {len(want)}")
    print(f"intact in roster   : {ok}")
    print(f"NOT intact         : {len(missing)}")
    for rid in list(missing)[:15]:
        print(f"   {rid:12} fields: {', '.join(missing[rid][:6])}")
    if len(missing) > 15:
        print(f"   ... and {len(missing) - 15} more")

    if not missing or not repair:
        if missing and not repair:
            print("\n(pass --repair to re-apply the payloads through the gate)")
        return

    print("\nre-applying payloads through materia_bn_rebuild apply ...")
    for f, _entries in files:
        res = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "materia_bn_rebuild.py"),
             "apply", str(f)],
            capture_output=True, text=True)
        head = [ln for ln in res.stdout.splitlines()
                if ln.startswith(("applied", "REFUSED")) or ": " in ln]
        if any("REFUSED" in ln for ln in res.stdout.splitlines()):
            print(f"  {f.name}: REFUSED -> {' | '.join(head[:4])}")
    print("\nre-verifying ...")
    subprocess.run([sys.executable, __file__, src])


if __name__ == "__main__":
    main()
