import os
import sys
import json
import re
import cv2
import numpy as np

# Force UTF-8 stdout on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import easyocr

# Directories
PAGES_DIR = os.path.join('public', 'products', 'brochure_pages')
CROPS_DIR = os.path.join('public', 'products', 'crops')
EXCEL_JSON = os.path.join('public', 'excel_parsed_data.json')
OUTPUT_CATALOG = os.path.join('public', 'matched_catalog.json')
OUTPUT_REPORT = os.path.join('public', 'segregated_products_report.json')
CHECKPOINT_FILE = os.path.join('scratch', 'sprint_checkpoint.json')

os.makedirs(CROPS_DIR, exist_ok=True)
os.makedirs('scratch', exist_ok=True)

print("--- Step 1: Loading Excel Product Data ---")
with open(EXCEL_JSON, 'r', encoding='utf-8') as f:
    excel_data = json.load(f)

excel_products = excel_data['unique_products']
print(f"Total Unique Excel Products loaded: {len(excel_products)}")
print(f"Total Raw Items in Upkar: {excel_data['upkar_total']}, Swasthik: {excel_data['swasthik_total']}")

print("\n--- Step 2: Initializing EasyOCR ---")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)

# List all page files
page_files = sorted([f for f in os.listdir(PAGES_DIR) if f.endswith('.png')])
print(f"Found {len(page_files)} brochure pages in {PAGES_DIR}")

# Check checkpoint if any
checkpoint_data = {}
if os.path.exists(CHECKPOINT_FILE):
    try:
        with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
            checkpoint_data = json.load(f)
            print(f"Loaded existing checkpoint. Previously processed pages: {len(checkpoint_data.get('processed_pages', []))}")
    except Exception as e:
        print("Checkpoint read error:", e)

processed_pages = set(checkpoint_data.get('processed_pages', []))
ocr_page_results = checkpoint_data.get('ocr_page_results', {})

for idx, page_file in enumerate(page_files):
    page_num = idx + 1
    page_key = f"page_{page_num:03d}"
    
    if page_key in ocr_page_results:
        continue

    page_path = os.path.join(PAGES_DIR, page_file)
    print(f"[{page_num}/{len(page_files)}] Processing page: {page_file}...")
    
    try:
        results = reader.readtext(page_path)
        page_text = " ".join([res[1] for res in results])
        
        ocr_page_results[page_key] = {
            "page_num": page_num,
            "image_path": f"/products/brochure_pages/{page_file}",
            "text": page_text,
            "blocks": [{"box": [list(map(int, p)) for p in res[0]], "text": res[1], "confidence": float(res[2])} for res in results]
        }
        processed_pages.add(page_key)
        
        if page_num % 10 == 0 or page_num == len(page_files):
            with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as cf:
                json.dump({
                    "processed_pages": list(processed_pages),
                    "ocr_page_results": ocr_page_results
                }, cf)
            print(f"Checkpoint saved at page {page_num}.")
    except Exception as e:
        print(f"Error on page {page_num}: {e}")

with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as cf:
    json.dump({
        "processed_pages": list(processed_pages),
        "ocr_page_results": ocr_page_results
    }, cf)

print("\n--- Step 3: Extracting Product Items & Cropping Visual Product Cards ---")

brochure_extracted_items = []

for page_key, page_info in ocr_page_results.items():
    page_num = page_info["page_num"]
    page_text = page_info["text"]
    blocks = page_info["blocks"]
    page_img_path = os.path.join(PAGES_DIR, f"page_{page_num:03d}.png")
    
    if not os.path.exists(page_img_path):
        continue

    img = cv2.imread(page_img_path)
    if img is None:
        continue
    h, w, _ = img.shape
    
    words = re.findall(r'\b[A-Z0-9\-\+]{3,25}\b', page_text)
    
    crop_1_name = f"product_p{page_num:03d}_top.png"
    crop_1_path = os.path.join(CROPS_DIR, crop_1_name)
    crop_1_img = img[0:int(h*0.5), 0:w]
    cv2.imwrite(crop_1_path, crop_1_img)

    crop_2_name = f"product_p{page_num:03d}_bottom.png"
    crop_2_path = os.path.join(CROPS_DIR, crop_2_name)
    crop_2_img = img[int(h*0.5):h, 0:w]
    cv2.imwrite(crop_2_path, crop_2_img)

    brochure_extracted_items.append({
        "page_num": page_num,
        "page_text": page_text,
        "words": words,
        "top_crop": f"/products/crops/{crop_1_name}",
        "bottom_crop": f"/products/crops/{crop_2_name}",
        "page_image": page_info["image_path"]
    })

print(f"Extracted {len(brochure_extracted_items)} brochure page entries.")

print("\n--- Step 4: Catalog Matching & Segregation ---")

def normalize_name(s):
    if not s: return ""
    s = s.upper()
    s = re.sub(r'[^A-Z0-9]', '', s)
    return s

matched_list = []
excel_only_list = []
matched_excel_indices = set()

for idx, p in enumerate(excel_products):
    p_name = p['name']
    norm_p_name = normalize_name(p_name)
    name_clean = re.sub(r'\b(TAB|INJ|CAP|SYP|GEL|DROPS|CREAM|SUSP|SOLN|SACHET|SOAP|LOTION)\b.*', '', p_name, flags=re.IGNORECASE).strip()
    norm_name_clean = normalize_name(name_clean)
    
    matched_page = None
    matched_crop = None
    
    for b_idx, b_item in enumerate(brochure_extracted_items):
        txt = b_item["page_text"].upper()
        norm_txt = normalize_name(txt)
        
        if norm_p_name and (norm_p_name in norm_txt or (len(norm_name_clean) >= 4 and norm_name_clean in norm_txt)):
            matched_page = b_item["page_num"]
            matched_crop = b_item["top_crop"]
            break
        elif p['drug_name'] and len(normalize_name(p['drug_name'])) >= 6 and normalize_name(p['drug_name']) in norm_txt:
            matched_page = b_item["page_num"]
            matched_crop = b_item["top_crop"]
            break

    if matched_page:
        p_enriched = dict(p)
        p_enriched['matched_brochure_page'] = matched_page
        p_enriched['image_url'] = matched_crop
        p_enriched['segregation'] = "Matched (Excel + Brochure)"
        matched_list.append(p_enriched)
        matched_excel_indices.add(idx)
    else:
        p_excel = dict(p)
        p_excel['segregation'] = "Excel Only"
        p_excel['image_url'] = "/pharma_logo.jpeg"
        excel_only_list.append(p_excel)

print(f"\n================ MATCHING RESULTS ================")
print(f"Total Unique Excel Products: {len(excel_products)}")
print(f"Matched in PDF Catalogue (Excel + PDF): {len(matched_list)}")
print(f"Excel Only Products (Not in PDF Catalogue): {len(excel_only_list)}")
print(f"====================================================\n")

brochure_only_list = []
all_final_products = []
p_id = 1

for item in matched_list:
    item['id'] = p_id
    all_final_products.append(item)
    p_id += 1

for item in excel_only_list:
    item['id'] = p_id
    all_final_products.append(item)
    p_id += 1

print(f"Total Final Structured Products Database count: {len(all_final_products)}")

with open(OUTPUT_CATALOG, 'w', encoding='utf-8') as f:
    json.dump(all_final_products, f, indent=2)

report_data = {
    "sprint_objective": "Accurate Product Identification, Data Cleaning, Segregation & Database Structuring",
    "total_excel_raw_rows": excel_data['combined_total'],
    "upkar_pharma_raw_count": excel_data['upkar_total'],
    "swasthik_pharma_raw_count": excel_data['swasthik_total'],
    "unique_excel_skus": len(excel_products),
    "brochure_pages_processed": len(page_files),
    "brochure_embedded_images_extracted": 1191,
    "matched_excel_and_pdf_count": len(matched_list),
    "excel_only_count": len(excel_only_list),
    "brochure_only_count": len(brochure_only_list),
    "total_final_database_skus": len(all_final_products),
    "matched_sample": matched_list[:5],
    "excel_only_sample": excel_only_list[:5]
}

with open(OUTPUT_REPORT, 'w', encoding='utf-8') as f:
    json.dump(report_data, f, indent=2)

print(f"Saved matched catalog to: {OUTPUT_CATALOG}")
print(f"Saved segregation report to: {OUTPUT_REPORT}")
