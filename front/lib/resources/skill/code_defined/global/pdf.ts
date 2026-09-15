import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

// Library choices follow api/sandbox/image/registry.ts.
/**
 * @cc [owner:flvndvd,label:product] pdf-operations-in-computer
 * PDF instructions MUST use Computer commands for file operations, extraction,
 * and OCR without requiring separate file-management MCP tools.
 */
/**
 * @cc [owner:flvndvd,label:performance] pdf-ocr-bounded-verification
 * For routine extraction, the instructions MUST allow at most one correction
 * pass over failed or unclear OCR output, then require delivery with remaining
 * uncertainty disclosed. Deeper verification requires a user request.
 */
const PDF_SKILL_INSTRUCTIONS = `# PDFs

Use the Computer's \`bash\` tool for PDF work. Inputs are mounted under
\`/files/conversation\` or \`/files/pod\` inside a Pod. Copy inputs to \`/tmp\`
for processing and keep intermediate files there. Save requested deliverables
under \`/files/conversation\` with a new filename to preserve the source.

## Installed tools

- Poppler: \`pdftotext\` for embedded text, \`pdftoppm\` for rendering,
  and \`pdfimages\` for embedded images.
- \`pypdf\` for page text, forms, merging, splitting, and rotation.
- \`pdfplumber\` for text positions and tables in text-based PDFs.
- \`tesseract\` and \`pytesseract\` for OCR with English (\`eng\`), French
  (\`fra\`), and orientation/script detection (\`osd\`) data.
- \`reportlab\` for PDF creation and \`qpdf\` for structural checks.
- \`Pillow\` and \`pdf2image\` for image processing and rendering from Python.

Do not install packages or assume other PDF libraries are available.

## Read and extract text

Start with embedded text:

\`\`\`bash
set -e
cp /files/conversation/report.pdf /tmp/report.pdf
pdftotext /tmp/report.pdf /tmp/report.txt
sed -n '1,160p' /tmp/report.txt
\`\`\`

Use \`rg\` to find relevant excerpts. Add \`-layout\` when physical spacing helps,
without assuming it preserves column order. Limit extraction to requested pages
with \`-f\` and \`-l\`, for example \`pdftotext -f 3 -l 5 input.pdf excerpt.txt\`.

For page references and missing-text detection:

\`\`\`python
from pypdf import PdfReader

reader = PdfReader("/tmp/report.pdf")
with open("/tmp/report-by-page.txt", "w", encoding="utf-8") as output:
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if not text.strip():
            text = "[No embedded text on this page.]"
        output.write(f"--- PDF page {page_number} ---\\n{text}\\n\\n")
\`\`\`

Python page indices start at 0. Command-line page ranges start at 1.
Distinguish PDF page positions from printed page numbers. A page with no
embedded text may contain a scan, and a text extract can omit image content.

## OCR scans

OCR requested pages whose embedded text is missing or unusable. Keep embedded
text from searchable pages in mixed PDFs. Check \`tesseract --list-langs\` and
select \`eng\`, \`fra\`, or \`eng+fra\` for mixed text. \`osd\` detects orientation
and scripts. It is not a recognition language.

Run one OCR pass, read the result, and confirm every requested page has text or
a failure marker. Deliver when the result answers the request. Retry only for
a specific problem, such as a timeout, detected rotation, or missing passage.
Use one correction pass on the affected pages or regions and preserve completed
output. Do not compare multiple segmentation modes or preprocessing variants.
Mark remaining uncertainty and stop unless the user requested deeper verification.

Preserve source wording and page references. Mark unclear characters instead of
inferring them from expected values. Perform additional analysis only when requested.

Render and OCR one page at a time to limit memory usage:

\`\`\`bash
set -e
pdftoppm -png -r 300 -f 1 -l 1 -singlefile /tmp/report.pdf /tmp/page-1
tesseract /tmp/page-1.png /tmp/page-1 -l eng txt tsv
sed -n '1,160p' /tmp/page-1.txt
\`\`\`

This produces text and word coordinates with confidence scores in one OCR pass.
Use the TSV only to investigate a specific extraction problem. Confidence scores
are not proof of accuracy. Crop with Pillow when the coordinates identify the
region to retry. Reuse existing renders and run small batches that fit the command
timeout. After a timeout, keep completed pages and reduce resolution for the retry.

If the engine or required language is unavailable, report the limitation.
Mark unreadable text, including handwriting that OCR cannot recover.

## Extract tables

For text-based PDFs, use \`pdfplumber\` on the selected page:

\`\`\`python
import json
import pdfplumber

with pdfplumber.open("/tmp/report.pdf") as document:
    tables = document.pages[2].extract_tables()
with open("/tmp/page-3-tables.json", "w", encoding="utf-8") as output:
    json.dump(tables, output, ensure_ascii=False, indent=2)
\`\`\`

Check headers, row boundaries, and units against the page's extracted text and
positions. Preserve blanks and page references. An empty table list does not prove
there is no table. For scanned tables, use OCR text and coordinates. \`pdfplumber\`
does not OCR images, and recognized words alone do not establish cell structure.
Mark uncertain cells or layout instead of inventing missing values.

## Create or modify PDFs

Use \`reportlab\` for new PDFs. Prefer Platypus for flowing text and tables, or
its canvas for precise drawing. Set page size and margins, embed fonts that cover
the requested characters, and escape user text passed into Paragraph markup.

Use \`pypdf\` or \`qpdf\` to preserve existing pages when merging, selecting,
or rotating them:

\`\`\`python
from pypdf import PdfWriter

writer = PdfWriter()
writer.append("/tmp/part-one.pdf")
writer.append("/tmp/part-two.pdf")
writer.write("/tmp/combined.pdf")
writer.close()
\`\`\`

Use \`writer.append(source, pages=(start, stop))\` for a zero-based,
stop-exclusive range. For forms, inspect \`PdfReader.get_fields()\` and preserve
the form structure. A page image alone has no editable fields. For encrypted inputs,
use a password supplied by the user.

To create a searchable PDF from a rendered scan:

\`\`\`bash
tesseract /tmp/page-1.png /tmp/page-1-searchable -l eng pdf
\`\`\`

Choose the requested output formats in the initial OCR call when possible.
Combine page PDFs in source order with \`pypdf\` and preserve existing searchable
pages. Verify that the result has extractable text before calling it searchable.

## Check and deliver

For extracted text, confirm page coverage and disclose unreadable or omitted
content. Save text, CSV, or JSON only when requested and link the resulting file.

For created or modified PDFs, reopen with \`pypdf\` to check page count and order.
Run \`qpdf --check\` and confirm the expected text with \`pdftotext\`. Render
changed pages with \`pdftoppm\` to catch rendering failures or produce requested
previews. These commands check structure and content. They do not provide visual
inspection through the Computer's text output. Do not claim the appearance was
visually checked. Save the PDF under \`/files/conversation\` and provide its link.
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
    "running OCR on scans, creating searchable PDFs, or merging, splitting, and editing existing PDFs. " +
    "Uses installed command-line tools and Python libraries for extraction and structural checks.",
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
