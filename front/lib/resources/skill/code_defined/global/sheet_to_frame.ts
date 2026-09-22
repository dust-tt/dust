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

Convert a sheet when people **add rows to it** and some columns are **formulas**: expense logs,
time sheets, request intakes, inventory counts, trackers.

Do not convert, and say why: a dashboard, pivot, or financial model (the sheet is the output — use
the spreadsheet skill); a one-off analysis; a sheet whose rows are edited in place rather than
appended, until you understand that workflow. When the sheet qualifies but the user did not ask,
offer in one line rather than converting unprompted.

## 1. Enable the ${framesSkill.name} skill first

Before reading the sheet, call \`${ENABLE_SKILL_TOOL}\` with \`skillName\` exactly
\`${framesSkill.name}\`. It carries the \`dsbx frame\` lifecycle, the manifest and database
contracts, the function and hook APIs, and the linter. This skill does not restate them.

## 2. Read the sheet twice

Read the same range with \`get_worksheet\` twice: \`valueRenderOption: "FORMATTED_VALUE"\` for the
data, then \`valueRenderOption: "FORMULA"\` for the source.

The second read is the one that matters: it is the only thing that separates **entered** columns
from **calculated** ones, and that split drives the whole design. Never infer it from headers — a
"Total" column is sometimes typed by hand.

Also pick up: rows above the header that are not data; constants the formulas reference from
outside the row (a rate, a price, a lookup tab) — follow each reference; validation lists, which
become select inputs; date and author columns, which become inferred fields (step 6); the usual
sort column; totals rows, which are not data.

For an uploaded \`.xlsx\` or \`.csv\`, run \`xlsx_inspect\` in the Computer instead — it reports
formula and cached value side by side. Everything after this step is identical.

## 3. Ask only what the sheet cannot tell you

Batch your questions into one message: a column you could not classify or a formula you could not
follow; whether a referenced constant is fixed or something the user wants to change; meaning
carried outside the columns (conditional formatting, a legend tab, initials standing for a status);
who may delete rows.

Do not ask which columns are calculated, what the sort order is, or what the date column means. You
read that.

## 4. Schema: store what people type, nothing they do not

One table, with \`id\` and \`createdAt\`, plus:

- one column per entered field, typed properly — numbers as numbers, dates as timestamps. Do not
  store everything as text because the sheet did;
- \`createdBy\` from \`currentUser().sId\` and \`createdByName\`, both \`.notNull()\`, with an index on
  \`createdBy\`;
- \`sourceRowKey\`, nullable text, identifying the sheet row an imported row came from. Index it and
  enforce uniqueness in code, or \`uniqueIndex()\` once you have verified the keys are distinct;
- an index on each sorted column.

**Calculated columns get no column.** They are computed from the stored inputs on read. Storing
them reintroduces the staleness the spreadsheet already had.

The exception: when a formula references a constant that drifts over time — a rate, a price, an FX
rate — snapshot that constant onto the row at entry and compute from the snapshot, otherwise
editing it rewrites history. Keep a user-changeable constant in its own small table.

Put the arithmetic in one helper under \`functions/lib/\`, called from both the read function and
the UI, so the form preview and the stored row cannot disagree.

## 5. Functions

Four, all \`fast\` unless one has to call a Dust tool:

- \`list-rows\` — one bounded screen of rows with their computed fields.
- \`create-row\` — validates, stamps \`createdBy\` and \`createdAt\`, returns the created row with its
  computed fields so the UI updates without refetching. It never accepts a caller id, a timestamp,
  or a calculated field as input: all three are server-side facts.
- \`delete-row\` — a hidden button is not access control: enforce the deletion rule from step 3
  server side.
- \`import-rows\` — \`userIdentity: "frame_author_required"\`, skips rows whose \`sourceRowKey\` already
  exists, returns inserted and skipped counts. That makes a re-run after a partial failure safe.

## 6. Seed from the existing data

Publish first, then seed the live Frame from the Computer:

\`\`\`bash
dsbx frame call <frame-id> import-rows --input '<json>'
\`\`\`

- At most ${IMPORT_BATCH_SIZE} rows per call, from a file when the JSON gets big.
- Map entered fields only; let the Frame compute the rest. A computed value that disagrees with the
  sheet means you misread a formula — fix the formula, not the data.
- Set \`createdBy\` from the sheet's author column when it resolves to a workspace member; otherwise
  mark the row as imported rather than attributing it to yourself or to the user.
- Call \`list-rows\` and check the count against the sheet. Report both numbers.

**The source sheet is read-only.** Never write to it, clear it, or add a "migrated" column. Say in
your final message that it was not modified, and leave archiving to the user.

## 7. The entry form

- An input for each **entered** field, and nothing else.
- **Infer the obvious.** The date defaults to today; the author comes from \`useUserIdentity\`.
  Neither is ever a form field. Show them as text beside the form, and allow overriding the date
  only when back-dating is part of the workflow.
- Input types follow what you read: select for a validation list, number with the sheet's
  precision, date picker, textarea for free text.
- **Calculated fields render live and read-only** as the user types, through the step 4 helper.
- Carry over what the sheet enforced — required columns, ranges, validation lists — and validate in
  \`create-row\` too.
- Submit from a button, not an HTML form submission.

## 8. The table

- Rows with their calculated columns, in the sheet's usual order.
- **Sortable columns where sorting means something**: dates, numbers, status, owner. Not free-text
  notes. Sorting is local UI state, not a database write.
- Delete per row, behind a confirmation.
- Loading, empty, and error states, with the empty state pointing at the form.
- A total or count row when the sheet had one, computed from the rows on screen.

## 9. Before you call it done

- Lint, publish, and open the Frame in the side panel, as the ${framesSkill.name} skill describes.
- Add one row through the form and confirm its calculated fields match what the sheet's formula
  produces for the same inputs.
- Confirm the seeded row count matches the sheet.
- Tell the user how many rows came across, which columns they no longer type, what the form fills
  in for them, and that the sheet is untouched.
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
    "database, seeded with the sheet's existing rows. Use when a Google Sheet or an uploaded " +
    "spreadsheet should become an app, or when asked to replace a shared sheet with something " +
    "people can actually use.",
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
