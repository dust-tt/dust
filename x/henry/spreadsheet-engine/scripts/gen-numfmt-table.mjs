// Generate corpus/numfmt_cases.tsv: the numfmt golden table (spec §7.3).
//
// Expected outputs come from SheetJS's SSF (pinned in package-lock.json), an
// independent, widely-deployed ECMA-376 formatter — not from our engine, so
// the table cannot self-validate. Curated cases (CURATED below) override SSF
// where Excel and SSF disagree or where we deliberately deviate (documented
// per case). Comparison convention: trailing whitespace is trimmed on both
// sides (alignment padding is invisible in the DOM).
//
// Output columns: value <TAB> format <TAB> date1904 <TAB> expected <TAB> provenance

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import xlsxPkg from "xlsx";

const SSF = xlsxPkg.SSF;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const NUMBER_FORMATS = [
  "0",
  "0.00",
  "0.000",
  "#,##0",
  "#,##0.00",
  "#,##0.000",
  "0%",
  "0.0%",
  "0.00%",
  "0.00E+00",
  "##0.0E+0",
  "0.0#",
  "0.00#",
  "#.##",
  "#,##0,",
  "0.0,,",
  "$#,##0.00",
  "$#,##0",
  "0;(0)",
  "0.00;(0.00)",
  "#,##0.00;(#,##0.00)",
  "$#,##0_);($#,##0)",
  "$#,##0.00_);[Red]($#,##0.00)",
  "#,##0 ;(#,##0)",
  '0;-0;"zero"',
  '"x"0.0"y"',
  '0" units"',
  "0\\h",
  "[>=1000]#,##0;[<1000]0.00",
  "[Red]0.00",
  "[Blue]0;[Red]-0",
];

const NUMBER_VALUES = [
  0, 1, -1, 0.5, -0.5, 2.5, 5.5, -5.5, 0.05, 1234.5678, -1234.5678, 1234567.891, 0.123456,
  99.995, -99.995, 1e-4, 123456789, 0.0001234,
];

const DATE_FORMATS = [
  "yyyy-mm-dd",
  "m/d/yy",
  "m/d/yyyy",
  "mm/dd/yyyy",
  "d-mmm-yy",
  "d-mmm",
  "mmm-yy",
  "mmmm d, yyyy",
  "dddd",
  "ddd",
  "h:mm",
  "hh:mm",
  "h:mm:ss",
  "hh:mm:ss",
  "h:mm AM/PM",
  "h:mm:ss AM/PM",
  "m/d/yy h:mm",
  "yyyy-mm-dd hh:mm:ss",
  "mm:ss",
  "[h]:mm",
  "[h]:mm:ss",
  "[mm]:ss",
];

const DATE_VALUES = [
  1, 2, 59, 60, 61, 100, 1000, 36526, 44197, 45000, 45000.25, 45000.5, 45000.75,
  45000.999988425926, 0.5, 0.25, 0.75, 1.5, 2.0625,
];

// Built-in ids resolved to their ECMA-376 / Excel en-US format strings (our
// engine's table). SSF's numeric-id table deviates on ids 5-8 (it drops the
// `$`), so the grid formats through the STRING — the id mapping itself is
// pinned by engine unit tests.
const BUILTIN_STRINGS = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  5: "$#,##0_);($#,##0)",
  6: "$#,##0_);[Red]($#,##0)",
  7: "$#,##0.00_);($#,##0.00)",
  8: "$#,##0.00_);[Red]($#,##0.00)",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "m/d/yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};
const BUILTIN_VALUES = [0, 1, -1, 0.5, 1234.5678, -1234.5678, 45000, 45000.5209];

// Excel-verified / intentional-deviation cases. These OVERRIDE any SSF grid
// entry with the same (value, format). Provenance explains each source.
const CURATED = [
  // The spec's two headline cases.
  [1234.5, "#,##0.00", 0, "1,234.50", "spec §3.4"],
  [45000, "yyyy-mm-dd", 0, "2023-03-15", "spec §3.4"],
  // Lotus 1900 leap-year bug (ECMA-376 + Excel verified).
  [59, "yyyy-mm-dd", 0, "1900-02-28", "excel-verified"],
  [60, "yyyy-mm-dd", 0, "1900-02-29", "excel-verified: the fake leap day"],
  [61, "yyyy-mm-dd", 0, "1900-03-01", "excel-verified"],
  [0, "m/d/yyyy", 0, "1/0/1900", "excel-verified: serial zero renders day 0"],
  [1, "dddd", 0, "Sunday", "excel-verified: Lotus weekday convention"],
  [60, "dddd", 0, "Wednesday", "excel-verified"],
  // 1904 date system.
  [0, "yyyy-mm-dd", 1, "1904-01-01", "excel-verified"],
  [1, "yyyy-mm-dd", 1, "1904-01-02", "excel-verified"],
  [43538, "yyyy-mm-dd", 1, "2023-03-15", "excel-verified: 45000 - 1462"],
  [0, "dddd", 1, "Friday", "excel-verified: 1904-01-01"],
  // Rounding: away from zero at .5 (Excel), not banker's.
  [2.5, "0", 0, "3", "excel-verified"],
  [5.5, "0", 0, "6", "excel-verified"],
  [-5.5, "0", 0, "-6", "excel-verified"],
  // Zero with optional placeholders.
  [0, "##", 0, "", "excel-verified: no 0-placeholder -> empty"],
  [0.5, "#.00", 0, ".50", "excel-verified"],
  // Time rollover at display precision.
  [0.9999999, "h:mm:ss", 0, "0:00:00", "excel-verified: rounds into next day"],
  // Elapsed.
  [1.5, "[h]:mm", 0, "36:00", "excel-verified"],
  [0.0625, "[mm]:ss", 0, "90:00", "excel-verified"],
  // Text-through-format.
  ["hi", "@", 0, "hi", "excel-verified"],
  ["hi", '"pre "@" post"', 0, "pre hi post", "excel-verified"],
  ["hi", "0.00", 0, "hi", "excel-verified: numeric format passes text through"],
  ["hi", '0;-0;0;"<"@">"', 0, "<hi>", "excel-verified: 4th section"],
  // Fractions (deviation: trailing alignment spaces trimmed; SSF keeps them).
  [5.25, "# ?/?", 0, "5 1/4", "excel-verified (trailing pad trimmed)"],
  [0.5, "# ?/?", 0, " 1/2", "excel-verified (leading literal space kept)"],
  [5, "# ?/?", 0, "5", "deviation: fraction blank trimmed, SSF pads"],
  [1.5, "?/?", 0, "3/2", "excel-verified"],
  [0.6, "# ?/4", 0, " 2/4", "excel-verified: fixed denominator"],
  // Engineering exponent.
  [12345, "##0.0E+0", 0, "12.3E+3", "excel-verified"],
  // Scaling commas after decimals.
  [1234567890, "0.0,,", 0, "1234.6", "excel-verified"],
  // Currency bracket tag.
  [5, "[$€-407] 0.00", 0, "€ 5.00", "excel-verified"],
  // General behavior (our pinned approximation of Excel's 11-digit rule).
  [0.30000000000000004, "General", 0, "0.3", "pinned: 11-sig-digit General"],
  [1234567890123, "General", 0, "1.23457E+12", "pinned: General scientific"],
  [99999999999, "General", 0, "99999999999", "pinned"],
  [100000000000, "General", 0, "1E+11", "pinned"],
  [0.0001, "General", 0, "0.0001", "pinned"],
  [0.00005, "General", 0, "5E-05", "pinned"],
  // SSF negative-value artifacts: JS Math.round() rounds -0.5 toward +inf and
  // SSF's negative fixed-point path drifts from Excel, which rounds half away
  // from zero on the 15-significant-digit decimal representation.
  [-0.5, "0", 0, "-1", "excel-verified: half away from zero (SSF: 0)"],
  [-0.5, '0" units"', 0, "-1 units", "excel-verified (SSF: 0 units)"],
  [-5.5, '0" units"', 0, "-6 units", "excel-verified (SSF: -5 units)"],
  [-0.5, "0\\h", 0, "-1h", "excel-verified (SSF: 0h)"],
  [-5.5, "0\\h", 0, "-6h", "excel-verified (SSF: -5h)"],
  [-99.995, "0.00", 0, "-100.00", "excel-verified: decimal-repr rounding (SSF: -99.99)"],
  [-99.995, "0%", 0, "-10000%", "excel-verified (SSF: -9999%)"],
  [-99.995, "0.0#", 0, "-100.0", "excel-verified (SSF: -99.99)"],
  [-99.995, "[Red]0.00", 0, "-100.00", "excel-verified (SSF: -99.99)"],
  [-99.995, "#.##", 0, "-100.", "pinned: decimal point retained + decimal-repr rounding"],
  [-0.5, "#.##", 0, "-.5", "pinned: # never emits a leading zero (SSF: -0.5)"],
  [99.995, "##0.0E+0", 0, "100.0E+0", "excel-verified (SSF drops the mantissa decimal: 100.E+0)"],
  [-99.995, "##0.0E+0", 0, "-100.0E+0", "excel-verified"],
  // Sign survives display-zero scaling, consistent with `#,##0,` -> "-0".
  [-1, "0.0,,", 0, "-0.0", "pinned: sign survives display-zero (SSF drops it)"],
  [-0.5, "0.0,,", 0, "-0.0", "pinned"],
  [-5.5, "0.0,,", 0, "-0.0", "pinned"],
  [-1234.5678, "0.0,,", 0, "-0.0", "pinned"],
  [-99.995, "0.0,,", 0, "-0.0", "pinned"],
  // Negative serials cannot render as 1900-system dates: Excel fills the cell
  // with #; we emit a fixed "#####" marker (SSF returns the empty string).
  [-1, "yyyy-mm-dd", 0, "#####", "pinned: negative-serial marker"],
  [-1, "h:mm", 0, "#####", "pinned"],
];

function ssfFormat(fmt, value) {
  try {
    const out = SSF.format(fmt, value);
    // SSF returns "" when it cannot format (e.g. negative serial through a
    // date format); skip those grid cells — curated cases pin our behavior.
    return out === "" ? null : out;
  } catch {
    return null;
  }
}

const rows = [];
const seen = new Set();

function addCase(value, format, date1904, expected, provenance) {
  const key = `${value} ${format} ${date1904}`;
  if (seen.has(key)) return;
  if (expected === null || expected === undefined) return;
  if (/[\t\n]/.test(String(expected))) return;
  seen.add(key);
  rows.push([String(value), format, String(date1904), String(expected), provenance].join("\t"));
}

// Curated first: they take precedence over the SSF grids.
for (const [value, format, date1904, expected, provenance] of CURATED) {
  addCase(value, format, date1904, expected, provenance);
}

for (const fmt of NUMBER_FORMATS) {
  for (const v of NUMBER_VALUES) {
    const out = ssfFormat(fmt, v);
    addCase(v, fmt, 0, out === null ? null : out.trimEnd(), "ssf@0.18.5");
  }
}
for (const fmt of DATE_FORMATS) {
  for (const v of DATE_VALUES) {
    const out = ssfFormat(fmt, v);
    addCase(v, fmt, 0, out === null ? null : out.trimEnd(), "ssf@0.18.5");
  }
}
for (const [id, fmtString] of Object.entries(BUILTIN_STRINGS)) {
  for (const v of BUILTIN_VALUES) {
    const out = ssfFormat(fmtString, v);
    addCase(v, `builtin:${id}`, 0, out === null ? null : out.trimEnd(), "ssf@0.18.5 (ECMA en-US builtin string)");
  }
}

const header = "value\tformat\tdate1904\texpected\tprovenance";
writeFileSync(join(root, "corpus/numfmt_cases.tsv"), header + "\n" + rows.join("\n") + "\n");
console.log(`wrote ${rows.length} cases to corpus/numfmt_cases.tsv`);
