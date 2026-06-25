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

## The loop — this IS the skill

**Editing a deck is a LOOP, and the loop is the method.** Everything else in
this document is detail in service of one of its steps. One pass of the loop:

1. **Copy** the file; work only on the copy — §1.
2. **Inspect** the copy with \`pptx_inspect\` — §2.
3. **Pick a mode** — revise in place, author on the template, or author from
   scratch — and **decompose the job into a list of one edit per slide** — §3.
4. **Edit, then QA — in two passes, not interleaved per slide.** First make
   **every** edit across **every** slide in one pass (§4.1) — ideally one script
   that opens the deck once and saves once. **Then** QA the deck **one slide at a
   time** (§4.2), running this turn on each:

   > **\`pptx_inspect --qa N\` → read slide N back against its text → fix what's
   > wrong on it → re-run \`--qa N\` → and only once *that* slide reads back
   > clean do you move to the next slide.**

   This per-slide QA pass is the **single most important thing in the skill, and
   it is itself a loop** — for any slide that doesn't read clean you edit it and
   re-run \`--qa N\` on that *same* slide until it does, and you close each slide
   before you open the next. A slide is done only when its own \`--qa N\`, run
   *after its last edit*, reads back clean. QA'ing only some slides — or glancing
   at a box-free render and calling it good — is the most common way a broken
   deck ships. **Never skip a slide's \`--qa\`.**

5. **Audit the whole deck** with \`--compare\`, clear every \`[!]\`, then deliver
   — §5.

Read §4 as the spine: the numbered sections are the loop's steps, and the
reference at the end (design guidance) serves them — none of it outranks the
loop.

## 1. Copy the file first

Your very first action, before anything else:

\`\`\`bash
cp "/files/conversation/template.pptx" "/files/conversation/output.pptx"
\`\`\`

Editing the copy keeps the masters, layouts, theme, embedded media (logos,
photos, charts), and embedded fonts intact — everything that makes the deck
look designed survives for free, and you change only what you touch. **Only when
the user hands you no deck at all do you start from a blank \`Presentation()\` —
that is mode C (§3).**

## 2. Inspect before you touch

Your first read of the copy is \`pptx_inspect\`, never \`markitdown\` (it drops
layouts, placeholders, positioning, charts, and media — you'd rebuild blind)
and never a PDF render (slow, burns vision tokens; renders are for a quick
visual look, not structural reading).

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
  \`theme-fallback\` is what text *outside* placeholders inherits, usually Arial —
  a slide full of theme-fallback text is a slide that abandoned the template.
- **words/slide: avg=X max=Y** — your density ceiling (see Design guidance).

Read the per-slide line too: \`pic:N chart:N table:N\` tells you which slides
carry the imagery you will want to reuse.

\`--layouts\` is your menu of building blocks: for every placeholder of every
layout it prints the \`idx\`, type, and resolved typeface / size / weight /
color / alignment. This is what tells you the template wants Montserrat 35pt
bold for a section number, not Arial 18pt.

\`--text\` tags each line with its shape \`#id\` (match against the \`--qa\`
box labels to read a slide back, §4.2) and flags copy repeated across the
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
  (§4.2); they flag designed-overlay-vs-collision and centering, which geometry
  alone can't settle — and centering is design intent (Design guidance).

These per-slide markers are the structural half of QA; you lean on them in the
per-slide QA pass (§4.2), alongside the \`--qa\` readback.

## 3. Pick a mode, then decompose into per-slide edits

Decide which of three jobs you are doing — the method differs — then break the
work into a list of *one edit per slide* before you touch anything.

### The three modes

- **A — Revise in place.** The deck the user gave you *is* the content; they want
  it updated (new numbers, new quarter, new wording), and its slides map ~1:1
  onto what they want. → Edit each slide where it sits.

- **B — Author on the template.** The deck is a *design system* and the user
  wants a **different** deck: a different number of slides, a different
  narrative, different topics. The template's slide 4 is not "your slide 4." →
  **Clone the template's slides as building blocks** (below), then fill them.

- **C — Author from scratch.** The user hands you **no deck** — only a request
  ("make me a deck about X"). You have no template to reuse, so you must first
  **establish a design**, then build on it (below). Do not just start typing
  slides onto blanks.

Decision rule between A and B: if the requested outline maps onto the existing
slides one for one, you are revising (A). If the user hands you an outline that
does not match the template's slides — a 12-slide pitch on a 26-slide sales
template — you are authoring (B), and "edit slide N in place" is the wrong
instinct. **Do not reach for the blank layout to bridge the gap; clone a real
slide instead.**

**All three modes converge on the same per-slide loop (§4)** — that loop is the
build, and it is not optional in any of them. They differ *only* in the **setup
before the loop**: mode A has none (you edit in place), mode B clones exemplars
first, mode C establishes a design first. That is exactly why only B and C get
setup subsections below — mode A goes straight to the §4 loop.

### Mode A — revise where it sits

The simplest mode, and the only one with no setup before the loop: nothing to
clone, no design to establish, because the deck's slides already *are* the deck
you want. Go straight from the decompose list (below) to the §4 turn on each
slide you are changing — edit its shapes in place (§4.1), \`--qa\` it, move on.
Leave the slides you are *not* changing untouched: do not reflow, re-theme, or
re-center the whole deck to make one number current.

### Mode B — clone exemplars, don't free-hand

This is the heart of getting a template-faithful deck when the structure differs
from the template's.

**Build a menu of reusable slide kinds.** From the overview (the
\`pic/chart/table\` counts) and \`--layouts\`, catalog what the template already
knows how to do, with the **best exemplar slide** for each kind:

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
(\`pptx_inspect template.pptx --render\`). The goal is to map every kind of slide
you need onto a real slide that already exists and already carries the right
images and placeholders.

**Materialize with \`pptx_slides\`, never by hand.** Clone each exemplar into
place and delete what you did not reuse — all through \`pptx_slides\`, never by
hand-editing the slide list:

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
the \`--compare\` audit (§5) flags orphans as a blocker. Let \`pptx_slides\` do
every add / move / delete.

**Never bridge the gap with the blank layout.** If you catch yourself adding text
boxes and drawn rectangles onto a \`BLANK\` slide, **stop** — that is the exact
failure this skill exists to prevent. Two hard rules:

- **No content on \`BLANK\`** (or any placeholder-less catch-all layout). It has
  no placeholders, so your text inherits Arial instead of the template's font,
  and there is nothing designed underneath it. Clone a real content slide
  instead. The \`--compare\` audit blocks a deck whose slides collapse onto one
  layout.
- **No emoji or drawn shapes standing in for the template's images.** A 🔒 in a
  text box is not the template's lock icon; a drawn rectangle is not its photo
  card. Reuse the real image parts: clone the slide that holds them and swap the
  picture in place (§4.1).

### Mode C — establish a design, then author

With no template, *you* are the design system, so the deck's coherence is your
responsibility. Before building, **derive the design from the user and their
context** — the way Dust support pins down a request — rather than inventing it
ad hoc, slide by slide:

- **Audience & purpose.** Who reads it, to decide what (pitch, board update,
  training, conference talk)? This sets tone, density, and length.
- **Brand.** If the user names a company or provides brand assets (a logo,
  colors, a font, an existing deck), use them — that effectively turns mode C
  into mode A/B on their material; ask for or fetch them when a brand clearly
  exists. Absent any brand, pick **one** simple, coherent system and **state it
  in your summary**: a palette of a background, a text color, and two or three
  accents; one title font and one body font; consistent margins.
- **Outline.** Agree the slide list and one purpose per slide first.

If essentials are missing and you cannot proceed coherently, ask; otherwise pick
sensible defaults, **state them**, and proceed. Then build each slide with those
choices held constant (typography defaults in Design guidance). A from-scratch
deck is **just as much a loop** — every slide still runs the §4 turn.

### Decompose into per-slide edits

In every mode, before editing, write out — as a short list, one line per output
slide — what each slide will be: its purpose, the exemplar to clone (B) or layout
to use (C), the images to keep or swap, the placeholders to fill, and a word
budget. Decks come out as junk when you free-hand shape by shape; this list is
what keeps each slide deliberate and gives the §4 loop its agenda.

Reason about **space**, because font size — not word count — decides whether text
fits a box. Pull each placeholder's \`box\` and resolved \`font_pt\` from
\`--slide\` and \`--layouts\`; each text shape prints its capacity
(\`holds~Nch@Spt\`). If your text exceeds what the box holds at the template's
size, **cut the text** — do not shrink below the template's sizes, and do not
exceed the density ceiling (Design guidance).

## 4. Edit every slide, then QA every slide

This is the heart of the loop, in two passes. **First** edit every slide you are
changing in one pass (§4.1) — ideally a single script that opens the deck once
and saves once. **Then** QA the deck one slide at a time (§4.2): \`--qa N\`, read
it back, fix that slide, re-QA it, and only move on once it reads clean. Batch
the **edits**; never batch the **QA** — every slide gets its own \`--qa\`, and a
fix found in QA means re-running \`--qa\` on that slide.

### 4.1 Edit the slides — one pass

Make all your edits in this pass, working from the decompose list — ideally a
single script that opens the deck once, edits every slide on the list, and saves
once. Whether you are editing a slide where it sits or one you just cloned, the
mechanics are identical: change the content of the shapes that are already there.
Do not add new shapes on top of styled ones.

**Adapt the template to your content — within limits.** The template is a
starting point, not a straitjacket: resize, reposition, or remove its elements —
template-placed ones too, not only shapes you added — so your content fits. Three
limits keep the slide reading as the template:

- **Keep ratios.** Scale an image by both dimensions together, or crop; never
  stretch one axis (the \`[!] image distorted\` lint catches it). Hold the
  template's proportions and alignment.
- **Keep its visual character.** Do not strip the template's imagery or rebuild
  on a blank canvas — that is the cardinal failure (intro, §3).
- **Don't gut it.** Trimming surplus is expected — an unused cell, an unpaired
  marker. But deleting *most* of an exemplar's shapes means you cloned the wrong
  one; pick a simpler exemplar instead. \`--compare\` flags a slide that kept
  under ~60% of its exemplar's shapes (\`reuse: [i]\`) so you can catch this.

**Edit styled text by its segments** — the spans of same-formatted characters a
paragraph is made of (python-pptx calls them the paragraph's \`runs\`). Assigning
to \`.text\` (on a text frame, paragraph, or table cell) **deletes every segment
and its formatting** — typeface, size, weight, and color reset to the default.
That is safe only for a placeholder \`--slide\` reports as *empty*. To replace
text that is already styled — most of a template — edit the existing segment in
place:

\`\`\`python
prs = Presentation("/files/conversation/output.pptx")
title = prs.slides[0].shapes.title

runs = title.text_frame.paragraphs[0].runs   # the paragraph's segments
if runs:
    runs[0].text = "Work doesn't just get done."   # keeps typeface/size/weight/color
else:
    title.text_frame.text = "Work doesn't just get done."   # truly empty: .text is fine

prs.save("/files/conversation/output.pptx")
\`\`\`

If a paragraph mixes segments (a bold word mid-sentence), map your text onto the
matching segments instead of collapsing them into one.

**Fill the box's content slots, not its spacers.** A text box is not a flat list
of lines. \`--slide\` prints its skeleton — \`p[0]\`, \`p[1]\`, … — including
\`(empty)\` spacer paragraphs and each paragraph's color and alignment. Templates
lean on this: a heading in \`p[0]\`, \`(empty)\` spacers between rows, and the
real content in specific slots (often \`p[2]\`, \`p[4]\`, \`p[6]\`…), with
decorative shapes — checkmarks, numbers, icons — placed to sit beside those
content rows.

Put your text in the **same slots the template fills**, addressed by index, and
leave the \`(empty)\` paragraphs empty:

\`\`\`python
tf = slide.shapes[0].text_frame
for slot, line in zip((2, 4, 6, 8), bullets):   # content slots, read from --slide
    tf.paragraphs[slot].runs[0].text = line     # edit in place: keeps color/size/weight
\`\`\`

Never write into a spacer. A segment added to an \`(empty)\` slot inherits a
*different* default — usually a darker body color and the spacer's alignment —
so the line renders off-color and the markers, pinned to the content-row
positions, strand in empty space below your text. Writing consecutively from
\`p[0]\` also overwrites a heading slot with a body line. (\`--compare\` reports
this as a content-slot mismatch against the template.)

Match your item count to the number of content slots. Fewer items: clear the
surplus slots' text *and* delete their paired markers so nothing floats. More
items than the exemplar holds: clone a denser slide kind rather than overflow
into spacers.

**Populate every empty placeholder.** Layouts ship with empty title / body /
subtitle placeholders, and **an empty placeholder renders "Click to add …" in
PowerPoint** — the prompt is not stored in the file, the renderer draws it
whenever the placeholder is empty, so covering it with a parallel text box does
**not** suppress it. This is the one case where assigning \`.text\` is correct
(there is no segment to preserve):

- Title: \`slide.shapes.title.text = "..."\` (works for \`title\` and
  \`center_title\`).
- Others: \`slide.placeholders[idx].text_frame.text = "..."\`, where \`idx\` is
  the value from \`--layouts\`.

If a placeholder already shows sample copy it is *not* empty — edit its segment so
the formatting survives. The \`[!] EMPTY PLACEHOLDER\` warning in \`--slide\` is
your safety net; if a placeholder is covered by intentional content (a chart
image, a table, a callout), delete the placeholder instead of stacking text
behind it:

\`\`\`python
sp = slide.placeholders[idx]    # idx reported by --slide / --layouts
sp.element.getparent().remove(sp.element)
\`\`\`

**Let the layout draw bullets and set type.** Body placeholders draw bullets
*from the layout* by paragraph level. Typing \`•\`, \`·\`, \`-\`, \`–\`, or \`*\`
at the start stacks your glyph on the layout's ("● • text"). Use
\`paragraph.level\` instead:

\`\`\`python
tf = slide.placeholders[1].text_frame
tf.text = "Shared agents"                      # level 0, layout draws the bullet
sub = tf.add_paragraph()
sub.text = "Best practices spread across the org"
sub.level = 1                                   # nested bullet style from the layout
\`\`\`

The layout already defines typeface, size, color, weight, and alignment for
each placeholder. Write the text and **leave \`font.name\` / \`font.size\` /
\`font.color\` unset** on segments — they inherit. Override only when you
intentionally want a one-off style. If you must add a shape *outside* a
placeholder (a callout, a label), copy the typeface and color from the matching
placeholder in \`--layouts\`; otherwise the segment falls back to the theme's Arial
and looks foreign next to the rest of the deck.

**Tables.** Update the cells of the table that is already there; never draw a new
one over it. The \`.text\` segment rule applies to cells:

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
heights, header segment styling, and cell fills, kept inside the slide.

**Swap images in place.** To swap a logo or photo, replace the image *inside* the
existing picture so its position, size, and crop are kept — do not drop a new
picture on top:

\`\`\`python
from pptx.oxml.ns import qn
pic = slide.shapes[3]                                  # the existing picture
_, rId = pic.part.get_or_add_image_part("/files/conversation/logo.png")
pic._element.blipFill.blip.set(qn("r:embed"), rId)
\`\`\`

**Use real content; remove template guidance.** Fill slides from the user's
actual material. If a value the template expects is genuinely missing, leave a
visible placeholder (\`[TBD: Q3 revenue]\`) and flag it rather than inventing a
number. Templates carry builder instructions — \`<Client name>\`, bracketed
prompts, notes / off-slide text ("replace with this quarter's figures";
\`--text\` includes notes). Read them, act on them, then remove them so none
survive in the delivered deck.

### 4.2 QA each slide — \`pptx_inspect --qa N\` (never skip)

Once every slide is edited (§4.1), QA the deck **one slide at a time**, starting
at slide 1 — this is not a final glance, it is the gate, and it is **not
optional**. \`--qa N\` bundles the two halves of QA so you can't look at one
without the other — the slide's \`#id\`-tagged text and its boxed diagnostic
render:

\`\`\`bash
pptx_inspect output.pptx --qa 6              # slide 6's #id-tagged text + boxed render
\`\`\`

\`--render\` (no boxes) is only a quick visual look — it shows nothing
diagnostic, so it is **not** a QA step. The diagnostic boxes live in \`--qa\`.

\`--qa\` shows the rendered pixels; it does **not** repeat the structural \`[!]\`
lints from \`--slide\` (§2). So the per-slide check is two reads of the slide you
just edited: clear every \`--slide N\` \`[!]\` (empty placeholder, manual bullet,
overset, distorted / low-res image, stacked box — editing readily introduces
these), **and** read it back under \`--qa N\`. Confirm no template sample copy
survives either (\`xxxx\`, \`lorem\`, draft titles, \`<Client name>\`) — \`--text\`
and the \`[leftover?]\` marks make that fast. A slide is done only when both reads
are clean.

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
read a box's text back — **clipped** at the box edge (overflow), **too faint**
against its background (e.g. dark text on a dark slide), or **hidden** under
another shape (occlusion) — that is a real defect, not a render artifact. A box
you can't read back is the most reliable signal that something is wrong.

Go box by box, by asset class (the label gives you the kind):

- **text / ph** — the full text reads back, is legible against its background,
  stays inside its box, and isn't covered. Overflow → cut text (preferred), or
  resize/raise the box to fit (template boxes too — see "Adapt the template to
  your content", §4.1); keep type at or above the template's sizes. Faint →
  recolor (e.g. white on a dark slide). Stacked/occluded → reposition (the
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
  unpaired decoration is fine (§4.1). Re-render and confirm the note is gone.
- **chart / table** — readable, on-theme, not clipped or past the slide edge; no
  trailing blank rows folding (rebuild that one table if so — §4.1).
- **auto / shape** — decoration or background only; it must not cover content
  text.

Fix, then re-run \`--qa N\` on that slide and read it back again. Repeat until the
slide reads back clean — *that* is when the slide is done and you move on.

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
template.pptx --qa N\`) and compare like-for-like. For autofit text or dense
tables, where this renderer is least reliable, note in your summary that they
should be confirmed in PowerPoint before the deck reaches a customer.

## 5. Audit the deck, then deliver

Once **every** slide has passed its own \`--qa\` (§4.2), run the deck-level audit
— it catches regressions that only show across the whole file, which the
per-slide QA pass cannot see.

**A. Deck-level audit** — run \`--compare\`:

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
  instead of editing the copy. Start over from the copy (§1).
- **imagery stripped** — an image-rich template but text-only output: you
  rebuilt slides on the background. Clone the slides that carry the images
  (§3, mode B) and swap the picture in place.
- **layout collapse** — your slides piled onto one catch-all layout (usually
  \`BLANK\`). Rebuild each on a real content layout.
- **density** — slides over the template's word ceiling. Cut, or move detail
  into speaker notes.

This audit looks at the deck as a whole; it does **not** inspect individual
shapes, so a \`[QA: PASS]\` here says nothing about what is on each slide — that
is exactly why every slide must already have passed its own \`--qa\` (§4.2).

**Deliver only when §5 reads \`[QA: PASS]\` with zero \`[!]\`, and every slide
has read back clean under its own \`--qa N\` (§4.2) — every box's text legible
and in place, and no \`unaligned markers\` left in the digest.**

## Design guidance (reference)

This serves the loop; it does not replace it. The defaults below hold across all
three modes.

- **Density.** Treat the overview's \`max\` as a hard ceiling for *every* slide.
  If the template averages ~23 words/slide, yours should too — exceeding its
  density is the most common way a deck stops looking like the template even
  when fonts and colors match. Overflow goes into speaker notes, not the slide:
  \`slide.notes_slide.notes_text_frame.text = "..."\`. The \`--compare\` audit
  blocks slides over the ceiling.
- **Imagery.** Every slide wants a visual element, and it should be the
  template's — reuse its photos, icons, and charts by cloning the slides that
  carry them (§3, mode B). If you must add a chart, prefer native python-pptx
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
- **From scratch (mode C only).** With no template's sizes to inherit: title
  36–44pt bold, body 14–16pt, left-align body, center only titles. Hold the one
  palette and the two fonts you stated (§3, mode C) constant across every slide.
  Editing a template, the layout's sizes win — leave them to inherit.
`;

export const pptxSkill = {
  sId: "pptx",
  name: "Slide decks",
  userFacingDescription: "Read, edit, and create slide presentations",
  agentFacingDescription:
    "Work with .pptx files in the computer. Includes the pptx_inspect tool " +
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
