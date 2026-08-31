#!/usr/bin/env python3
"""
Extract Vakul Lifescience derma products from the 100-page brochure using
Claude Sonnet vision.

Prereqs:
  1. Rendered pages at /tmp/upkem-brochure/pages/NNN.png (200 DPI)
  2. Embedded images extracted + manifest at /tmp/upkem-brochure/manifest.json
     (both produced by scripts/setup-brochure.py, or the inline one-off run)
  3. Python venv with anthropic + Pillow installed
     python3 -m venv /tmp/upkem-pdf && /tmp/upkem-pdf/bin/pip install anthropic PyMuPDF Pillow
  4. export ANTHROPIC_API_KEY=sk-ant-...

Outputs:
  /tmp/upkem-brochure/products.json  — flat array of every product across all pages

Design notes:
  * We send the RENDERED page as an image (not the embedded raster), because
    text on the brochure is outlined vector — the raw embedded images don't
    include the labels / prices / composition.
  * For each product on a page, the model returns a short "photo hint"
    (position on the page + package colour) — we later match that to one of
    the embedded images that live on that page. Doing photo picking in a
    separate pass keeps the extraction prompt small and cheap.
  * Sonnet 4.5 is the sweet spot for accuracy vs cost here (~$3/1M input
    tokens). Full 100-page run costs ~$3–5 depending on page density.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("Install anthropic: /tmp/upkem-pdf/bin/pip install anthropic", file=sys.stderr)
    sys.exit(1)

PAGES_DIR = Path("/tmp/upkem-brochure/pages")
MANIFEST = Path("/tmp/upkem-brochure/manifest.json")
OUT = Path("/tmp/upkem-brochure/products.json")
PROGRESS = Path("/tmp/upkem-brochure/progress.json")
MODEL = "claude-sonnet-4-5"

SYSTEM = """You are a pharmaceutical brochure data extractor. You're given ONE page from a Vakul Lifescience product brochure. Your job: return a strict JSON array of every product listed on that page.

Rules:
- Return ONLY valid JSON — no prose, no markdown fences, no commentary
- If the page is a cover, index, contact page, or has no products, return []
- One entry per product (a page usually has 1–3 products)
- Do not invent fields you can't see clearly on the page — leave them null
- Strip prefixes like ™, ®, ₹ from string values"""

USER_PROMPT = """Extract every product from this brochure page as JSON. Each product must be one object with EXACTLY these keys:

{
  "name": "Full product name including form (e.g. 'Bell Gel', 'Sunflair Silicone Sunscreen Gel')",
  "brand": "Vakul Lifescience",
  "sub_category": "Sunscreen | Serum | Depigmentation | Anti-Acne | Moisturizer | Face Wash | Anti-Aging | Hair | Ointment | Cream | Oral | Injectable | Foot Care | Body Care | Kit | Other",
  "pack": "e.g. '15 gm', '30 ml', '10 tablets' — copy exactly as shown",
  "mrp": <integer rupee price, no currency symbol, null if not shown>,
  "form": "Gel | Cream | Serum | Lotion | Ointment | Tablet | Capsule | Injection | Shampoo | Soap | Kit | Other",
  "spf": "e.g. 'SPF 50 PA+++', or null if not a sunscreen",
  "composition": ["array of ingredient strings with % if shown"],
  "features": ["array of the customer-facing benefit bullets from the page"],
  "indications": ["array of medical conditions the product treats, if shown"],
  "tagline": "the marketing headline on the page, or null",
  "photo_hint": "brief description of where the product package is on the page, e.g. 'white tube in bottom-right of page' — helps us match to the correct embedded image"
}

Return a JSON array. If the page has no products (cover/index/contact/back-cover), return []."""


def encode_image(path: Path) -> str:
    return base64.standard_b64encode(path.read_bytes()).decode()


def strip_json(text: str) -> str:
    """Model sometimes wraps output in ```json fences even when told not to."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def load_progress() -> dict:
    if PROGRESS.exists():
        return json.loads(PROGRESS.read_text())
    return {"done_pages": [], "products": []}


def save_progress(state: dict) -> None:
    PROGRESS.write_text(json.dumps(state, indent=2))


def extract_one(client: anthropic.Anthropic, page_idx: int) -> list[dict]:
    page_path = PAGES_DIR / f"{page_idx:03d}.png"
    b64 = encode_image(page_path)

    resp = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": USER_PROMPT},
                ],
            }
        ],
    )

    text = resp.content[0].text
    text = strip_json(text)
    try:
        products = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  ✗ page {page_idx}: JSON parse failed — {e}", file=sys.stderr)
        print(f"    raw response first 400 chars: {text[:400]}", file=sys.stderr)
        return []

    if not isinstance(products, list):
        print(f"  ✗ page {page_idx}: not an array", file=sys.stderr)
        return []

    for p in products:
        p["page"] = page_idx

    return products


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Set ANTHROPIC_API_KEY first: export ANTHROPIC_API_KEY=sk-ant-...", file=sys.stderr)
        sys.exit(1)

    if not PAGES_DIR.exists():
        print(f"Missing {PAGES_DIR} — run the render step first (scripts/setup-brochure.py)", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic()

    state = load_progress()
    done = set(state["done_pages"])
    all_products: list[dict] = list(state["products"])

    page_count = len(list(PAGES_DIR.glob("*.png")))
    print(f"Extracting from {page_count} pages ({len(done)} already done)")

    for i in range(page_count):
        if i in done:
            continue
        try:
            products = extract_one(client, i)
        except anthropic.APIError as e:
            print(f"  ✗ page {i}: API error — {e}. Retrying in 5s.", file=sys.stderr)
            time.sleep(5)
            try:
                products = extract_one(client, i)
            except Exception as e2:
                print(f"  ✗ page {i}: retry failed — {e2}. Skipping.", file=sys.stderr)
                continue

        print(f"  ✓ page {i}: {len(products)} product(s)")
        for p in products:
            print(f"       - {p.get('name', '?')} (₹{p.get('mrp', '?')})")

        all_products.extend(products)
        done.add(i)

        # Save progress every 5 pages so a crash doesn't lose work
        state = {"done_pages": sorted(done), "products": all_products}
        if i % 5 == 0:
            save_progress(state)

    # Final save
    save_progress(state)
    OUT.write_text(json.dumps(all_products, indent=2))
    print(f"\n✅ {len(all_products)} product(s) written to {OUT}")


if __name__ == "__main__":
    main()
