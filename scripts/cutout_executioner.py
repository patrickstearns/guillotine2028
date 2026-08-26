"""Create a transparent cutout of the executioner for the game board."""
from pathlib import Path
import subprocess
import sys

try:
    from rembg import remove
    from PIL import Image
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "rembg", "pillow", "onnxruntime"])
    from rembg import remove
    from PIL import Image

root = Path(__file__).resolve().parents[1] / "public" / "assets"
src = root / "executioner.png"
dst = root / "executioner-cutout.png"

img = Image.open(src).convert("RGBA")
out = remove(img)
out.save(dst)
print("wrote", dst, "size", out.size)
