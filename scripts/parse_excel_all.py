import pandas as pd
import json
import os

files = {
    'upkar_master': 'public/Product_Master_14072026130716.xls',
    'swasthik_master': 'public/Product_Master_14072026140700.xls',
    'upkar_cat': 'public/Product_Category_14072026130742.xls',
    'swasthik_cat': 'public/Product_Category_14072026140715.xls',
}

def load_excel_table(filepath, header_row=6):
    df = pd.read_excel(filepath, header=header_row)
    # drop completely empty rows
    df = df.dropna(how='all')
    return df

print("--- Parsing Upkar Master ---")
df_upkar = load_excel_table(files['upkar_master'], header_row=6)
print(f"Upkar total product rows: {len(df_upkar)}")
print("Columns:", list(df_upkar.columns))

print("\n--- Parsing Swasthik Master ---")
df_swasthik = load_excel_table(files['swasthik_master'], header_row=6)
print(f"Swasthik total product rows: {len(df_swasthik)}")
print("Columns:", list(df_swasthik.columns))

print("\n--- Parsing Upkar Categories ---")
df_upkar_cat = load_excel_table(files['upkar_cat'], header_row=6)
print(f"Upkar categories count: {len(df_upkar_cat)}")

print("\n--- Parsing Swasthik Categories ---")
df_swasthik_cat = load_excel_table(files['swasthik_cat'], header_row=6)
print(f"Swasthik categories count: {len(df_swasthik_cat)}")

# Cleaning function for product record
def clean_product_record(row, source_distributor):
    name = str(row.get('Product Name', '')).strip()
    code = row.get('Code', '')
    drug_name = str(row.get('Drug Name', '')).strip() if pd.notna(row.get('Drug Name')) else ""
    packing = str(row.get('Packing', '')).strip() if pd.notna(row.get('Packing')) else ""
    mfr = str(row.get('MFR', '')).strip() if pd.notna(row.get('MFR')) else ""
    supplier = str(row.get('Supplier', '')).strip() if pd.notna(row.get('Supplier')) else ""
    
    mrp = float(row.get('Recent MRP')) if pd.notna(row.get('Recent MRP')) else 0.0
    pur_rate = float(row.get('Recent PurRate')) if pd.notna(row.get('Recent PurRate')) else 0.0
    sal_rate = float(row.get('Recent SalRate')) if pd.notna(row.get('Recent SalRate')) else 0.0
    ptr = float(row.get('Recent PTR')) if pd.notna(row.get('Recent PTR')) else 0.0
    pts = float(row.get('Recent PTS')) if pd.notna(row.get('Recent PTS')) else 0.0
    
    hsn = str(row.get('HSN', '')).strip() if pd.notna(row.get('HSN')) else ""
    gst = float(row.get('GST Tax%')) if pd.notna(row.get('GST Tax%')) else 0.0
    stock_status = str(row.get('Stock Status', '')).strip() if pd.notna(row.get('Stock Status')) else "Not Available"
    
    return {
        "distributor": source_distributor,
        "code": code,
        "name": name,
        "drug_name": drug_name,
        "packing": packing,
        "manufacturer": mfr,
        "supplier": supplier,
        "mrp": mrp,
        "pur_rate": pur_rate,
        "sal_rate": sal_rate,
        "ptr": ptr,
        "pts": pts,
        "hsn": hsn,
        "gst_percent": gst,
        "stock_status": stock_status
    }

upkar_products = [clean_product_record(row, "Upkar Pharma") for _, row in df_upkar.iterrows() if pd.notna(row.get('Product Name'))]
swasthik_products = [clean_product_record(row, "Swasthik Pharma") for _, row in df_swasthik.iterrows() if pd.notna(row.get('Product Name'))]

print(f"\nCleaned Upkar Products count: {len(upkar_products)}")
print(f"Cleaned Swasthik Products count: {len(swasthik_products)}")

# Unique products combined
combined_map = {}
for p in upkar_products + swasthik_products:
    key = p['name'].upper()
    if key not in combined_map:
        combined_map[key] = p
    else:
        # Merge info if needed
        if not combined_map[key]['drug_name'] and p['drug_name']:
            combined_map[key]['drug_name'] = p['drug_name']
        if not combined_map[key]['packing'] and p['packing']:
            combined_map[key]['packing'] = p['packing']
        if not combined_map[key]['manufacturer'] and p['manufacturer']:
            combined_map[key]['manufacturer'] = p['manufacturer']

print(f"Total Combined Unique Product Names across both Excel files: {len(combined_map)}")

# Save parsed json
output_path = 'public/excel_products_parsed.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump({
        "upkar_count": len(upkar_products),
        "swasthik_count": len(swasthik_products),
        "combined_unique_count": len(combined_map),
        "upkar_products": upkar_products,
        "swasthik_products": swasthik_products,
        "unique_products": list(combined_map.values())
    }, f, indent=2)

print(f"Saved parsed excel products to {output_path}")
