"""
Portrait assets are AI-generated caricatures (see README).

Do NOT use programmatic stick-figure generation here.
Use Cursor GenerateImage with prompts like:

  Political caricature portrait bust of {realName}, recognizable likeness,
  exaggerated features, line art with simple flat shading, bold ink outlines,
  head and shoulders, solid {suit_color} background, no text, no watermark

Then copy from the Cursor assets cache into public/assets/portraits/:

  python scripts/copy_portraits_from_cache.py

Frightened variants: same prompt with terrified expression, save as {id}-fear.png
"""
from __future__ import annotations

import sys

print(__doc__)
print("Nothing to run. Use GenerateImage + copy_portraits_from_cache.py instead.", file=sys.stderr)
sys.exit(0)
