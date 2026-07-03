import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

const PPTX_SKILL_INSTRUCTIONS = `# Slide decks (.pptx)

A deck the user hands you — a template, sample, starter, style reference, or a
deck to revise — already encodes a design: masters, layouts, theme, embedded
fonts, and real slides with real images, charts, and tables. Your job is to
**reuse that design**, never to rebuild a lookalike on top of it.

The single worst outcome — and by far the most common — is a wall of text on
the template's background: the chrome (logo, gradient, footer) survives because
it lives on the masters, but every picture, chart, and table from the slides is
gone, the content sits in hand-drawn boxes on a blank canvas, the text renders
in Arial instead of the template's font, and the deck reads as generic. It will
*look* plausible to you in a render and be completely wrong. Everything below
exists to prevent that.

## 1. Copy the file first

Your very first action, before anything else:

\`\`\`bash
cp "/files/conversation/template.pptx" "/files/conversation/output.pptx"
\`\`\`

Editing the copy keeps the masters, layouts, theme, embedded media (logos,
photos, charts), and embedded fonts intact — everything that makes the deck
look designed survives for free, and you change only what you touch. **Build
from a blank \`Presentation()\` only when the user gives you no deck at all.**

## 2. Inspect before you touch

Your first read of the copy is \`pptx_inspect\`, never \`markitdown\` (it drops
layouts, placeholders, positioning, charts, and media — you'd rebuild blind)
and never a PDF render (slow, burns vision tokens; that is for final QA only).

\`\`\`bash
pptx_inspect output.pptx                 # overview: theme, fonts, words/slide, per-slide kinds
pptx_inspect output.pptx --layouts       # every layout's placeholders + resolved typography
pptx_inspect output.pptx --text          # all readable text per slide (incl. notes)
pptx_inspect output.pptx --slide 3       # one slide's shapes, positions, fit warnings
pptx_inspect output.pptx --media         # embedded images / audio / video
\`\`\`

The overview gives you three contracts:

- **theme** line — background, main text color, six accent colors. That is your
  entire palette; do not bring colors from outside it.
- **fonts** line — the dominant title/body typefaces the layouts resolve to
  (e.g. \`title=Montserrat 22pt bold | body=Montserrat Medium 16pt\`).
  \`theme-fallback\` is what runs *outside* placeholders inherit, usually Arial —
  a slide full of theme-fallback text is a slide that abandoned the template.
- **words/slide: avg=X max=Y** — your density ceiling (section 6).

Read the per-slide line too: \`pic:N chart:N table:N\` tells you which slides
carry the imagery you will want to reuse.

\`--layouts\` is your menu of building blocks: for every placeholder of every
layout it prints the \`idx\`, type, and resolved typeface / size / weight /
color / alignment. This is what tells you the template wants Montserrat 35pt
bold for a section number, not Arial 18pt.

\`--text\` tags each line with its shape \`#id\` (match against the \`--qa\`
box labels to read a slide back, section 7) and flags copy repeated across the
deck — usually un-replaced template scaffolding ("Subject title", "Summary").

\`--slide N\` shows each shape with its position/size in inches, placeholder
type, per-paragraph typography including \`vanchor\` (vertical text anchor), and
a text-fit estimate (\`holds~Nch@Spt\`). It marks problems at two levels:

- **\`[!]\` blockers** — must be zero before delivery: empty placeholder, manual
  bullet glyph, edge overflow, text overset, **image distorted** (box ratio ≠
  the image's native ratio), **low-res image**, **stacked** (two boxes coincide).
- **\`[i]\` advisories** — quantitative judgment calls, *not* auto-failures: a
  partial **overlap** (with the inches to separate and the axis), **underfilled**
  or **off-centre** text, a **tight margin**. Read them and confirm in the render
  (section 7); they flag designed-overlay-vs-collision and centering, which
  geometry alone can't settle — and centering is design intent (section 6).

These are the structural half of QA; the per-slide \`--qa\` readback (section 7)
is the other half, and neither alone is sufficient.

## 3. Pick your mode

Decide which job you are doing, because the method is different:

- **Revise in place** — the deck the user gave you *is* the content; they want
  it updated (new numbers, new quarter, new wording). Its slides map ~1:1 onto
  what they want. → Edit each slide where it sits (section 5).

- **Author on the template** — the template is a *design system* and the user
  wants a **different** deck: a different number of slides, a different
  narrative, different topics. The template's slide 4 is not "your slide 4."
  → You will **clone the template's slides as building blocks** (section 4),
  then fill them.

Decision rule: if the requested outline maps onto the existing slides one for
one, you are revising. If the user hands you an outline that does not match the
template's slides — a 12-slide pitch to build on a 26-slide sales template —
you are authoring, and "edit slide N in place" is the wrong instinct. **Do not
reach for the blank layout to bridge the gap. Clone a real slide instead.**

## 4. Author on the template: clone exemplars, don't free-hand

This is the heart of getting a template-faithful deck when the structure
differs from the template's. Three steps.

### 4.1 Build a menu of reusable slide kinds

From the overview (the \`pic/chart/table\` counts) and \`--layouts\`, catalog
what the template already knows how to do, with the **best exemplar slide** for
each kind:

\`\`\`
title slide             -> slide 1    (layout TITLE)
section divider w/ num  -> slide 8    (layout TITLE_1_1, big number + label)
3-up stat / icon grid   -> slide 13   (layout CUSTOM_3, three cells w/ icon + caption)
2-column text           -> slide 19   (layout CUSTOM_2_1)
photo + caption         -> slide 17   (image left, text right)
logo / image grid       -> slide 18   (eight picture cells)
quote / pull-quote      -> slide 20
closing / thank-you     -> slide 25   (layout BLANK, dark)
\`\`\`

If you are unsure what a slide looks like, skim the renders
(\`pptx_inspect template.pptx --render\`). The goal is to map every kind of
slide you need onto a real slide that already exists and already carries the
right images and placeholders.

### 4.2 Plan slide-by-slide (plan.json)

Decks come out as junk when you free-hand shape by shape. Before editing, write
\`/files/conversation/plan.json\` — **one entry per output slide** — naming the
exemplar you will clone, the images you will keep or swap, the placeholders you
will fill, and the word budget. This plan is about *layout and visuals*, not
just text:

\`\`\`json
{
  "output": "/files/conversation/output.pptx",
  "template": "/files/conversation/template.pptx",
  "mode": "author",
  "ceiling": 59,
  "slides": [
    {"n": 1, "purpose": "Title / hook", "clone": 1, "layout": "TITLE",
     "keep_images": ["dust logo"], "swap_images": [],
     "fill": {"center_title": "Work doesn't just get done. It gets rewired.",
              "subtitle": "Multiplayer AI for human-agent collaboration."},
     "words": 12},

    {"n": 5, "purpose": "Three layers", "clone": 13, "layout": "CUSTOM_3",
     "keep_images": ["three layer icons"], "swap_images": [],
     "fill": {"title[0]": "Knowledge", "body[1]": "20+ connectors, hybrid search",
              "title[2]": "Agents", "body[3]": "no-code builder, 20+ models"},
     "words": 38},

    {"n": 8, "purpose": "Customer logos", "clone": 18, "layout": "CUSTOM_2",
     "keep_images": [], "swap_images": ["eight cells -> customer logos"],
     "fill": {"title[0]": "3,000+ organizations"}, "words": 16}
  ]
}
\`\`\`

Reason about **space**: font size, not word count, decides whether text fits a
box. Pull each placeholder's \`box\` and resolved \`font_pt\` from \`--slide\`
and \`--layouts\`; each text shape prints its capacity (\`holds~Nch@Spt\`). If
your text exceeds what the box holds at the template's size, **cut the text** —
do not shrink below the template's sizes, and do not exceed \`ceiling\`.

### 4.3 Materialize with pptx_slides, then fill

Clone each exemplar into place, fill it (section 5), and delete what you did
not reuse — all through \`pptx_slides\`, never by hand-editing the slide list:

\`\`\`bash
pptx_slides output.pptx --duplicate 13 --count 1 --after 4   # clone the 3-up grid
pptx_slides output.pptx --move 27 --to 5                      # put it where you want
pptx_slides output.pptx --delete 14-16,20-24                 # drop unused template slides
\`\`\`

Both \`--duplicate\` and \`--delete\` take a slide pattern — a single slide, a
comma list, or inclusive ranges like \`2,5,7-9\` — so make every clone (or every
delete) in one call rather than invoking the tool slide by slide; each call
reopens and rewrites the whole deck, so batching is both correct and faster.

\`--duplicate\` shares the exemplar's images and deep-clones its charts (and
their data) so each copy is independent; \`--delete\` drops only that slide's own
media, keeping media shared with slides you keep — **and it removes the slide
part itself.** Deleting slides by removing \`sldId\`s yourself leaves orphaned
slide parts and their media stranded in the file (bloat that also dodges QA);
the \`--compare\` audit (section 7.1) flags orphans as a blocker. Let
\`pptx_slides\` do every add / move / delete.

### 4.4 Never bridge the gap with the blank layout

If you catch yourself adding text boxes and drawn rectangles onto a \`BLANK\`
slide, **stop** — that is the exact failure this skill exists to prevent. Two
hard rules:

- **No content on \`BLANK\`** (or any placeholder-less catch-all layout). It has
  no placeholders, so your text inherits Arial instead of the template's font,
  and there is nothing designed underneath it. Clone a real content slide
  instead. The \`--compare\` audit blocks a deck whose slides collapse onto one
  layout.
- **No emoji or drawn shapes standing in for the template's images.** A 🔒 in a
  text box is not the template's lock icon; a drawn rectangle is not its photo
  card. Reuse the real image parts: clone the slide that holds them and swap the
  picture in place (section 5).

## 5. Fill a slide (both modes)

Whether you are editing a slide where it sits or one you just cloned, the
mechanics are identical: change the content of the shapes that are already
there. Do not add new shapes on top of styled ones.

### Adapt the template to your content — within limits

The template is a starting point, not a straitjacket: resize, reposition, or
remove its elements — template-placed ones too, not only shapes you added — so
your content fits. Three limits keep the slide reading as the template:

- **Keep ratios.** Scale an image by both dimensions together, or crop; never
  stretch one axis (the \`[!] image distorted\` lint catches it). Hold the
  template's proportions and alignment.
- **Keep its visual character.** Do not strip the template's imagery or rebuild
  on a blank canvas — that is the cardinal failure (section 3).
- **Don't gut it.** Trimming surplus is expected — an unused cell, an unpaired
  marker. But deleting *most* of an exemplar's shapes means you cloned the wrong
  one; pick a simpler exemplar instead. \`--compare\` flags a slide that kept
  under ~60% of its exemplar's shapes (\`reuse: [i]\`) so you can catch this.

### Edit styled text by its runs

**Assigning to \`.text\` (on a text frame, paragraph, or table cell) deletes
every run and its formatting** — typeface, size, weight, and color reset to the
default. That is safe only for a placeholder \`--slide\` reports as *empty*. To
replace text that is already styled — most of a template — edit the existing
run in place:

\`\`\`python
prs = Presentation("/files/conversation/output.pptx")
title = prs.slides[0].shapes.title

runs = title.text_frame.paragraphs[0].runs
if runs:
    runs[0].text = "Work doesn't just get done."   # keeps typeface/size/weight/color
else:
    title.text_frame.text = "Work doesn't just get done."   # truly empty: .text is fine

prs.save("/files/conversation/output.pptx")
\`\`\`

If a paragraph mixes runs (a bold word mid-sentence), map your text onto the
matching runs instead of collapsing them into one.

### Fill the box's content slots, not its spacers

A text box is not a flat list of lines. \`--slide\` prints its skeleton —
\`p[0]\`, \`p[1]\`, … — including \`(empty)\` spacer paragraphs and each
paragraph's color and alignment. Templates lean on this: a heading in \`p[0]\`,
\`(empty)\` spacers between rows, and the real content in specific slots (often
\`p[2]\`, \`p[4]\`, \`p[6]\`…), with decorative shapes — checkmarks, numbers,
icons — placed to sit beside those content rows.

Put your text in the **same slots the template fills**, addressed by index, and
leave the \`(empty)\` paragraphs empty:

\`\`\`python
tf = slide.shapes[0].text_frame
for slot, line in zip((2, 4, 6, 8), bullets):   # content slots, read from --slide
    tf.paragraphs[slot].runs[0].text = line     # edit in place: keeps color/size/weight
\`\`\`

Never write into a spacer. A run added to an \`(empty)\` slot inherits a
*different* default — usually a darker body color and the spacer's alignment —
so the line renders off-color and the markers, pinned to the content-row
positions, strand in empty space below your text. Writing consecutively from
\`p[0]\` also overwrites a heading slot with a body line. (\`--compare\` reports
this as a content-slot mismatch against the template.)

Match your item count to the number of content slots. Fewer items: clear the
surplus slots' text *and* delete their paired markers so nothing floats. More
items than the exemplar holds: clone a denser slide kind rather than overflow
into spacers.

### Populate every empty placeholder

Layouts ship with empty title / body / subtitle placeholders, and **an empty
placeholder renders "Click to add …" in PowerPoint** — the prompt is not stored
in the file, the renderer draws it whenever the placeholder is empty, so
covering it with a parallel text box does **not** suppress it. This is the one
case where assigning \`.text\` is correct (there is no run to preserve):

- Title: \`slide.shapes.title.text = "..."\` (works for \`title\` and
  \`center_title\`).
- Others: \`slide.placeholders[idx].text_frame.text = "..."\`, where \`idx\` is
  the value from \`--layouts\`.

If a placeholder already shows sample copy it is *not* empty — edit its run so
the formatting survives. The \`[!] EMPTY PLACEHOLDER\` warning in \`--slide\` is
your safety net; if a placeholder is covered by intentional content (a chart
image, a table, a callout), delete the placeholder instead of stacking text
behind it:

\`\`\`python
sp = slide.placeholders[idx]    # idx reported by --slide / --layouts
sp.element.getparent().remove(sp.element)
\`\`\`

### Let the layout draw bullets and set type

Body placeholders draw bullets *from the layout* by paragraph level. Typing
\`•\`, \`·\`, \`-\`, \`–\`, or \`*\` at the start stacks your glyph on the
layout's ("● • text"). Use \`paragraph.level\` instead:

\`\`\`python
tf = slide.placeholders[1].text_frame
tf.text = "Shared agents"                      # level 0, layout draws the bullet
sub = tf.add_paragraph()
sub.text = "Best practices spread across the org"
sub.level = 1                                   # nested bullet style from the layout
\`\`\`

The layout already defines typeface, size, color, weight, and alignment for
each placeholder. Write the text and **leave \`font.name\` / \`font.size\` /
\`font.color\` unset** on runs — they inherit. Override only when you
intentionally want a one-off style. If you must add a shape *outside* a
placeholder (a callout, a label), copy the typeface and color from the matching
placeholder in \`--layouts\`; otherwise the run falls back to the theme's Arial
and looks foreign next to the rest of the deck.

### Tables

Update the cells of the table that is already there; never draw a new one over
it. The \`.text\` run rule applies to cells:

\`\`\`python
cell = table.cell(1, 0)
runs = cell.text_frame.paragraphs[0].runs
if runs:
    runs[0].text = "Engineering"   # styled cell: keep its font and fill
else:
    cell.text = "Engineering"      # empty cell: .text is fine
\`\`\`

With fewer data rows than the template's table provides, leave the extra rows
blank first — PowerPoint often renders trailing blank rows differently from the
sandbox (they can fold off the slide or push the table past its bottom edge).
If your visual QA shows that, rebuild *only that table* with exactly the rows
you need, copying the original's column widths (\`table.columns[i].width\`), row
heights, header run styling, and cell fills, kept inside the slide.

### Swap images in place

To swap a logo or photo, replace the image *inside* the existing picture so its
position, size, and crop are kept — do not drop a new picture on top:

\`\`\`python
from pptx.oxml.ns import qn
pic = slide.shapes[3]                                  # the existing picture
_, rId = pic.part.get_or_add_image_part("/files/conversation/logo.png")
pic._element.blipFill.blip.set(qn("r:embed"), rId)
\`\`\`

### Use real content; remove template guidance

Fill slides from the user's actual material. If a value the template expects is
genuinely missing, leave a visible placeholder (\`[TBD: Q3 revenue]\`) and flag
it rather than inventing a number. Templates carry builder instructions —
\`<Client name>\`, bracketed prompts, notes / off-slide text ("replace with this
quarter's figures"; \`--text\` includes notes). Read them, act on them, then
remove them so none survive in the delivered deck.

## 6. Design guidance

- **Density.** Treat the overview's \`max\` as a hard ceiling for *every* slide.
  If the template averages ~23 words/slide, yours should too — exceeding its
  density is the most common way a deck stops looking like the template even
  when fonts and colors match. Overflow goes into speaker notes, not the slide:
  \`slide.notes_slide.notes_text_frame.text = "..."\`. The \`--compare\` audit
  blocks slides over the ceiling.
- **Imagery.** Every slide wants a visual element, and it should be the
  template's — reuse its photos, icons, and charts by cloning the slides that
  carry them (section 4). If you must add a chart, prefer native python-pptx
  charts (\`XL_CHART_TYPE.BAR_CLUSTERED\`, \`LINE\`, …) — they inherit the theme
  palette and typography. For matplotlib only, pull \`bg1\` / \`tx1\` / accents
  from the theme line so it does not read as a foreign screenshot, then insert
  the PNG.
- **Palette.** Use only the theme's six accents.
- **Margins.** Keep ≥0.5". The bottom ~0.5" is the master's logo/footer band —
  content reaching into it is overflow, not layout. Move it up or split the
  slide.
- **Variety.** Vary layouts across slides; do not repeat the same template
  slide. Do not draw thin accent lines under titles — use whitespace or
  background color for hierarchy.
- When building from scratch (no template only): title 36–44pt bold, body
  14–16pt, left-align body, center only titles. **Editing a template, the
  layout's sizes win** — leave them to inherit.

## 7. QA (mandatory before delivery)

You cannot tell from the XML — or from a clean render — whether text actually
fits, stays readable, lands where you meant, or whether an image is squished.
QA has two gates: a deck-level **structural audit** (7.1, \`--compare\`) and a
per-slide **\`--qa\` readback** (7.2). Run \`--qa N\` after every slide edit, and
the structural audit after a batch; deliver only when both are clean.

### 7.1 Structural audit

**A. Deck-level audit** — run \`--compare\`; it catches deck-wide regressions:

\`\`\`bash
pptx_inspect output.pptx --compare /files/conversation/template.pptx
\`\`\`

Every line is a measurement — your deck's count vs the template's (in
parentheses). A negative slide or media delta is just the slides you removed; it
is not itself a problem. Delivery is gated by the \`[!]\` markers and the
\`[QA: PASS]\` / \`[QA: FAIL — N blockers]\` verdict; each \`[!]\` is a measurement
that crossed a threshold:

- **orphans** — slide parts left in the package after a hand-edited delete.
  Re-do the deletes with \`pptx_slides --delete\`.
- **fonts dropped** — the deck no longer carries its embedded fonts; you rebuilt
  instead of editing the copy. Start over from the copy (section 1).
- **imagery stripped** — an image-rich template but text-only output: you
  rebuilt slides on the background. Clone the slides that carry the images
  (section 4) and swap the picture in place.
- **layout collapse** — your slides piled onto one catch-all layout (usually
  \`BLANK\`). Rebuild each on a real content layout.
- **density** — slides over the template's word ceiling. Cut, or move detail
  into speaker notes.

This audit looks at the deck as a whole; it does **not** inspect individual
shapes, so a \`[QA: PASS]\` says nothing about what is on each slide.

**B. Per-slide lint** — the deck audit says nothing about individual shapes, so
\`[QA: PASS]\` can still hide "Click to add…" prompts, doubled bullet glyphs,
overset text, distorted images, and stacked boxes. For **every** slide you
touched, run \`pptx_inspect output.pptx --slide N\` and clear every \`[!]\`
(empty placeholder, manual bullet glyph, edge overflow, text overset, image
distorted, low-res image, near-identical box). Confirm no template sample copy
survives (\`xxxx\`, \`lorem\`, draft titles, \`<Client name>\`) — \`--text\` makes
that fast.

### 7.2 Per-slide QA — run \`--qa N\` after EVERY edit to a slide (never skip)

\`--qa N\` is the readback gate, and after a slide edit it is **not optional**:
run it the moment you finish editing slide N — not just once at the end. It
bundles the two halves of QA so you can't look at one without the other — the
slide's \`#id\`-tagged text and its boxed diagnostic render:

\`\`\`bash
pptx_inspect output.pptx --qa 6              # slide 6's #id-tagged text + boxed render
\`\`\`

\`--render\` (no boxes) is only a quick visual look — it shows nothing
diagnostic, so it is **not** a QA step. The diagnostic boxes live in \`--qa\`.

Each shape is outlined and labeled \`#id\` just outside it (text shapes tinted),
so the label keys the box to its file text without covering content. A text box
whose copy overflows is **grown to wrap the rendered text** (biased larger — a
box bigger than the text, never smaller), so overflow is visible and copy
spilling onto a neighbour is caught. A **red wash** marks any overlap region
(a peer overlap, or text spilling out of its box onto another shape), and a
**pixel-metrics digest** lists, per slide, those overlaps and any decorative
marker run (checkmarks, numbers, icons) left with no text row beside it. Declared
box geometry and image ratios are read straight from the file/pixels, so what
they reveal is real in PowerPoint even though the *text glyphs* render in
substitute fonts; a grown box is an estimate biased larger, so judge a flagged
overlap against the rendered text rather than treating the grown extent as exact.

**The gate is a readback.** \`--qa\` prints the slide's authoritative text above
the render, each line tagged with its shape \`#id\`. For every labeled box, read
what the render shows and confirm it matches that \`#id\`'s text. If you cannot
read a box's text back — **clipped** at the
box edge (overflow), **too faint** against its background (e.g. dark text on a
dark slide), or **hidden** under another shape (occlusion) — that is a real
defect, not a render artifact. A box you can't read back is the most reliable
signal that something is wrong.

Go box by box, by asset class (the label gives you the kind):

- **text / ph** — the full text reads back, is legible against its background,
  stays inside its box, and isn't covered. Overflow → cut text (preferred), or
  resize/raise the box to fit (template boxes too — see "Adapt the template to
  your content"); keep type at or above the template's sizes. Faint → recolor
  (e.g. white on a dark slide). Stacked/occluded → reposition (the
  \`[!] near-identical box\` lint flags the worst stacks). Floating — text
  bunched at the top of a much taller box (\`--slide\` shows \`vanchor=top\` and
  the render shows the gap) — center it (\`tf.vertical_anchor = MSO_ANCHOR.MIDDLE\`)
  or tighten the box. **But centering is design intent: don't re-center
  template-placed shapes *wholesale* — adjust the one that's visibly wrong, not
  every box.**
- **pic** — shows the intended subject, is **not stretched or squished** (the
  \`[!] image distorted\` lint catches box-ratio ≠ image-ratio; resize both
  dimensions together or crop, never one axis alone), fills its box, stays on
  the slide.
- **decorative markers** (checkmarks, numbers, icons beside rows) — each must
  sit beside the text row it marks. An \`unaligned markers\` note in the digest
  (the render shows the marker stranded in blank space) is a **readback failure
  to clear before delivery — not a soft advisory.** Two fixes: if the marker
  still has an item, your copy wrapped and pushed the row off the marker's fixed
  position (a heading or first item is the usual culprit) — **shorten that row's
  copy** until it realigns; if the marker has **no item at all** (you have fewer
  items than the template's markers), **delete the surplus marker** — dropping an
  unpaired decoration is fine (section 5). Re-render and confirm the note is gone.
- **chart / table** — readable, on-theme, not clipped or past the slide edge; no
  trailing blank rows folding (rebuild that one table if so — section 5).
- **auto / shape** — decoration or background only; it must not cover content
  text.

Fix, then re-run \`--qa N\` on that slide and read it back again. Repeat until the
slide reads back clean. **Run \`--qa N\` after every edit to a slide — as you
author, not only at the end** — so each defect is caught on the slide that
introduced it, never buried in a final sweep.

**No stale passes.** The \`--qa N\` that counts is the one run *after* your last
edit to slide N — a result from before that edit is stale and hides the defect
you just introduced (the common way a wrapped row and its stranded marker ship
unseen). Any \`unaligned markers\` line, overlap, or clipped/illegible box means
the slide is not done — fix it and re-run \`--qa N\`. Do not lean on a
\`[QA: PASS]\` from \`--compare\` here: \`--compare\` checks structure, not the
rendered pixels, so it cannot see a stranded marker — only \`--qa\` can.

What is **not** a defect: a few pixels of reflow or a substituted typeface — if
the customer has the font, their PowerPoint is correct. To tell artifact from
defect, view the template's matching slide the same way (\`pptx_inspect
template.pptx --qa N\`) and compare like-for-like. For autofit text or dense tables, where
this renderer is least reliable, note in your summary that they should be
confirmed in PowerPoint before the deck reaches a customer.

**Deliver only when 7.1 reads \`[QA: PASS]\` with zero \`[!]\`, and 7.2 reads
back clean on every slide — every box's text legible and in place, and no
\`unaligned markers\` note left in the digest.**
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
  exposeInstructions: true,
  mcpServers: [{ name: "sandbox" }],
  version: 2,
  icon: "ActionSlideshowIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags);
  },
} as const satisfies GlobalSkillDefinition;
