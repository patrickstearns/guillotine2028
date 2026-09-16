"""Copy portrait PNGs from Cursor assets cache into public/assets/portraits.

After batch-generating caricatures with GenerateImage + trump.png reference,
run: python scripts/copy_portraits_from_cache.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / ".cursor" / "projects" / "c-Users-David-Desktop-Jovian-Games-Games-Guillotine2028" / "assets"
OUT = ROOT / "public" / "assets" / "portraits"

IDS = [
    "trump", "melania", "vance", "miller", "hegseth", "lutnick", "bondi", "patel", "noem",
    "leavitt", "vivek", "rfk", "tulsi", "harp", "bessent",
    "clerk", "mcconnell", "mike_johnson", "mccarthy", "cruz", "pelosi", "schumer",
    "roberts", "alito", "thomas", "barrett", "gorsuch", "kavanaugh", "cannon", "rival", "leaky_clerk",
    "murdoch", "tucker", "alex_jones", "hannity", "rogan", "fuentes", "okeefe",
    "luigi", "kimmel", "confused", "jan6", "sanders",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    copied = 0
    missing: list[str] = []
    for noble_id in IDS:
        for fear in ("", "-fear"):
            name = f"{noble_id}{fear}.png"
            src = CACHE / name
            if not src.is_file():
                missing.append(name)
                continue
            shutil.copy2(src, OUT / name)
            copied += 1
    print(f"copied {copied} files -> {OUT}")
    if missing:
        print(f"missing ({len(missing)}):", ", ".join(missing[:20]), "..." if len(missing) > 20 else "")


if __name__ == "__main__":
    main()
