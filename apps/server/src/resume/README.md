Guideian CV Toolkit - Server
=================================

This folder implements the server-side components for the CV Toolkit MVP. It provides endpoints for:

- Uploading / importing CV files (PDF/DOCX) with fallback OCR for scanned PDFs
- OCR for image uploads
- Parsing plain text into structured fields (name, contact, skills, experience, education)
- Template preview and export (PDF and DOCX)

Key files:

- `ocr.service.ts` - Tesseract.js-based OCR (local). Optional: replace with a cloud provider.
- `linkedin.service.ts` - Helper to exchange code for token and fetch profile data.
- `parser.service.ts` - Heuristic parser for extracting fields from plain text resumes.
- `export.service.ts` - Renders a minimal HTML template and exports to PDF (Puppeteer) and DOCX (docx).

Environment variables
---------------------

The following environment variables are referenced by these services. Configure them in your server environment or `.env` file:

- `OCR_URL` - Optional: external OCR service endpoint (used as fallback in `resume.service.ts`).
- `CHROME_PATH` - Optional: path to Chrome/Chromium binary for Puppeteer.

Optional dependencies (install when using the corresponding features)
-----------------------------------------------------------------

npm install --save tesseract.js puppeteer-core docx pdf-parse mammoth pdf2pic

Notes & Next steps
------------------
- The parser is a best-effort heuristic and should be replaced by a robust NLP extractor or third-party parsing API for production.
- For high-volume OCR/PDF processing, offload to Google Vision API or another managed OCR service. Update `OcrService` to implement that provider and register via DI.
- The LinkedIn endpoints in this implementation are helpers — the real OAuth redirect should be performed by the client or a dedicated auth controller to manage state and CSRF protection.
