"""Knock out near-black portrait backdrops so suit patterns show around, not over, faces."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets" / "portraits"

def knock_black(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            # Keep any reasonably lit pixel (the face/clothes). Punch true black studio backdrops.
            if luma < 18:
                px[x, y] = (r, g, b, 0)
            elif luma < 38:
                fade = int(255 * (luma - 18) / 20)
                px[x, y] = (r, g, b, fade)
    im.save(path)
    print("processed", path.name)

def main() -> None:
    files = sorted(ROOT.glob("*.png"))
    if not files:
        print("no pngs")
        return
    for p in files:
        knock_black(p)
    print(f"done {len(files)} files")

if __name__ == "__main__":
    main()
