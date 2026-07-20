import fitz  # PyMuPDF
import os
import json

pdf_path = os.path.join('public', 'VAKUL LIFESCIENCE BROUCHURE-2026.pdf')
doc = fitz.open(pdf_path)

pages_dir = os.path.join('public', 'products', 'brochure_pages')
images_dir = os.path.join('public', 'products', 'extracted_images')
os.makedirs(pages_dir, exist_ok=True)
os.makedirs(images_dir, exist_ok=True)

manifest = []

print(f"Total pages in brochure: {len(doc)}")

for page_num in range(len(doc)):
    page = doc[page_num]
    
    # Render page to PNG image (dpi=150)
    pix = page.get_pixmap(dpi=150)
    page_img_name = f"page_{page_num+1:03d}.png"
    page_img_path = os.path.join(pages_dir, page_img_name)
    pix.save(page_img_path)
    
    # Check text content
    text = page.get_text()
    
    # Extract embedded images
    image_list = page.get_images(full=True)
    extracted_imgs = []
    
    for img_index, img_info in enumerate(image_list):
        xref = img_info[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]
        img_name = f"page_{page_num+1:03d}_img_{img_index+1:02d}.{image_ext}"
        img_path = os.path.join(images_dir, img_name)
        with open(img_path, "wb") as f:
            f.write(image_bytes)
        extracted_imgs.append({
            "name": img_name,
            "path": f"/products/extracted_images/{img_name}",
            "width": base_image["width"],
            "height": base_image["height"],
            "size_bytes": len(image_bytes)
        })
        
    manifest.append({
        "page_number": page_num + 1,
        "page_image": f"/products/brochure_pages/{page_img_name}",
        "text_length": len(text),
        "text_sample": text[:200] if text else "",
        "embedded_images_count": len(extracted_imgs),
        "embedded_images": extracted_imgs
    })

manifest_path = os.path.join('public', 'brochure_manifest.json')
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2)

print(f"Brochure processing complete. Manifest saved to {manifest_path}")
print(f"Pages saved to: {pages_dir}")
print(f"Extracted images saved to: {images_dir}")
