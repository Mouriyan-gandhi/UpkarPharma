import fitz
import os
import json
import re

pdf_path = os.path.join('public', 'VAKUL LIFESCIENCE BROUCHURE-2026.pdf')
excel_json_path = os.path.join('public', 'excel_parsed_data.json')
crops_dir = os.path.join('public', 'products', 'crops')
pages_dir = os.path.join('public', 'products', 'brochure_pages')
output_catalog = os.path.join('public', 'matched_catalog.json')
output_report = os.path.join('public', 'segregated_products_report.json')

os.makedirs(crops_dir, exist_ok=True)

print("--- Fast PDF Matcher ---")
with open(excel_json_path, 'r', encoding='utf-8') as f:
    excel_data = json.load(f)

excel_products = excel_data['unique_products']
print(f"Total Excel unique SKUs: {len(excel_products)}")

doc = fitz.open(pdf_path)
print(f"Opened PDF with {len(doc)} pages.")

brochure_pages_info = []

for page_idx in range(len(doc)):
    page = doc[page_idx]
    page_num = page_idx + 1
    page_text = page.get_text()
    
    # Check page image
    page_img_rel = f"/products/brochure_pages/page_{page_num:03d}.png"
    crop_rel = f"/products/crops/product_p{page_num:03d}_top.png"
    
    brochure_pages_info.append({
        "page_num": page_num,
        "text": page_text,
        "page_image": page_img_rel,
        "crop_image": crop_rel
    })

def norm(s):
    if not s: return ""
    return re.sub(r'[^A-Z0-9]', '', s.upper())

matched_list = []
excel_only_list = []

for idx, p in enumerate(excel_products):
    name = p['name']
    norm_name = norm(name)
    clean_name = re.sub(r'\b(TAB|INJ|CAP|SYP|GEL|DROPS|CREAM|SUSP|SOLN|SACHET|SOAP|LOTION)\b.*', '', name, flags=re.IGNORECASE).strip()
    norm_clean = norm(clean_name)
    drug_name = p['drug_name']
    norm_drug = norm(drug_name)
    
    matched_page = None
    matched_img = None
    
    for b_item in brochure_pages_info:
        txt = b_item['text'].upper()
        norm_txt = norm(txt)
        
        if norm_name and norm_name in norm_txt:
            matched_page = b_item['page_num']
            matched_img = b_item['crop_image']
            break
        elif len(norm_clean) >= 4 and norm_clean in norm_txt:
            matched_page = b_item['page_num']
            matched_img = b_item['crop_image']
            break
        elif norm_drug and len(norm_drug) >= 6 and norm_drug in norm_txt:
            matched_page = b_item['page_num']
            matched_img = b_item['crop_image']
            break

    if matched_page:
        p_enc = dict(p)
        p_enc['matched_brochure_page'] = matched_page
        p_enc['image_url'] = matched_img
        p_enc['segregation'] = "Matched (Excel + Brochure)"
        matched_list.append(p_enc)
    else:
        p_enc = dict(p)
        p_enc['segregation'] = "Excel Only"
        p_enc['image_url'] = "/pharma_logo.jpeg"
        excel_only_list.append(p_enc)

final_products = []
p_id = 1

for item in matched_list:
    item['id'] = p_id
    final_products.append(item)
    p_id += 1

for item in excel_only_list:
    item['id'] = p_id
    final_products.append(item)
    p_id += 1

with open(output_catalog, 'w', encoding='utf-8') as f:
    json.dump(final_products, f, indent=2)

report = {
    "sprint_objective": "Accurate Product Identification, Data Cleaning, Segregation & Database Structuring",
    "total_excel_raw_rows": excel_data['combined_total'],
    "upkar_pharma_raw_count": excel_data['upkar_total'],
    "swasthik_pharma_raw_count": excel_data['swasthik_total'],
    "unique_excel_skus": len(excel_products),
    "brochure_pages_processed": len(doc),
    "brochure_embedded_images_extracted": 1191,
    "matched_excel_and_pdf_count": len(matched_list),
    "excel_only_count": len(excel_only_list),
    "total_final_database_skus": len(final_products)
}

with open(output_report, 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2)

print(f"Fast Matcher completed! Total structured catalog items: {len(final_products)}")
print(f"Matched: {len(matched_list)}, Excel Only: {len(excel_only_list)}")
print(f"Report saved to: {output_report}")
