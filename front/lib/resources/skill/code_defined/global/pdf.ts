import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

// Library choices are limited to the tools registered in api/sandbox/image/registry.ts.
/**
 * @cc [owner:flvndvd,label:performance] pdf-ocr-bounded-verification
 * For routine extraction, the instructions MUST limit OCR refinement to one
 * targeted retry per unclear region or failed page, then require delivery with
 * any remaining uncertainty disclosed. Deeper verification requires a user request.
 */
const PDF_SKILL_INSTRUCTIONS = `# PDFs

Use the Computer's \`bash\` tool for PDF operations. Inputs are mounted under
\`/files/conversation\` (or \`/files/pod\` inside a Pod). Copy inputs to \`/tmp\`
before repeated reads or rendering. Keep scratch files there. Save requested
deliverables under \`/files/conversation\`, using a new filename to preserve the source.

## Available tools

- Poppler: \`pdftotext\` extracts embedded text, \`pdftoppm\` renders pages,
  and \`pdfimages\` extracts embedded images.
- \`pypdf\`: page-aware text extraction and PDF manipulation.
- \`pdfplumber\`: text positions, cropping, and table extraction.
- \`tesseract\` and \`pytesseract\`: OCR with English (\`eng\`), French (\`fra\`),
  and orientation/script detection (\`osd\`) data.
- \`reportlab\`: PDF creation.
- \`qpdf\`: PDF manipulation and structural checks.
- \`Pillow\` and \`pdf2image\`: image processing and PDF rendering from Python.

These are already installed. Do not install packages or assume tools such as
PyMuPDF, pdf-lib, pdftk, or OCRmyPDF are available.

## 1. Read and extract text

Start with embedded text for reading, summarizing, or searching a PDF:

\`\`\`bash
cp /files/conversation/report.pdf /tmp/report.pdf
pdftotext /tmp/report.pdf /tmp/report.txt
\`\`\`

Search the result with \`rg\` and read relevant excerpts instead of returning the
whole document to the conversation. Use \`-layout\` when physical spacing helps.
It does not guarantee correct column order or table structure. To limit extraction
to PDF pages 3 through 5: \`pdftotext -f 3 -l 5 /tmp/report.pdf /tmp/excerpt.txt\`.

For page references and detecting pages with no embedded text, use \`pypdf\`:

\`\`\`python
from pypdf import PdfReader

reader = PdfReader("/tmp/report.pdf")
with open("/tmp/report-by-page.txt", "w", encoding="utf-8") as output:
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if not text.strip():
            text = "[No embedded text: inspect the rendered page.]"
        output.write(f"--- PDF page {page_number} ---\\n{text}\\n\\n")
\`\`\`

PDF page indices in Python start at 0. Command-line page ranges start at 1.
Distinguish PDF page positions from printed page numbers when citing content.
A nonempty extract can still miss scanned pages, figures, or text within images.
Check the pages relevant to the request. Do not treat missing text as an empty page.

## 2. Extract tables

Use \`pdfplumber\` to inspect a selected page and extract its tables:

\`\`\`python
import json
import pdfplumber

with pdfplumber.open("/tmp/report.pdf") as document:
    tables = document.pages[2].extract_tables()
with open("/tmp/page-3-tables.json", "w", encoding="utf-8") as output:
    json.dump(tables, output, ensure_ascii=False, indent=2)
\`\`\`

Inspect the rendered page to verify headers, merged cells, row boundaries, and units
before using the values. An empty table list does not prove there is no table.
Crop to the table or adjust extraction settings if necessary. Preserve blanks and
source page references. Do not combine unrelated tables or invent missing values.

## 3. OCR scans and inspect visual content

Use Tesseract when embedded text is missing or garbled in a printed scan.
For charts, layout, or other visual content, render the relevant pages and
inspect their images. Neither \`pypdf\` nor \`pdfplumber\` performs OCR on its own.

Check \`tesseract --list-langs\` and select the document's language. Use \`eng\`,
\`fra\`, or \`eng+fra\` for mixed English/French text. \`osd\` detects orientation
and scripts. It is not a recognition language. For unsupported languages,
handwriting, or failed recognition, use vision and mark any illegible content.
If an older Computer lacks Tesseract, use the same vision fallback and disclose
that OCR was unavailable. Do not try to install missing engines or language data.

For routine OCR or text extraction, use this stopping rule:

- Run OCR once per requested scanned page. Check the result for page coverage,
  readability, and obvious omissions. If it answers the request, deliver it.
- If a specific passage is unclear or missing, inspect that region with
  \`files__cat\` before retrying. Allow at most one targeted OCR retry per affected
  region or failed page, using a correction suggested by the image, such as
  cropping or fixing rotation. Do not sweep page segmentation modes, languages,
  or preprocessing variants just to compare plausible outputs.
- After that check or retry, deliver the extracted text and mark any remaining
  uncertainty or unreadable pages. Do not keep refining unless the user asked
  for deeper verification. Reuse existing renders for previews and crops.

Transcribe what the document says. Validate identifiers, recalculate totals, or
check domain rules only when the user requests that analysis. Never replace an
ambiguous character with a guess derived from a checksum or expected value.

For a scanned PDF, render and OCR one page at a time to bound memory usage:

\`\`\`python
from pdf2image import convert_from_path
from pypdf import PdfReader
import pytesseract

source = "/tmp/report.pdf"
page_count = len(PdfReader(source).pages)
with open("/tmp/report-ocr.txt", "w", encoding="utf-8") as output:
    for page_number in range(1, page_count + 1):
        pages = convert_from_path(
            source, dpi=300, first_page=page_number, last_page=page_number,
            timeout=60,
        )
        with pages[0] as page:
            text = pytesseract.image_to_string(page, lang="eng", timeout=60)
        if not text.strip():
            text = "[No text recognized: inspect the rendered page.]"
        output.write(f"--- PDF page {page_number} ---\\n{text}\\n\\n")
\`\`\`

Limit the page range to the request. For mixed PDFs, retain embedded text from
searchable pages and OCR only the scans. A timeout can use the single retry at
a lower resolution. Report failed pages instead of silently omitting them.
OCR does not recover table structure reliably. For table extraction, follow
the table guidance above and keep any OCR retries within the stopping rule.

To make a scanned page searchable, create a PDF containing the page image and
a recognized text layer:

\`\`\`bash
pdftoppm -png -r 300 -f 3 -l 3 -singlefile /tmp/report.pdf /tmp/page-3
tesseract /tmp/page-3.png /tmp/page-3-searchable -l eng pdf
\`\`\`

Combine the resulting page PDFs in source order with \`pypdf\`. Preserve existing
searchable pages in mixed PDFs. Verify text extraction from the result as well
as page count, order, and appearance before calling it searchable.

For visual inspection, publish a smaller preview that fits the image tool limit:

\`\`\`bash
mkdir -p /files/conversation/.pdf_render/report
pdftoppm -jpeg -r 120 -f 3 -l 3 -singlefile /tmp/report.pdf /files/conversation/.pdf_render/report/page-3
\`\`\`

Open the resulting image with the \`files__cat\` tool using its scoped path,
\`conversation-<id>/.pdf_render/report/page-3.jpg\`, with the real conversation id
(use \`files__list\` to obtain the path if needed). A shell \`cat\` does not
show pixels, and \`files__cat\` cannot access \`/tmp\`. Images must
be at most 2 MB each. Resize or compress with Pillow if needed, keeping text legible.
Render a few pages at a time for large files. If the result contains no visible
image, report that limitation. Do not claim to have inspected or transcribed it.

When transcribing with vision, inspect every requested page and preserve page
boundaries. Describe vision-based transcription as such. It does not add a
searchable text layer to the original PDF. Only claim a searchable PDF when
you created and verified its text layer.

## 4. Create or modify PDFs

Use \`reportlab\` for new PDFs. Prefer Platypus (\`SimpleDocTemplate\`,
\`Paragraph\`, \`Table\`) for flowing text and tables. Use its canvas for precise
drawing. Set page size, margins, and styles deliberately. Embed fonts that cover
the requested characters and check their rendered glyphs. Escape user text before
passing it into Paragraph's markup parser.

Use \`pypdf\` or \`qpdf\` to preserve existing pages when merging, selecting,
or rotating them. For example, merge two PDFs:

\`\`\`python
from pypdf import PdfWriter

writer = PdfWriter()
writer.append("/tmp/part-one.pdf")
writer.append("/tmp/part-two.pdf")
writer.write("/tmp/combined.pdf")
writer.close()
\`\`\`

Use \`writer.append(source, pages=(start, stop))\` for a zero-based,
stop-exclusive page range. For forms, inspect \`PdfReader.get_fields()\` and
preserve the form structure with pypdf. An image of a form has no editable fields.
For encrypted inputs, use a password supplied by the user rather than guessing.

## 5. Validate and deliver

For extraction, confirm the requested page coverage, inspect suspicious results,
and disclose unreadable or omitted content within the OCR stopping rule above.
Save a text/CSV/JSON file only when it is a requested deliverable, and link it
from \`/files/conversation\`.

Before delivering a created or modified PDF, reopen it with \`pypdf\` and check
page count and order (\`qpdf --check\` can also check structure). Render every
new or visually changed page and inspect it with \`files__cat\`: check clipping,
overlaps, missing glyphs, unreadable text, table alignment, and placeholder content.
Fix the source, re-render affected pages, and inspect them again. Text extraction
alone cannot establish that the PDF looks correct. Copy the verified PDF to
\`/files/conversation\` and provide its file link.
`;

/**
 * @cc [owner:flvndvd,label:product] pdf-workspace-computer-availability
 * PDF skill availability MUST follow the workspace Computer feature, independently
 * of whether the Computer skill has been enabled in the current agent loop.
 */
export const pdfSkill = {
  sId: "pdf",
  kind: "global",
  name: "PDFs",
  userFacingDescription:
    "Read, OCR scans, extract text and tables, create, and edit PDFs in the Computer.",
  agentFacingDescription:
    "Use this skill when working with PDF files in the Computer: reading or extracting text and tables, " +
    "running OCR on scans, inspecting charts, creating searchable PDFs, or merging, splitting, and editing existing PDFs. " +
    "Includes page-aware extraction, targeted visual checks, and PDF validation using the installed libraries.",
  instructions: PDF_SKILL_INSTRUCTIONS,
  exposeInstructions: true,
  mcpServers: [{ name: "sandbox" }],
  version: 2,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags);
  },
} as const satisfies GlobalSkillDefinition;
