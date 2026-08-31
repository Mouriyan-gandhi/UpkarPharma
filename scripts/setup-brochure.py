#!/usr/bin/env python3
"""
One-shot setup: render the Vakul brochure to /tmp/upkem-brochure/pages/
and extract every embedded image with metadata.

Idempotent — safe to re-run.

Requires: PyMuPDF   (/tmp/upkem-pdf/bin/pip install PyMuPDF Pillow)
Then run: /tmp/upkem-pdf/bin/python scripts/setup-brochure.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError:
    print("Install PyMuPDF: /tmp/upkem-pdf/bin/pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent
PDF = REPO_ROOT / "public" / "VAKUL LIFESCIENCE BROUCHURE-2026.pdf"
BASE = Path("/tmp/upkem-brochure")
PAGES_DIR = BASE / "pages"
IMGS_DIR = BASE / "imgs"
MANIFEST = BASE / "manifest.json"

DPI = 200


def main() -> None:
    if not PDF.exists():
        print(f"Brochure not found at {PDF}", file=sys.stderr)
        sys.exit(1)

    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    IMGS_DIR.mkdir(parents=True, exist_ok=True)

    d = fitz.open(PDF)
    print(f"Opening: {PDF.name}  ({len(d)} pages)")

    for i in range(len(d)):
        pix = d[i].get_pixmap(dpi=DPI)
        pix.save(PAGES_DIR / f"{i:03d}.png")

    manifest = []
    for i in range(len(d)):
        p = d[i]
        for idx, imginfo in enumerate(p.get_images(full=True)):
            xref = imginfo[0]
            img = d.extract_image(xref)
            fn = IMGS_DIR / f"p{i:03d}_i{idx:02d}.{img['ext']}"
            fn.write_bytes(img["image"])
            manifest.append({
                "page": i,
                "index": idx,
                "xref": xref,
                "width": img["width"],
                "height": img["height"],
                "ext": img["ext"],
                "bytes": len(img["image"]),
                "aspect": round(img["width"] / max(img["height"], 1), 2),
                "file": str(fn),
            })

    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"✅ Rendered {len(d)} pages → {PAGES_DIR}")
    print(f"✅ Extracted {len(manifest)} images → {IMGS_DIR}")
    print(f"✅ Manifest → {MANIFEST}")


if __name__ == "__main__":
    main()
