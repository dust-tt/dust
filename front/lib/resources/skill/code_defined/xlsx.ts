import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const XLSX_SKILL_INSTRUCTIONS = `# Spreadsheets (.xlsx, .xlsm, .csv, .tsv)

Use this skill when the user asks you to create, read, edit, or analyze a
spreadsheet. Run everything through the sandbox \`bash\` tool. Write
deliverables to \`/files/conversation/\` so the user can download them.

## 1. Inspect before you touch
When an existing spreadsheet is in play, the **very first** action is to
inspect it with \`xlsx_inspect\` — never \`pandas.read_excel\` blind
(\`read_excel\` discards every formula and you'll silently lose the model).

\`\`\`bash
xlsx_inspect /files/conversation/budget.xlsx                              # workbook overview
xlsx_inspect /files/conversation/budget.xlsx --sheet "P&L"                # one sheet
xlsx_inspect /files/conversation/budget.xlsx --sheet "P&L" --range A1:H50 # cells in range
xlsx_inspect /files/conversation/budget.xlsx --formulas-only              # all formulas
xlsx_inspect /files/conversation/budget.xlsx --names                      # defined names
\`\`\`

The output shows formula AND cached value side-by-side per cell, plus number
format and font color. Use it to map: which cells are inputs (blue, no
formula), which are formulas (referencing inputs), what the named ranges
are, where merged headers sit, and **where charts and images are anchored**
(reported as "Graphics" — never write data into those ranges or you'll
be writing under a chart or image). Walk **every sheet you intend to
modify** before writing a single line of code.

## 2. Adapt templates, do not recreate them
When the user gives you a template, modify cells in place. Do **not**
"create a new version with the appropriate data filled in" — that's a lazy
shortcut that loses the user's formatting, formulas, and structure. Only
recreate from scratch when the user explicitly asks.

## 3. CRITICAL: write formulas, not pre-computed values
A workbook where derived cells contain numeric literals instead of formulas
is a **bug**, not a shortcut. The user expects to change an assumption and
watch the model recompute. Static numbers force them to redo the math by
hand — the deliverable is unusable.

Rules:
- Any cell whose value is **derived** from another cell MUST be a formula
  (\`=B5*(1+$D$2)\`), never the evaluated number.
- Inputs and assumptions live in their own clearly-labeled cells. Formulas
  reference those cells with absolute refs (\`$D$2\`) so they survive
  fill-down.
- For large files, use \`read_only=True\` / \`write_only=True\` openpyxl
  modes.

### CRITICAL: NEVER USE PANDAS
- \`pandas.DataFrame.to_excel\` writes **evaluated values only**. Use it
  exclusively for data dumps with no derivations.
- \`openpyxl\` is the default for anything: assumptions,
  totals, growth rates, scenario knobs, ratios, aggregations, charts,
  formatting, named ranges.

### Worked example: revenue projection
\`\`\`python
# BAD — bakes the math into static values; user can't change the growth rate
import pandas as pd
df = pd.DataFrame({
    "Year": [2024, 2025, 2026],
    "Revenue": [1000, 1050, 1102.5],
})
df.to_excel("/files/conversation/model.xlsx", index=False)

# GOOD — assumption in its own cell, formulas reference it
from openpyxl import Workbook
wb = Workbook(); ws = wb.active
ws["A1"], ws["B1"] = "Year", "Revenue"
ws["A2"], ws["B2"] = 2024, 1000              # base year input
ws["D1"], ws["D2"] = "Growth", 0.05          # assumption cell
for i, year in enumerate([2025, 2026], start=3):
    ws[f"A{i}"] = year
    ws[f"B{i}"] = f"=B{i-1}*(1+$D$2)"        # formula, not the number
wb.save("/files/conversation/model.xlsx")
\`\`\`

## 4. Recalculate after writing formulas
\`openpyxl\` writes formula strings but does not compute their values. Excel
will recalc on open, but Google Sheets and headless readers will not. After
writing, force a recalc by round-tripping through LibreOffice:

\`\`\`bash
soffice --headless --calc --convert-to xlsx --outdir /tmp recalc_input.xlsx
mv /tmp/recalc_input.xlsx /files/conversation/output.xlsx
\`\`\`

## 5. Self-check before delivering
Run \`xlsx_inspect <file> --formulas-only\` on the output. Confirm every
derived column is a formula string starting with \`=\`. If you find bare
numbers where formulas should be, fix the **source code** that produced
them, not the output.

Also verify zero formula errors. \`#REF!\`, \`#DIV/0!\`, \`#VALUE!\`, \`#N/A\`,
\`#NAME?\` must all be eliminated before delivery.

## Financial-model conventions (when building/editing models)
- **Coloring: respect the spreadsheet's existing convention.** When
  editing an existing workbook, \`xlsx_inspect\` reports font ARGB
  (e.g. \`font: FF0000FF\`) on each formatted cell — match the colors
  already in use for inputs, formulas, and links. Only introduce a new
  color scheme when the user explicitly asks or when starting from
  scratch. A common default for new models: blue inputs / scenario
  knobs, black formulas, green cross-sheet links, red external links,
  yellow background for key assumptions.
- Currency \`$#,##0\` (specify units in the column header, e.g.
  \`Revenue ($mm)\`), zero shown as \`-\`, percentages \`0.0%\`, multiples
  \`0.0x\`, negatives in parentheses.
- Years as text (\`"2024"\`), not numbers (\`2,024\`).
- When updating an existing template, **match its existing format**,
  fonts, and conventions exactly rather than imposing standardized
  formatting.
`;

export const xlsxSkill = {
  sId: "xlsx",
  name: "Spreadsheets",
  userFacingDescription:
    "Read, edit, and create spreadsheets (.xlsx, .csv) in the sandbox.",
  agentFacingDescription:
    "Work with .xlsx, .xlsm, .csv, and .tsv files in the sandbox. Includes " +
    "the xlsx_inspect tool for paginated structural inspection of workbooks " +
    "(sheets, formulas, cached values, formatting) so templates can be " +
    "adapted in place rather than rewritten.",
  instructions: XLSX_SKILL_INSTRUCTIONS,
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "ActionTableIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("sandbox_tools");
  },
} as const satisfies GlobalSkillDefinition;
