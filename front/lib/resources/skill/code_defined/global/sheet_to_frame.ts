import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { framesSkill } from "@app/lib/resources/skill/code_defined/global/frames";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const ENABLE_SKILL_TOOL = getPrefixedToolName(
  SKILL_MANAGEMENT_SERVER_NAME,
  ENABLE_SKILL_TOOL_NAME
);

// Seeding one row per call would cost one round trip per sheet row. Batches keep the whole import
// to a handful of calls while staying well under the function payload cap.
const IMPORT_BATCH_SIZE = 200;

/**
 * @cc [owner:davidebbo,label:product] sheet-to-frame-defers-to-frames-skill
 * The sheet-to-frame instructions MUST direct the agent to enable the Frames skill before any
 * Frame work and MUST NOT restate its authoring, linting, or publishing mechanics, which are
 * versioned there.
 */
/**
 * @cc [owner:davidebbo,label:product] sheet-to-frame-calculated-fields-derived
 * The sheet-to-frame instructions MUST keep a source sheet's formula columns out of the Frame
 * database schema and out of the entry form: they are derived on read from the stored entered
 * fields.
 */
const SHEET_TO_FRAME_INSTRUCTIONS = `\
# Turning a spreadsheet into a Frame

A spreadsheet people type rows into is an application waiting to happen. This skill covers the
decisions specific to that conversion. Every Frame mechanic — manifest, functions, databases,
linting, publishing — comes from the ${framesSkill.name} skill, which you enable first and follow
for all of it.

## Is this sheet a candidate?

Convert a sheet when people **add rows to it** and some columns are **formulas**: expense logs,
time sheets, request intakes, inventory counts, pipeline trackers, bug or incident logs. The tell
is a header row, one row per event, and at least one column nobody types.

Do not convert, and say why:

- a dashboard, pivot, or financial model — the sheet is the output, not an entry form. Use the
  spreadsheet skill instead.
- a one-off analysis, or a sheet nobody has appended to in months. Build a plain Frame that reads
  the data, or just answer the question.
- a sheet whose rows are edited in place by many people at once rather than appended. Ask the user
  what the editing workflow actually is before designing anything.

When it is a candidate but the user has not asked for a conversion, offer it in one line rather
than converting unprompted.

## 1. Enable the ${framesSkill.name} skill first

Before reading the sheet, call \`${ENABLE_SKILL_TOOL}\` with \`skillName\` exactly
\`${framesSkill.name}\`. That skill carries the \`dsbx frame\` lifecycle, the manifest and database
contracts, the function and hook APIs, and the linter this workflow depends on. This skill
deliberately does not restate them. Everything below assumes you are following it.

## 2. Read the sheet twice

Read the same range twice with \`get_worksheet\`:

1. \`valueRenderOption: "FORMATTED_VALUE"\` — the data, as people see it.
2. \`valueRenderOption: "FORMULA"\` — the same cells as source.

The second read is the one that matters. It is the only thing that tells you which columns are
**entered** and which are **calculated**, and that split drives the entire design. A column whose
cells come back as \`=B2*C2\` is calculated; a column of literals is entered. Do not infer this from
column headers — a column called "Total" is sometimes typed by hand, and a column called "Notes"
sometimes holds a formula.

While you have both reads, also pick up:

- the header row, and any rows above it (titles, merged banners) that are not data;
- constants the formulas reference from outside the row — a tax rate, a price, an FX rate parked in
  its own cell or on a lookup tab. Follow each reference and note the cell;
- dropdowns and validation lists, which become select inputs;
- a date column and an author column, which become inferred fields rather than inputs (see step 6);
- the column the sheet is usually sorted by;
- empty trailing rows, and totals rows at the bottom. A totals row is not data.

If the sheet is an uploaded \`.xlsx\` or \`.csv\` rather than a Google Sheet, run \`xlsx_inspect\` in
the Computer instead: it reports each cell's formula and cached value side by side, which gives you
the same entered-versus-calculated split. Everything after this step is identical.

## 3. Ask only what the sheet cannot tell you

Batch your questions into one message, and ask only what you could not answer from step 2:

- a column you could not classify, or a formula you could not follow to its source;
- whether a constant the formulas reference is fixed or something the user wants to change later;
- meaning carried outside the columns: conditional formatting colors, a legend tab, a column of
  emoji or initials that stands for a status;
- who may delete rows — everyone, or only the person who created the row;
- rows that look like data but are not, when you are unsure.

Do not ask which columns are calculated, what the sort order is, or what the date column means. You
read that. Asking anyway tells the user you did not.

## 4. Schema: store what people type, nothing they do not

One table for the sheet's rows. Give it \`id\` and \`createdAt\` as the ${framesSkill.name} skill
requires, then:

- **one column per entered field**, typed properly: numbers as numbers, dates as timestamps, a
  validation list as text constrained in code. Do not store everything as text because the sheet
  did;
- \`createdBy\` from \`currentUser().sId\` and \`createdByName\` from the same call, both \`.notNull()\`.
  Index \`createdBy\`;
- \`sourceRowKey\`, nullable text, holding a stable identifier for the sheet row an imported row came
  from (the A1 row reference, or a natural key from the data). Give it a \`uniqueIndex()\` only if
  you have verified the keys are distinct; otherwise index it and enforce uniqueness in code;
- an index on each column the table sorts by.

**Calculated columns get no column.** They are not stored and not entered — they are computed from
the stored inputs when the row is read or rendered. A stored total is the staleness the spreadsheet
already had: change an input and the number lies.

The one case where you do store a derived-looking value: when a formula references a constant that
changes over time — a rate, a price, an exchange rate — snapshot that constant onto the row at
entry and compute from the snapshot. Otherwise editing the rate silently rewrites every historical
row. When the user should be able to change such a constant, keep it in its own small table and
read the current value when creating a row, rather than hard-coding it in the source.

Where to compute: put the arithmetic in one helper under \`functions/lib/\` and call it from both the
read function and the UI, so the live preview in the form and the stored-row display can never
disagree.

## 5. Functions

Four, all \`fast\` unless one of them has to call a Dust tool:

- \`list-rows\` — one bounded screen of rows with their computed fields.
- \`create-row\` — validates, stamps \`createdBy\` and \`createdAt\`, returns the created row with its
  computed fields so the UI can update without refetching.
- \`delete-row\` — deletes by id. Enforce whatever deletion rule step 3 established here, server
  side; a hidden button is not access control.
- \`import-rows\` — \`userIdentity: "frame_author_required"\`, takes an array of rows, skips any whose
  \`sourceRowKey\` already exists, and returns how many it inserted and how many it skipped. Author
  gating keeps the bulk path out of viewers' hands, and skipping on \`sourceRowKey\` makes a re-run
  after a partial failure safe.

\`create-row\` never accepts a caller id, a creation timestamp, or any calculated field as input. All
three are server-side facts.

## 6. Seed from the existing data

Publish first, then seed the live Frame from the Computer:

\`\`\`bash
dsbx frame call <frame-id> import-rows --input '<json>'
\`\`\`

- Send at most ${IMPORT_BATCH_SIZE} rows per call, from a file rather than a long inline string when
  the JSON gets big.
- Map each sheet row to the entered fields only. Let the Frame compute the calculated ones; do not
  carry the sheet's evaluated totals across. If a computed value disagrees with the sheet's, you
  have misread a formula — fix the formula, not the data.
- Set \`createdBy\` for imported rows from the sheet's author column when it has one and the name
  resolves to a workspace member; otherwise mark them as imported rather than attributing them to
  yourself or to the user running the import.
- Then call \`list-rows\` and check the count against the sheet's row count. Report both numbers.

**The source sheet is read-only.** Never write to it, never clear it, never add a "migrated"
column. Say explicitly in your final message that the sheet was not modified, and leave archiving
or freezing it to the user.

## 7. The entry form

The form is the point of the conversion, so it should be visibly less work than the sheet was.

- An input for each **entered** field, and nothing else.
- **Infer the obvious.** The date defaults to today. The author is the current user, from
  \`useUserIdentity\`. Neither is ever a form field — showing the user a date picker preloaded with
  today's date and a name field preloaded with their own name is the sheet's busywork, not an
  improvement. Show them as text next to the form if they are worth showing at all, and let the
  user override the date only when back-dating is a real part of the workflow.
- Input types follow what you read: a select for a validation list, a number input with the sheet's
  precision for numeric columns, a date picker for dates, a textarea for free text.
- **Calculated fields render live and read-only** as the user types, using the same helper the read
  function uses. Watching the total update as you fill the form is what makes the Frame feel like
  an upgrade over the spreadsheet.
- Carry over what the sheet enforced: required columns, value ranges, validation lists. Validate in
  \`create-row\` too — the UI check is a convenience, not the rule.
- Submit from a button, not an HTML form submission.

## 8. The table

- Show the rows, calculated columns included, in the order the sheet was usually sorted.
- **Sortable columns where sorting means something**: dates, numbers, status, owner. Not free-text
  notes. Sorting is local UI state, not a database write.
- **Delete per row**, behind a confirmation, respecting the rule from step 3.
- Loading, empty, and error states for every call, and an empty state that points at the form.
- A total or count row when the sheet had one, computed from the rows on screen.

## 9. Before you call it done

- Run the linter, publish, and open the Frame in the side panel, as the ${framesSkill.name} skill
  describes.
- Add one row through the form yourself and confirm its calculated fields match what the sheet's
  formula would produce for the same inputs.
- Confirm the seeded row count matches the sheet.
- Tell the user, in a few lines: how many rows came across, which columns became calculated fields
  they no longer type, what the form now fills in for them, and that the original sheet is
  untouched.
`;

/**
 * @cc [owner:davidebbo,label:product] sheet-to-frame-follows-frames-v2
 * Sheet-to-frame availability MUST follow the frames_v2 workspace feature: the whole workflow is
 * expressed in Frames v2 mechanics that do not exist without it.
 */
export const sheetToFrameSkill = {
  sId: "sheet-to-frame",
  kind: "global",
  name: "Sheet to Frame",
  userFacingDescription:
    "Turn a data-entry spreadsheet into a real app: a form that fills in the obvious, formulas " +
    "that become fields nobody types, and your existing rows carried over.",
  agentFacingDescription:
    "Convert a spreadsheet used as a data-entry form — expense logs, time sheets, request " +
    "intakes, inventory counts, trackers — into a Frames v2 application backed by a Frame " +
    "database, seeded with the sheet's existing rows. Covers telling entered columns from " +
    "formula columns, the schema and functions that follow, and the form and table UI. Use when " +
    "a Google Sheet or an uploaded spreadsheet should become an app, or when asked to replace a " +
    "shared sheet with something people can actually use.",
  instructions: SHEET_TO_FRAME_INSTRUCTIONS,
  exposeInstructions: true,
  // No MCP servers: the Frame tooling and the linter both ship with the Frames skill, so the
  // first step of the workflow is enabling it rather than duplicating half of it here.
  mcpServers: [],
  // The workflow is Computer-driven from the moment the sheet has been read.
  warmsConversationSandbox: (auth: Authenticator) =>
    hasFeatureFlag(auth, "frames_v2"),
  version: 1,
  icon: "ActionTableIcon",
  isRestricted: async (auth: Authenticator) =>
    !(await hasFeatureFlag(auth, "frames_v2")),
} as const satisfies GlobalSkillDefinition;
