import os
import sys

pdf_path = os.path.join('public', 'VAKUL LIFESCIENCE BROUCHURE-2026.pdf')

print("Checking PDF file size:", os.path.getsize(pdf_path) if os.path.exists(pdf_path) else "Not found")

# Try PyMuPDF (fitz) or pypdf or pdfplumber
try:
    import fitz
    doc = fitz.open(pdf_path)
    print(f"PyMuPDF open success! Total pages: {len(doc)}")
    for i in range(min(5, len(doc))):
        page = doc[i]
        text = page.get_text()
        print(f"--- Page {i+1} sample text (length {len(text)}) ---")
        print(text[:300])
        print("Images count on page:", len(page.get_images()))
except Exception as e:
    print("fitz error:", e)
    try:
        import pypdf
        reader = pypdf.PdfReader(pdf_path)
        print(f"pypdf open success! Total pages: {len(reader.pages)}")
        for i in range(min(5, len(reader.pages))):
            text = reader.pages[i].extract_text()
            print(f"--- Page {i+1} sample text ---")
            print(text[:300] if text else "No text found")
    except Exception as e2:
        print("pypdf error:", e2)
