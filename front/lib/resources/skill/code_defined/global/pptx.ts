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

\`[!]\` blocks delivery: empty placeholder, manual bullet, overflow, overset, distorted or low-res image, stacked boxes, hidden shape. \`[i]\` = judgment call (partial overlap, underfilled, off-centre, tight margin): confirm in the render.

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

Every add, move, delete through \`pptx_slides\`: shares image parts, deep-clones charts; hand-edited \`sldId\`s strand orphan parts. Structure first, content after: duplicating later clones your edits. Never content on \`BLANK\`. Never an emoji or drawn rectangle in place of the template's icon or photo.

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

**Content slots, not spacers.** \`--slide\` prints the skeleton \`p[0]\`, \`p[1]\`, ... incl \`(empty)\` spacers. Write the slots the template fills (often \`p[2]\`, \`p[4]\`, \`p[6]\`): a spacer inherits other styling and strands the markers pinned beside the real rows. Fewer items than slots: clear the surplus, delete its markers. More items: clone a denser exemplar.

**Empty placeholder renders "Click to add ..."**; covering it does not suppress it. Fill (\`slide.shapes.title.text\`, \`slide.placeholders[idx].text_frame.text\`) or delete (\`sp.element.getparent().remove(sp.element)\`).

**Layout styles it.** Bullets from the layout via \`paragraph.level\`; a typed bullet char doubles them. Leave \`font.name\`, \`font.size\`, \`font.color\` unset. Shape outside a placeholder falls back to Arial: copy typeface + color from the matching \`--layouts\` placeholder.

**Constrained shapes** (chevron, trapezoid, pill): sloped sides eat the text area. Margins >= 0.25", longest word on one line, cut the label rather than shrink the font.

**Tables:** edit existing cells, never draw one over them. Fewer rows than the template: leave the extras blank; if QA shows them folding off the slide, rebuild that one table with the original's column widths, row heights, header styling, cell fills.

**Swap images in place**, keeping position, size and crop:

\`\`\`python
_, rId = pic.part.get_or_add_image_part("/files/conversation/logo.png")
pic._element.blipFill.blip.set(qn("r:embed"), rId)
\`\`\`

Never retype a brand name for a logo. Never text over a background image that already carries text: delete that picture or clone another exemplar.

**Adapt, don't gut.** Resize, move, remove template shapes so your content fits; scale images on both axes or crop, never one. Deleting most of an exemplar's shapes = wrong exemplar.

**Drawn content** (native chart, diagram, callout): derive the safe rect first, left + width from the title placeholder, top below the title, bottom above the footer band.

Remove builder guidance (\`<Client name>\`, bracketed prompts, notes). Never remove disclaimers, legal mentions, audience tags. Missing data stays visible as \`[TBD: Q3 revenue]\`, flagged, never invented.

## 4. QA every slide you edited

\`pptx_inspect FILE --qa 2,5,7-9 --grid\` (pass timeoutMs 120000 for a big batch)

\`--grid\` tiles the batch into a few images, cells captioned with their slide number. Open every one with the \`files__cat\` tool; a bash \`cat\` of an image returns binary garbage. Render comes back as text: you cannot see images, say so, don't claim you looked.

Read each box back against its \`#id\` text: fully readable, inside its box, uncovered, legible on its background. Pictures undistorted, filling their box. Markers beside their rows. Charts and tables unclipped. A box you cannot read back is a real defect, not a render artifact.

Overflow: cut text or resize the box, never below the template's sizes. Faint: recolor. Stacked: move. Text bunched at the top of a tall box: \`tf.vertical_anchor = MSO_ANCHOR.MIDDLE\` on that box only, no wholesale re-centering. Stranded marker: shorten that row's copy, or delete the marker if it holds no item.

Fix, re-run \`--qa N\` on that slide, look again. A \`--qa\` from before your last edit is stale. Grid cells are narrow: re-run a plain \`--qa N\` on anything unreadable at that size. Substituted typeface or a few pixels of reflow: not a defect, compare against the template's own slide. Autofit text and dense tables render least reliably: say they need a PowerPoint check.

The renderer only has metric-compatible stand-ins for Calibri, Cambria, Arial, Times New Roman, Courier New. Any other face (Montserrat, Aptos, Georgia) wraps at widths PowerPoint will not reproduce: fit warnings are approximate, leave the copy slack.

## 5. Audit, then deliver

\`pptx_inspect /tmp/deck.pptx --compare /files/conversation/template.pptx\`

Design fidelity + package integrity in one pass. Copy the finished deck back to \`/files/conversation/\` once it passes. Clear every \`[!]\`: fonts dropped or imagery stripped (you rebuilt instead of editing: start again from the copy), layout collapse, density, and under \`Package:\` anything that stops PowerPoint opening the file (stranded part, relationship pointing nowhere, duplicate shape id). Package faults mean you edited the zip by hand: redo those edits through \`pptx_slides\` and python-pptx. No template: \`--validate\` runs the package half alone. Deliver on \`[QA: PASS]\`, every slide read back clean.

## Defaults

Density: the template's max words/slide is a hard ceiling, overflow to \`slide.notes_slide.notes_text_frame\`. Palette: the theme's six accents only. Margins 0.5", bottom 0.5" is the master's logo band. Every slide wants a visual, preferably the template's own; an added chart is native python-pptx (\`XL_CHART_TYPE.BAR_CLUSTERED\`, \`LINE\`) so it inherits the theme, matplotlib only with \`bg1\`/\`tx1\`/accents from the theme line. Vary layouts. No accent lines under titles, no decorative color bars or edge stripes.
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
  version: 7,
  icon: "ActionSlideshowIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags);
  },
} as const satisfies GlobalSkillDefinition;
