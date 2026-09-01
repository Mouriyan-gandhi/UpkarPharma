#!/usr/bin/env python3
"""
Import the extracted Vakul Derma brochure into the app.

Reads:
  /tmp/upkem-brochure/products.json     — from scripts/extract-brochure.py
  /tmp/upkem-brochure/manifest.json     — from scripts/setup-brochure.py
  /tmp/upkem-brochure/imgs/             — all embedded images

Does:
  1. For each product, pick the best candidate photo from the images on
     its page. Heuristic first (aspect ratio + size), then vision AI to
     confirm which image is the actual product package (not the model,
     background, or logo).
  2. Uploads the chosen photo to Supabase Storage bucket `product-images`
     (creates the bucket if missing, makes it public).
  3. Inserts a row into public.products with category='Derma' and
     sub_category from the JSON, plus image_url pointing at the public
     Storage URL.

Prereqs:
  .env.local must have SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  ANTHROPIC_API_KEY must be set (for the vision photo-picker)
  /tmp/upkem-pdf/bin/pip install anthropic supabase python-dotenv Pillow

Run:
  /tmp/upkem-pdf/bin/python scripts/import-brochure.py --dry-run    # test
  /tmp/upkem-pdf/bin/python scripts/import-brochure.py              # for real

Idempotent: skips products whose name+pack already exist. Progress is
saved every 10 products so you can safely Ctrl+C and resume.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import anthropic
    from supabase import create_client, Client
    from PIL import Image
except ImportError as e:
    print(f"Missing dependency: {e.name}", file=sys.stderr)
    print("Install: /tmp/upkem-pdf/bin/pip install anthropic supabase python-dotenv Pillow", file=sys.stderr)
    sys.exit(1)


BROCHURE_DIR = Path("/tmp/upkem-brochure")
# Prefer the committed copy in the repo; fall back to /tmp for a fresh run.
REPO_PRODUCTS = Path(__file__).parent.parent / "data" / "vakul-derma-products.json"
PRODUCTS_JSON = REPO_PRODUCTS if REPO_PRODUCTS.exists() else BROCHURE_DIR / "products.json"
MANIFEST_JSON = BROCHURE_DIR / "manifest.json"
IMGS_DIR = BROCHURE_DIR / "imgs"
PROGRESS = BROCHURE_DIR / "import-progress.json"
STORAGE_BUCKET = "product-images"

MODEL = "claude-sonnet-4-5"
PHOTO_SYSTEM = """You pick which candidate image is the actual product package for a pharmaceutical product listing. You return ONE integer (the candidate index) or the string "none" if none of the candidates show the product package clearly. No prose, no JSON, just the number or "none"."""


def load_env_local(path: Path) -> dict:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def is_likely_product_photo(img: dict) -> bool:
    """Cheap filter — drop obvious backgrounds, banners, and icons."""
    w, h = img["width"], img["height"]
    aspect = img["aspect"]
    # Backgrounds tend to be page-sized: > 1200x1500 covering the whole page
    if w > 1100 and h > 1400:
        return False
    # Tiny icons + patterns
    if img["bytes"] < 5_000 or w < 60 or h < 60:
        return False
    # Wide banners
    if aspect > 3.0 or aspect < 0.3:
        return False
    return True


def encode_image_for_api(path: Path, max_side: int = 800) -> tuple[str, str]:
    """Downscale to keep vision tokens cheap. Return (b64, media_type)."""
    im = Image.open(path).convert("RGB")
    im.thumbnail((max_side, max_side))
    from io import BytesIO
    buf = BytesIO()
    im.save(buf, "JPEG", quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode(), "image/jpeg"


def pick_photo(client: anthropic.Anthropic, page_img: Path, candidates: list[Path], hint: str) -> Path | None:
    """Ask vision which candidate image is the product package."""
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    # Build the message: page image, hint, then all candidates
    content = []
    page_b64, page_type = encode_image_for_api(page_img, 800)
    content.append({"type": "text", "text": f"Page context. Product photo hint: \"{hint or 'not provided'}\"."})
    content.append({"type": "image", "source": {"type": "base64", "media_type": page_type, "data": page_b64}})
    for i, path in enumerate(candidates):
        c_b64, c_type = encode_image_for_api(path, 400)
        content.append({"type": "text", "text": f"Candidate {i}:"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": c_type, "data": c_b64}})
    content.append({"type": "text", "text": f"Which candidate index (0..{len(candidates) - 1}) is the actual product package? Reply with just the integer or 'none'."})

    resp = client.messages.create(
        model=MODEL,
        max_tokens=10,
        system=PHOTO_SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    text = resp.content[0].text.strip().lower()
    m = re.match(r"^(\d+)", text)
    if m:
        idx = int(m.group(1))
        if 0 <= idx < len(candidates):
            return candidates[idx]
    return None


def make_bucket_public(supabase: Client, bucket: str) -> None:
    try:
        buckets = supabase.storage.list_buckets()
        if not any((getattr(b, "name", None) or b.get("name")) == bucket for b in buckets):
            supabase.storage.create_bucket(bucket, options={"public": True})
            print(f"  ✓ created public bucket '{bucket}'")
        else:
            # ensure public
            supabase.storage.update_bucket(bucket, options={"public": True})
    except Exception as e:
        print(f"  ! bucket setup warning: {e}", file=sys.stderr)


def upload_photo(supabase: Client, local: Path, remote_key: str) -> str:
    """Upload and return the public URL."""
    data = local.read_bytes()
    # supabase-py uses upsert via 'file_options' + storage v2
    supabase.storage.from_(STORAGE_BUCKET).upload(
        remote_key,
        data,
        file_options={
            "content-type": f"image/{local.suffix.lstrip('.')}",
            "upsert": "true",
        },
    )
    return supabase.storage.from_(STORAGE_BUCKET).get_public_url(remote_key)


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def load_progress() -> set:
    if PROGRESS.exists():
        return set(json.loads(PROGRESS.read_text()))
    return set()


def save_progress(done: set) -> None:
    PROGRESS.write_text(json.dumps(sorted(done)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Print what would happen but don't upload or insert")
    ap.add_argument("--limit", type=int, default=None, help="Import at most N products (for testing)")
    ap.add_argument("--skip-photo", action="store_true", help="Insert rows without picking/uploading photos")
    args = ap.parse_args()

    if not PRODUCTS_JSON.exists():
        print(f"Missing {PRODUCTS_JSON}. Run scripts/extract-brochure.py first.", file=sys.stderr)
        sys.exit(1)

    env = load_env_local(Path(__file__).parent.parent / ".env.local")
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Supabase creds missing in .env.local", file=sys.stderr)
        sys.exit(1)
    # Vision-based photo picking is optional. If ANTHROPIC_API_KEY is set,
    # we use Claude to disambiguate between multiple candidates on a page.
    # Otherwise we fall back to the pre-computed `page_image` field baked
    # into vakul-derma-products.json — the rendered brochure page. That's
    # always correct (the page IS the product's marketing shot) though a
    # multi-product page will make its 2-3 SKUs share the same image.
    use_vision = not args.skip_photo and os.environ.get("ANTHROPIC_API_KEY")

    products = json.loads(PRODUCTS_JSON.read_text())
    manifest = json.loads(MANIFEST_JSON.read_text()) if MANIFEST_JSON.exists() else []
    imgs_by_page: dict[int, list[dict]] = {}
    for m in manifest:
        imgs_by_page.setdefault(m["page"], []).append(m)

    supabase: Client = create_client(supabase_url, service_key)
    claude = anthropic.Anthropic() if use_vision else None

    if not args.dry_run:
        make_bucket_public(supabase, STORAGE_BUCKET)

    done = load_progress()
    print(f"Importing {len(products)} products ({len(done)} already done)")

    inserted = 0
    for i, p in enumerate(products):
        if args.limit and inserted >= args.limit:
            break

        key = f"{p.get('name', '?')}|{p.get('pack', '?')}"
        if key in done:
            continue

        page = p.get("page")
        candidates = [Path(m["file"]) for m in imgs_by_page.get(page, []) if is_likely_product_photo(m)]

        image_url = None
        candidate_urls: list[str] = []
        chosen: Path | None = None

        # Photo strategy — vision if available, else pre-computed page_image.
        if use_vision and candidates:
            page_img = BROCHURE_DIR / "pages" / f"{page:03d}.png"
            try:
                chosen = pick_photo(claude, page_img, candidates, p.get("photo_hint") or "")
            except anthropic.APIError as e:
                print(f"  ✗ vision picker failed for {key}: {e}", file=sys.stderr)
                chosen = candidates[0]
        elif not args.skip_photo:
            # No vision — use the rendered brochure page (guaranteed available).
            page_img_str = p.get("page_image")
            if page_img_str and Path(page_img_str).exists():
                chosen = Path(page_img_str)

        if chosen and not args.dry_run:
            remote_key = f"vakul-derma/p{page:03d}-{slugify(p['name'])}{chosen.suffix}"
            try:
                image_url = upload_photo(supabase, chosen, remote_key)
            except Exception as e:
                print(f"  ✗ primary upload failed for {key}: {e}", file=sys.stderr)
                image_url = None

            # Also upload the top 3 candidate isolated shots so the admin
            # can swap the primary later without needing to re-run this script.
            for i, cand_str in enumerate(p.get("candidate_photos", [])[:3]):
                cand = Path(cand_str)
                if not cand.exists() or cand == chosen:
                    continue
                try:
                    ck = f"vakul-derma/p{page:03d}-{slugify(p['name'])}-alt{i}{cand.suffix}"
                    candidate_urls.append(upload_photo(supabase, cand, ck))
                except Exception:
                    pass
        elif chosen:
            image_url = f"[dry-run] would upload {chosen.name}"

        # Description = tagline + features + indications, since the brochure
        # is dense with marketing copy the customer will want to see.
        desc_parts = [p.get("tagline") or ""]
        if p.get("features"):
            desc_parts.append("Key benefits: " + " · ".join(p["features"]))
        if p.get("indications"):
            desc_parts.append("Indications: " + ", ".join(p["indications"]))
        description = "\n\n".join(x for x in desc_parts if x).strip()

        images_all = ([image_url] if image_url else []) + candidate_urls
        row = {
            "name": p.get("name"),
            "company": p.get("brand") or "Vakul Lifescience",
            "category": "Derma",
            "body_system": p.get("sub_category"),
            "packing": p.get("pack"),
            "mrp": p.get("mrp"),
            "price": p.get("mrp"),        # PTR set in admin later
            "description": description,
            "composition": ", ".join(p.get("composition") or []) or None,
            "images": images_all if not args.dry_run else [],
            "image_url": image_url if not args.dry_run else None,
            "stock": 100,
            "stock_status": "In Stock",
        }

        print(f"  {'DRY' if args.dry_run else '→'} {p.get('name')} · {p.get('pack')} · ₹{p.get('mrp')} · photo: {'yes' if image_url else 'no'}")

        if not args.dry_run:
            try:
                supabase.table("products").insert(row).execute()
            except Exception as e:
                # If a duplicate name blows up, log and keep going
                print(f"  ! insert failed for {p.get('name')}: {e}", file=sys.stderr)
                continue

        done.add(key)
        inserted += 1
        if inserted % 10 == 0:
            save_progress(done)

    save_progress(done)
    print(f"\n✅ {inserted} products imported")


if __name__ == "__main__":
    main()
