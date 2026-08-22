import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

const PPTX_SKILL_INSTRUCTIONS = `# Slide decks (.pptx)

User's deck = design system: masters, layouts, theme, embedded fonts, real images. Reuse it, never rebuild a lookalike.

Classic failure: text boxes on blank canvas, imagery gone, Arial everywhere. Plausible in a render, completely wrong.

Loop: copy, inspect, pick mode, edit every slide, QA every slide, audit, deliver.

## 1. Copy to /tmp, then inspect

\`cp /files/conversation/template.pptx /tmp/deck.pptx\`

Copy keeps masters, theme, media, embedded fonts. Blank \`Presentation()\` only if no deck at all.

**Work in /tmp, copy back at the end.** \`/files/conversation\` is a network mount: every command that opens a deck there re-reads the whole file, tens of seconds on a big one, most of a slow run. Renders still publish to the conversation.

\`\`\`bash
pptx_inspect FILE                  # theme, fonts, words/slide, per-slide pic/chart/table
pptx_inspect FILE --layouts        # placeholders, idx, resolved type; "static" = master text, not editable slide-side
pptx_inspect FILE --text           # all text + notes, [leftover?] marks
pptx_inspect FILE --slide 2,5,7-9  # shapes, boxes in inches, ph idx, vanchor, fit, blockers
pptx_inspect FILE --help           # every other flag
\`\`\`

Structure only from pptx_inspect: never markitdown, never a PDF render. Patterns everywhere: one call, not one per slide. Legacy \`.ppt\`: convert first (\`soffice --headless --convert-to pptx\`). \`.potx\` = \`.pptx\`, keep its extension.

theme = your whole palette. fonts = what layouts resolve to, so \`theme-fallback\` text has left the template. words/slide max = density ceiling. pic/chart/table = slides carrying imagery worth cloning.

\`[!]\` blocks delivery, \`[i]\` is a judgment call to confirm in the render.

## 2. Pick a mode, list one edit per slide

- **A. Revise.** Their deck is the content, outline maps 1:1. Edit each slide where it sits, leave the rest alone: no re-theming a deck to update one number.
- **B. Author on the template.** Different deck: other slide count, other narrative. Clone the template's own slides as building blocks.
- **C. From scratch.** No deck. Template mentioned but not attached: ask for it, never approximate.

Mode B: from \`--layouts\` + pic/chart/table counts pick the best exemplar per kind you need (title, divider, 3-up, 2-column, photo + caption, quote, closing), \`--render --grid\` to eyeball them, then:

\`\`\`bash
pptx_slides FILE --duplicate 13 --count 1 --after 4
pptx_slides FILE --move 27 --to 5
pptx_slides FILE --delete 14-16,20-24
\`\`\`

One slide per point in the outline: two slides with the same title and the same shape are a duplicate, not a build-up. Every add, move, delete through \`pptx_slides\`: shares image parts, deep-clones charts; hand-edited \`sldId\`s strand orphan parts. Structure first, content after: duplicating later clones your edits. Never content on \`BLANK\`. Never an emoji or drawn rectangle in place of the template's icon or photo.

**Clone slides, not layouts.** \`add_slide(layout)\` gives an empty frame: the template's photos and icons live on its slides, not its layouts, so a layout-built deck comes out image-free and fails §5. The overview's pic/chart/table counts say which slides carry them: duplicate those.

Mode C: state audience, purpose, one palette, one title font, one body font, the outline; hold constant. Brand assets the user names: use them. Titles 36-44pt, body 14-16pt left-aligned.

## 3. Edit every slide in one pass

One script, opens once, saves once. Edit shapes already there; never stack new ones on top.

**Text run by run.** \`.text\` wipes formatting; a paragraph is usually several runs, so \`runs[0]\` alone leaves the old tail appended ("New headingjust get done."). Every text change goes through this, table cells included:

\`\`\`python
def set_text(paragraph, text):
    runs = paragraph.runs
    if not runs:
        paragraph.text = text
        return
    runs[0].text = text
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
\`\`\`

\`.text\` only for a placeholder \`--slide\` reports empty. Keep the extra runs only for deliberate mixed styling mid-line.

**Rewrite or delete every shape you cloned.** An exemplar carries the template's own scaffolding: a stage name, \`01\`..\`06\`, \`HOW\`, filler paragraphs. Anything you leave renders as content next to your copy. \`--slide\` lists every shape on the slide: account for all of them, columns 2 and 3 included. Filler rarely says "Lorem ipsum" - the second and third paragraphs start "Ut enim ad minim veniam" and "Duis aute irure dolor", and they look like copy until you read them.

**Content slots, not spacers.** \`--slide\` prints the skeleton \`p[0]\`, \`p[1]\`, ... incl \`(empty)\` spacers. Write the slots the template fills (often \`p[2]\`, \`p[4]\`, \`p[6]\`): a spacer inherits other styling and strands the markers pinned beside the real rows. Fewer items than slots: clear the surplus, delete its markers. More items: clone a denser exemplar.

**Empty placeholder renders "Click to add ..."**; covering it does not suppress it. Fill (\`slide.shapes.title.text\`, \`slide.placeholders[idx].text_frame.text\`) or delete (\`sp.element.getparent().remove(sp.element)\`).

**The layout draws the bullets.** Body placeholders bullet by \`paragraph.level\`; typing \`•\`, \`-\` or \`*\` at the start of the line stacks your glyph on the layout's ("● • Private answers"). Write the bare text and set the level.

**A new text box has no styling and no colour.** Inside a placeholder the layout supplies typeface, size and colour, so leave \`font.name\` / \`font.size\` / \`font.color\` unset. A box you add with \`shapes.add_textbox\` inherits none of that: it renders in Arial at the presentation's default colour, which is near-black on every deck including the dark ones, so your copy lands black on a black slide. Set all three explicitly on every run, copying the values from the \`--layouts\` placeholder that sits on the same background. Better still: don't add a box, edit the one the exemplar already has.

One pass, one script, shaped like this:

\`\`\`python
prs = Presentation("/tmp/deck.pptx")
for slide, edits in PLAN.items():                  # your per-slide list from §2
    for shape_id, lines in edits:
        tf = SHAPES[shape_id].text_frame
        for slot, line in zip(CONTENT_SLOTS, lines):   # slot indices read off --slide
            set_text(tf.paragraphs[slot], line)
prs.save("/tmp/deck.pptx")
\`\`\`

**Constrained shapes** (chevron, trapezoid, pill): sloped sides eat the text area. Margins >= 0.25", longest word on one line, cut the label rather than shrink the font.

**Tables:** edit existing cells, never draw one over them. Fewer rows than the template: leave the extras blank; if QA shows them folding off the slide, rebuild that one table with the original's column widths, row heights, header styling, cell fills.

**Swap images in place**, keeping position, size and crop:

\`\`\`python
_, rId = pic.part.get_or_add_image_part("/files/conversation/logo.png")
pic._element.blipFill.blip.set(qn("r:embed"), rId)
\`\`\`

A replacement with a different native aspect ratio needs the box resized on both axes (or cropped), or it renders stretched. Never retype a brand name for a logo. Never text over a background image that already carries text: delete that picture or clone another exemplar.

**Adapt, don't gut.** Resize, move, remove template shapes so your content fits; scale images on both axes or crop, never one. Deleting an exemplar's photo or its second column leaves a title over an empty canvas, which reads worse than a plain slide: put content in that space or clone a sparser exemplar. Deleting most of an exemplar's shapes = wrong exemplar. Keep every box inside the slide: a box that starts at a negative coordinate or runs past the right edge is clipped, not "bleeding".

**Fill the box or resize it.** A \`vanchor=middle\` box two lines deep in a 5-inch frame floats its copy in the middle of the slide with a hole above it. Either give the slot the content it was built for, or shrink the box to the copy.

**Parallel columns stay parallel.** Same top, same width, same size, same colour across a row: a heading at 22pt in one column and 14pt in the next reads as a bug.

**Drawn content** (native chart, diagram, callout): derive the safe rect first, left + width from the title placeholder, top below the title, bottom above the footer band.

Remove builder guidance (\`<Client name>\`, bracketed prompts, notes). Never remove disclaimers, legal mentions, audience tags. Missing data stays visible as \`[TBD: Q3 revenue]\`, flagged, never invented.

## 4. QA every slide you edited

\`pptx_fonts /tmp/deck.pptx --install\` first: every face the deck asks for, extracted from the file or fetched from Google Fonts. What it still reports as substituted measures ~10% off, leave that copy slack.

\`pptx_inspect FILE --qa 2,5,7-9\` (pass timeoutMs 120000 for a big batch)

Every slide you touched, not a sample of them. Batch them in one call: the deck converts once and the rest is per slide.

One full-size image per slide plus that slide's defect list. Open every one with the \`files__cat\` tool; a bash \`cat\` of an image returns binary garbage. Render comes back as text: you cannot see images, say so, don't claim you looked. \`--qa N --boxes\` redraws it with \`#id\` labels when you need to place a finding on a box.

The defect list is mechanical and reliable. Clear every \`[!]\` before you look at anything else:

| marker | fix |
|---|---|
| \`unreadable - #INK on #BG (1.3:1)\` | set \`font.color.rgb\` on every run of that shape, taking the colour from a \`--layouts\` placeholder on the same background |
| \`still holds template filler\` | you cloned a shape and never rewrote it; write your copy or delete the shape |
| \`zero-size box\` | you wrote a 0 width or height; restore the exemplar's box |
| \`extends past slide edge\` | move or shrink it back inside the slide |
| \`image distorted\` | resize the box to the image's native ratio, or crop |
| \`stacked with shape #N\` / \`text-on-text\` | move one box clear, or shorten the copy |
| \`empty placeholder\` | fill it, or delete the shape |
| \`text overset\` / \`text runs ~Nin below its box\` | cut copy or grow the box, never below the template's sizes |
| \`thin - ... (2.4:1)\` | fine for a large heading, recolour if it is body copy |
| \`underfilled\` on a \`vanchor=middle\` box | the copy floats in the middle of a tall box: shorten the box or add the content the slot expects |

Then read the render itself, per slide, and answer all of it:

1. Every line legible on what is behind it.
2. Nothing clipped by a box edge or the slide edge; no word broken across a shape.
3. Pictures undistorted and filling their box; markers beside their rows.
4. No leftover template copy, no gap where content should be.
5. Columns and rows aligned; the slide reads like the template's own.

A box you cannot read back is a real defect, not a render artifact. Fix, re-run \`--qa N\` on that slide, look again: a \`--qa\` from before your last edit is stale. A few pixels of reflow is not a defect, compare against the template's own slide. Autofit text and dense tables render least reliably: say they need a PowerPoint check.

## 5. Audit, then deliver

\`pptx_inspect /tmp/deck.pptx --compare /files/conversation/template.pptx\`

Design fidelity, legibility and package integrity in one pass, baselined against the template so its own faults are not reported as yours. Copy the finished deck back to \`/files/conversation/\` once it passes. Clear every \`[!]\`: fonts dropped or imagery stripped (you rebuilt instead of editing: start again from the copy - a footer logo does not count as a slide's imagery), text that renders unreadable, \`filler:\` shapes you never rewrote, \`canvas:\` slides you cloned and then emptied, shapes you pushed off the slide or stretched, layout collapse, density, and under \`Package:\` anything that stops PowerPoint opening the file. Package faults mean you edited the zip by hand: redo those edits through \`pptx_slides\` and python-pptx. \`leftover: [i]\` lists shapes still carrying the template's copy: replace or delete the ones you cloned. No template: \`--validate\` runs the package half alone. Deliver on \`[QA: PASS]\`, every slide read back clean.

## Defaults

Density: the template's max words/slide is a hard ceiling, overflow to \`slide.notes_slide.notes_text_frame\`. Palette: the theme's six accents only. Margins 0.5", bottom 0.5" is the master's logo band. Every slide wants a visual, preferably the template's own; an added chart is native python-pptx (\`XL_CHART_TYPE.BAR_CLUSTERED\`, \`LINE\`) so it inherits the theme, matplotlib only with \`bg1\`/\`tx1\`/accents from the theme line and its own axis labels rewritten in plain words. Vary layouts. No accent lines under titles, no decorative color bars or edge stripes.
`;

export const pptxSkill = {
  sId: "pptx",
  kind: "global",
  name: "Slide decks",
  userFacingDescription: "Read, edit, and create slide presentations",
  agentFacingDescription:
    "Work with .pptx files in the Computer. Includes the pptx_inspect tool " +
    "for paginated structural inspection of decks (slides, layouts, shapes, " +
    "text, charts, tables, media) so existing decks can be adapted in place " +
    "via python-pptx rather than rebuilt from scratch with pptxgenjs.",
  instructions: PPTX_SKILL_INSTRUCTIONS,
  exposeInstructions: true,
  mcpServers: [{ name: "sandbox" }],
  version: 8,
  icon: "ActionSlideshowIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags);
  },
} as const satisfies GlobalSkillDefinition;
