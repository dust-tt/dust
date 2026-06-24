import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

const PPTX_SKILL_INSTRUCTIONS = `# Slide decks (.pptx)

## 1. Pick the workflow first

Two workflows. Decide which one applies **before** writing any code:

- **Template-as-shell** — user hands you a deck whose role is "use this
  look": a template, a sample deck, a starter, a style reference. The
  template's own slides are *exemplars*, not content to keep. Your output
  is a **new file** that inherits the template's masters, layouts, theme,
  and embedded media (logos, footers) but contains *only* your generated
  slides. This is the default whenever a deck is provided without an
  explicit edit verb.
- **Edit-in-place** — user explicitly used a verb like *edit, update,
  modify, fix, change, tweak, adjust, revise* against a deck whose existing
  slides have content the user wants kept. Modify the file at its existing
  path.

**When in doubt, choose template-as-shell.** Keeping all template
exemplars and appending new slides at the end (the most common failure
mode) is strictly worse than the inverse: the user has to delete by hand,
whereas regenerating when edit was wanted is recoverable from the original
file the user still has.

## 2. Inspect before you touch

Whichever workflow you're in, the **very first** action is \`pptx_inspect\`
— never \`markitdown\` blind (markitdown drops layouts, placeholders,
positioning, charts, and embedded media; you'd silently rebuild a broken
deck) and never go straight to PDF rendering (soffice + pdftoppm is slow
and burns vision tokens).

\`\`\`bash
pptx_inspect /files/conversation/deck.pptx                 # overview + theme + word density
pptx_inspect /files/conversation/deck.pptx --slide 3       # one slide's shapes
pptx_inspect /files/conversation/deck.pptx --layouts       # masters & layout placeholders
pptx_inspect /files/conversation/deck.pptx --text          # all readable text per slide
pptx_inspect /files/conversation/deck.pptx --media         # embedded images / audio / video
\`\`\`

The overview reports the deck's **theme** on its own line (theme name,
background, main text color, six accent colors), the deck's **fonts** on a
second line (the dominant title and body typefaces resolved from the
layouts, plus the theme's major/minor fallback used for runs outside
placeholders), and the **word-density envelope** the template uses:
\`words/slide: avg=X max=Y\` at the deck level and \`words:N\` per slide.
Use the fonts line as your typography contract — \`theme-fallback\` only
applies to custom shapes that bypass placeholder inheritance. Use the
word-density numbers as your ceiling in section 4.

\`--layouts\` reports, for every placeholder of every layout, the resolved
typeface, size, weight, color, and alignment. This is what tells you the
template wants Lexend 28pt bold for titles, not Calibri 18pt.

The \`--slide\` view shows each shape with its position and size in inches,
placeholder type, and per-paragraph text with typography. It also emits
explicit warnings prefixed with \`[!]\`:

- \`[!] EMPTY PLACEHOLDER — will render layout prompt text\` — the
  placeholder exists but is empty; PowerPoint will draw "Click to add
  title" / "Click to add Text" on top of your slide. Populate it
  (section 3) before moving on.
- \`[!] EMPTY PLACEHOLDER COVERED BY shape #N — delete the placeholder\` —
  same problem, but another shape on the slide (the named one) already
  fills that region with intentional content (a chart image, a table, a
  callout). Populating the placeholder would stack text behind that shape
  and re-introduce the "Click to add …" prompt if the cover shape ever
  moves. Delete the placeholder instead:
  \`\`\`python
  sp = slide.placeholders[idx]    # idx reported by --layouts
  sp.element.getparent().remove(sp.element)
  \`\`\`
- \`[!] manual bullet glyph in placeholder — remove\` — you typed
  \`•\`, \`·\`, \`-\`, \`–\`, or \`*\` at the start of a paragraph in a
  placeholder whose layout already renders bullets. The result is a
  doubled marker ("● • text"). Remove the glyph; use \`paragraph.level\`
  (section 3).
- \`[!] extends past slide edge\` — the shape's right or bottom edge is
  off the slide. Resize or reposition.

**Every \`[!]\` line is a blocker.** Structural QA is not done until they
are all gone (section 6.1).

Render slides to images **only** for final visual QA (section 6.2), not
for exploratory reading.

## 3. Author against the template

### Template-as-shell: strip the existing slides, then add yours

\`python-pptx\` has no first-class slide-delete API. The standard recipe
pops entries from the package's \`sldIdLst\` and drops their relationships,
leaving masters, layouts, theme, and media intact:

\`\`\`python
from pptx import Presentation
from pptx.oxml.ns import qn

prs = Presentation("/files/conversation/template.pptx")
sld_id_lst = prs.slides._sldIdLst
rels = prs.part.rels
for sld_id in list(sld_id_lst):
    rId = sld_id.get(qn("r:id"))
    rels.pop(rId, None)
    sld_id_lst.remove(sld_id)
prs.save("/files/conversation/output.pptx")  # never overwrite the template
\`\`\`

Re-open the empty shell and add slides via \`prs.slide_layouts[...]\`:

\`\`\`python
prs = Presentation("/files/conversation/output.pptx")
layout = next(l for l in prs.slide_layouts if l.name == "TITLE_AND_BODY")
slide = prs.slides.add_slide(layout)
slide.shapes.title.text = "Q4 results"
slide.placeholders[1].text_frame.text = "Highlights"
prs.save("/files/conversation/output.pptx")
\`\`\`

### Edit-in-place: open and save to the original path

\`\`\`python
prs = Presentation("/files/conversation/deck.pptx")
# ... mutate ...
prs.save("/files/conversation/deck.pptx")
\`\`\`

### Always populate the layout's placeholders

Layouts ship with empty title / body / subtitle placeholders. **You must
fill them.** An empty placeholder renders as "Click to add …" in
PowerPoint — the prompt text is not stored in the file, it's generated by
the renderer whenever the placeholder is empty, so adding a parallel text
box on top does **not** suppress it. The \`[!] EMPTY PLACEHOLDER\` warning
in \`--slide\` output is your safety net.

- Title: \`slide.shapes.title.text = "Q4 results"\` (works for both \`title\`
  and \`center_title\`).
- Other placeholders: \`slide.placeholders[idx].text_frame.text = "..."\`
  where \`idx\` is the value reported by \`pptx_inspect --layouts\`.

### Never type bullet glyphs in body placeholders

Body placeholders render bullets *from the layout* based on paragraph
level. Typing \`•\`, \`·\`, \`-\`, \`–\`, or \`*\` at the start of a
paragraph stacks your glyph on top of the layout's, producing "● • text".
Use \`paragraph.level\` instead:

\`\`\`python
# BAD — produces double bullets ("● • Revenue Model")
tf.text = "• Revenue Model"
tf.add_paragraph().text = "• MRR end of month"

# GOOD — let the layout draw the bullets
tf = slide.placeholders[1].text_frame
tf.text = "Revenue Model"                    # level 0, layout draws the bullet
sub = tf.add_paragraph()
sub.text = "MRR end of month"
sub.level = 1                                 # nested bullet style from layout
\`\`\`

If you need bullet-shaped content in a *non-placeholder* text box, you
have to draw the bullets manually (no inherited list style) — but that's
a fallback, not the default; prefer the body placeholder.

### Defer to placeholder defaults for typography

The layout already defines typeface, size, color, weight, and alignment
for each placeholder — exactly what \`--layouts\` prints. Write the text
and leave \`font.name\`, \`font.size\`, \`font.color\` unset on runs; they
inherit from the layout. Override only when you intentionally want a
different style for a specific run.

If you must add a custom shape outside a placeholder (a callout, a
sidebar, a label), copy the typeface and color from the matching
placeholder in \`--layouts\`. Otherwise the run falls back to the theme's
major/minor latin font (commonly Arial or Calibri) and the slide looks
foreign next to the rest of the deck.

### Recommended order

1. \`pptx_inspect template.pptx\` — read the theme header, note
   \`words/slide: avg=… max=…\`, skim the per-slide layout choices.
2. \`pptx_inspect template.pptx --layouts\` — record, for each layout
   you'll use, the placeholder \`idx\`, type, and resolved
   typeface / size / color.
3. \`pptx_inspect template.pptx --text\` — read the existing slides as
   exemplars: tone, density, structure.
4. Strip slides (template-as-shell) or open existing (edit-in-place),
   author with \`python-pptx\`, save to the output path.

## 4. Design guidance

### Match the template's information density

The overview reports \`words/slide: avg=X max=Y\` for the template. **Treat
\`max\` as a hard ceiling for every slide you generate.** If the template
averages ~25 words per slide, your slides should too. The template *is*
the design contract — exceeding its density is the single most common way
to produce a slide that "doesn't look like the template" even when fonts
and colors match.

If your content needs more text than the template's max allows, the
overflow goes into **speaker notes**, not the slide:

\`\`\`python
slide.notes_slide.notes_text_frame.text = "Detailed talking points here…"
\`\`\`

Notes are visible in presenter view and don't bloat the rendered slide.
Use them liberally for context the audience hears but doesn't read.

### Charts and embedded images must match the template

A matplotlib chart with default styling on a navy slide reads as a
mismatched screenshot, no matter how good the data is. Two rules:

1. **Prefer native python-pptx charts** (\`XL_CHART_TYPE.BAR_CLUSTERED\`,
   \`LINE\`, etc.) when the data is tabular. They inherit the theme palette
   and typography automatically. Drop down to matplotlib only when the
   chart type isn't natively supported (combo charts, complex annotations).

2. **If you must use matplotlib**, pull background and series colors from
   the theme (the bracketed line in \`pptx_inspect\` overview reports
   \`bg1\`, \`tx1\`, and six accent colors):

   \`\`\`python
   import matplotlib.pyplot as plt

   BG = "#0F1A2E"            # bg1 from theme overview
   FG = "#F8FAFC"            # tx1 from theme overview
   ACCENTS = ["#3B82F6", "#10B981", "#F59E0B"]  # accent1..N from theme overview

   fig, ax = plt.subplots(facecolor=BG)
   ax.set_facecolor(BG)
   for spine in ax.spines.values():
       spine.set_color(FG)
   ax.tick_params(colors=FG)
   ax.title.set_color(FG)
   ax.xaxis.label.set_color(FG)
   ax.yaxis.label.set_color(FG)
   for bar, color in zip(bars, ACCENTS):
       bar.set_color(color)
   fig.savefig("/tmp/chart.png", facecolor=BG, dpi=150, bbox_inches="tight")
   \`\`\`

   Then insert the PNG via \`slide.shapes.add_picture(...)\`.

### Slide-level rules

- Pick a content-informed accent palette from the theme's six accents; do
  not pull colors from outside the theme.
- Every slide needs a visual element (image, chart, icon, shape). Text-only
  slides are forgettable.
- Title 36–44pt bold, body 14–16pt. Left-align body text, center only titles.
- Keep ≥0.5" page margins. The bottom 0.5" of the slide is typically where
  the template's logo/footer sits on the master — **any content shape
  extending into that region is overflow, not layout**. Move it up or split
  the slide.
- Vary layouts across slides; do not repeat the same template.
- Never draw thin accent lines under titles.
Use whitespace or background color for hierarchy instead.


## 5. QA (mandatory before delivery)

Two passes. Both are required — never ship after only the structural pass.
The visual pass is where text overflow, off-center elements, and uneven
gaps actually surface; structural inspection alone cannot catch them.

### 5.1 Structural

Run \`pptx_inspect output.pptx\`, \`pptx_inspect output.pptx --text\`, and
\`pptx_inspect output.pptx --slide N\` for every authored slide. Confirm:

- The deck contains **only your generated slides** — no template
  exemplars left over. Template-as-shell deliveries that ship with the
  template's original slides still attached are a hard fail.
- Every slide uses the layout you intended.
- **Zero \`[!]\` warnings remain** in \`--slide\` output. Specifically:
  - No \`[!] EMPTY PLACEHOLDER\` — populate via
    \`slide.shapes.title.text\` or \`slide.placeholders[idx]\`.
  - No \`[!] manual bullet glyph in placeholder\` — remove the glyph; use
    \`paragraph.level\` for nesting.
  - No \`[!] extends past slide edge\` — resize or reposition.
- Per-slide \`words:N\` ≤ the template's \`max\` reported in the overview.
- Typography on populated runs matches \`--layouts\` (or is an intentional
  override).
- No template leftovers (\`xxxx\`, \`lorem ipsum\`, draft titles).

### 5.2 Visual

Render every slide and \`Read\` each image:

\`\`\`bash
pptx_inspect /files/conversation/output.pptx --render
\`\`\`

This prints one absolute path per slide
(\`/tmp/pptx_render/<deck>/slide-001.jpg\`, …). For **every** path printed,
load the image with the \`Read\` tool. Do not stop after one or two —
every slide must be inspected before delivery.

For each rendered slide, run through this checklist explicitly in your
response (one short line per slide naming what you checked and what you
saw — silent "looks fine" is not acceptable):

- text running outside its placeholder or off the slide
- text overlapping the template's logo/footer region (bottom 0.5")
- "strikethrough"-shaped lines through numbers or text — almost always
  two overlapping shapes, not intentional formatting
- elements not centered / not aligned with their column
- low-contrast text (light on light, dark on dark)
- uneven gaps between content blocks
- content closer than ~0.5" to the slide edges
- placeholder leftovers visible in the rendering ("Click to add …")
- chart background / palette clashing with the slide background

When you find an issue, fix the slide via \`python-pptx\`, then re-render
just that slide for a fast loop:

\`\`\`bash
pptx_inspect /files/conversation/output.pptx --render --slide 3
\`\`\`

\`Read\` only that one image, confirm the fix, move on. Do not declare the
deck done until every slide has been \`Read\` clean.
`;

export const pptxSkill = {
  sId: "pptx",
  name: "Slide decks",
  userFacingDescription: "Read, edit, and create slide presentations (.pptx)",
  agentFacingDescription:
    "Work with .pptx files in the sandbox. Includes the pptx_inspect tool " +
    "for paginated structural inspection of decks (slides, layouts, shapes, " +
    "text, charts, tables, media) so existing decks can be adapted in place " +
    "via python-pptx rather than rebuilt from scratch with pptxgenjs.",
  instructions: PPTX_SKILL_INSTRUCTIONS,
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "ActionSlideshowIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags, "sandbox_tools");
  },
} as const satisfies GlobalSkillDefinition;
