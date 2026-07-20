import pypdf
import os

pdf_path = os.path.join('public', 'VAKUL LIFESCIENCE BROUCHURE-2026.pdf')
reader = pypdf.PdfReader(pdf_path)

output_dir = os.path.join('public', 'pdf_extracted_images')
os.makedirs(output_dir, exist_ok=True)

print(f"Total pages: {len(reader.pages)}")

count = 0
for idx, page in enumerate(reader.pages):
    for img_idx, image in enumerate(page.images):
        count += 1
        img_filename = f"page_{idx+1}_img_{img_idx+1}_{image.name}"
        img_save_path = os.path.join(output_dir, img_filename)
        with open(img_save_path, "wb") as fp:
            fp.write(image.data)
        if count <= 10:
            print(f"Saved: {img_filename} (size: {len(image.data)} bytes)")

print(f"Total extracted images: {count}")
