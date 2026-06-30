import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

const DOCX_SKILL_INSTRUCTIONS = `# Documents (.docx, .doc)

Run everything through the sandbox \`bash\` tool. Write
deliverables to \`/files/conversation/\` so the user can download them.

## 1. Inspect before you touch
When an existing document is in play, the **very first** action is to
inspect it with \`docx_inspect\` — never \`pandoc\` blind (pandoc drops
paragraph style names, fields, and document structure; you'll silently
rebuild a doc that looks the same but no longer carries any of the
template's metadata) and never go straight to PDF rendering (soffice +
pdftoppm is slow and useless for finding the style name of a paragraph).

\`\`\`bash
docx_inspect /files/conversation/doc.docx                 # overview + heading outline
docx_inspect /files/conversation/doc.docx --styles        # named styles with typography
docx_inspect /files/conversation/doc.docx --paragraphs    # paragraphs with pStyle + text
docx_inspect /files/conversation/doc.docx --tables        # table widths
docx_inspect /files/conversation/doc.docx --sections      # page size, margins, orientation
docx_inspect /files/conversation/doc.docx --fields        # TOC, REF, ... with stale-state flag
docx_inspect /files/conversation/doc.docx --text          # readable text with structural markers
docx_inspect /files/conversation/doc.docx --media         # embedded images / audio / video
\`\`\`

\`--styles\` reports, for every paragraph and character style, the
typeface / size / weight / color / alignment that the style chain
explicitly sets (typically "Heading1: 14pt bold #365F91") — apply the
style by name rather than rebuild the look with inline run formatting.

Render pages to images **only** for final visual QA (see section 4),
not for exploratory reading.

## 2. Apply named styles, do not restyle inline
The docx equivalent of "use the placeholder, don't drop a text box":
the template defines named paragraph styles (Heading1, Heading2,
Title, Quote, Caption, List Bullet, …) and that's where the
typography lives. **Apply the style name; do not re-implement the
visual look with inline run formatting.**

- **Headings**: apply \`pStyle="Heading1"\` (or \`Heading2\` …
  \`Heading9\`). A paragraph with \`font.size = 28, bold = true\` and
  \`pStyle = Normal\` does **not** appear in the TOC, does not show up
  in the navigation pane, and is invisible to assistive tech. Take
  the style name and outline level straight from
  \`docx_inspect --styles\`.
- **Body text**: the default style is \`Normal\`. Don't set
  \`font.name\` / \`font.size\` / \`font.color\` on runs unless you
  intentionally want a *local* override; the named style already has
  the right defaults.
- **Quote / Caption / List Paragraph / Subtitle**: use the existing
  built-in style names rather than reproducing the look with run
  formatting.

When editing an existing template, **match its conventions**:
\`docx_inspect --styles\` reports the exact font and color the
template uses for each named style — don't introduce a new style with
a different typeface unless the user asks for one.

## 3. Use python-docx — always
Use \`python-docx\` for every docx operation: reading, editing, and
creating from scratch. Do not reach for \`docx-js\`, \`pandoc\`, raw XML
editing, or any other tool. Stick to python-docx and the wider Python
ecosystem (e.g. \`Pillow\` for images) and you will preserve the styles
table, theme bindings, and style references the template depends on.

\`\`\`python
from docx import Document
doc = Document("/files/conversation/doc.docx")
doc.add_paragraph("Section A", style="Heading 1")
doc.add_paragraph("Body text follows.")
doc.save("/files/conversation/doc.docx")
\`\`\`

Legacy \`.doc\` files must be converted to \`.docx\` first:
\`soffice --headless --convert-to docx document.doc\`.

## 4. QA (mandatory before delivery)
Two passes. Both required — never ship after only the structural pass.

1. **Structural** —
   \`docx_inspect doc.docx\`, then \`--styles\`, \`--paragraphs\`,
   \`--fields\`. Confirm:
   - the heading outline lists every section you authored — a missing
     entry means that paragraph isn't using a HeadingN style; fix it by
     applying \`pStyle="HeadingN"\` instead of inline bold/size,
   - no \`--fields\` row is flagged \`stale\` (the TOC and any cross-
     references must be refreshed; LibreOffice headless conversion
     refreshes fields, so a round-trip
     \`soffice --headless --convert-to docx --outdir /tmp doc.docx\` is
     the simplest way to clear them),
   - no template placeholder text leftover ("Click here to enter
     text.", "Error! No table of contents entries found.", "Lorem
     ipsum", "xxxx").

2. **Visual** — render every page and \`Read\` each image:
   \`\`\`bash
   docx_inspect /files/conversation/doc.docx --render
   \`\`\`
   Prints one absolute path per page
   (\`/tmp/docx_render/<doc>/page-001.jpg\`, …). For **every** path
   printed, use the \`Read\` tool to load the image into context. Do
   not stop after one or two. On each page, check for:
   - text overflowing into the margins or off the page,
   - headings rendered as plain body text (style not applied),
   - orphaned headings (heading at the bottom of a page with no
     content beneath),
   - broken table widths (cells overlapping, columns crushed),
   - low-contrast text (light on light, dark on dark),
   - placeholder leftovers visible in the rendering.

   When you find an issue, fix that page via \`python-docx\`, then
   re-render only that page for a fast loop:
   \`\`\`bash
   docx_inspect /files/conversation/doc.docx --render --page 3
   \`\`\`
   \`Read\` just that one image, confirm the fix, move on. Do not
   declare the doc done until every page has been \`Read\` clean.
`;

export const docxSkill = {
  sId: "docx",
  name: "Documents",
  userFacingDescription:
    "Read, edit, and create text documents (.docx) in the sandbox.",
  agentFacingDescription:
    "Work with .docx and .doc files in the sandbox using python-docx.",
  instructions: DOCX_SKILL_INSTRUCTIONS,
  exposeInstructions: true,
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags);
  },
} as const satisfies GlobalSkillDefinition;
