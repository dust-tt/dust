import { Err, Ok, type Result } from "@app/types/shared/result";
import type { Step } from "@extension/platforms/excel/tools/parseExpression";

// The Office.js types that an expression can go through. The key is the name that the allowlist
// uses, and the value is the Office.js type. Example: `Range` is `Excel.Range`.
type ExcelTypes = {
  Workbook: Excel.Workbook;
  WorksheetCollection: Excel.WorksheetCollection;
  Worksheet: Excel.Worksheet;
  Range: Excel.Range;
  TableCollection: Excel.TableCollection;
  Table: Excel.Table;
  NamedItemCollection: Excel.NamedItemCollection;
  NamedItem: Excel.NamedItem;
  TableColumnCollection: Excel.TableColumnCollection;
  TableColumn: Excel.TableColumn;
  PivotTableCollection: Excel.PivotTableCollection;
  PivotTable: Excel.PivotTable;
  PivotLayout: Excel.PivotLayout;
  ChartCollection: Excel.ChartCollection;
  Chart: Excel.Chart;
};

// The type that a member gives. `"Value"` is a `ClientResult`, as from `getCount()`: the
// expression must stop there. Example: `workbook.tables.getCount()` is allowed, but
// `workbook.tables.getCount().value` is not.
type TypeName = keyof ExcelTypes | "Value";

// For each type, the members that only read, and the type that each member gives.
// Example: in `Workbook`, the line `worksheets: "WorksheetCollection"` allows
// `workbook.worksheets`, and the next step must be in `WorksheetCollection`.
//
// The keys must be members of the Office.js type, so the compiler finds a wrong name.
// A method that changes the workbook (`delete`, `clear`, `insert`, `set`, `add`...) must not be
// in this list: Office.js sends every call that is in the queue, also when the read fails later.
//
// A sub-object that the list does not contain can still be read with a path in `load`.
// Example: `workbook.getSelectedRange()` with `load: ["format/fill/color"]`.
const ALLOWLIST: {
  [T in keyof ExcelTypes]: Partial<Record<keyof ExcelTypes[T], TypeName>>;
} = {
  // `workbook.getSelectedRange()`
  Workbook: {
    worksheets: "WorksheetCollection",
    tables: "TableCollection",
    names: "NamedItemCollection",
    pivotTables: "PivotTableCollection",
    getSelectedRange: "Range",
    getActiveCell: "Range",
  },
  // `workbook.worksheets.getItem('Sheet1')`
  WorksheetCollection: {
    getItem: "Worksheet",
    getItemOrNullObject: "Worksheet",
    getActiveWorksheet: "Worksheet",
    getFirst: "Worksheet",
    getLast: "Worksheet",
    getCount: "Value",
  },
  // `workbook.worksheets.getItem('Sheet1').getRange('A1:C10')`
  Worksheet: {
    tables: "TableCollection",
    names: "NamedItemCollection",
    pivotTables: "PivotTableCollection",
    charts: "ChartCollection",
    getRange: "Range",
    getRangeByIndexes: "Range",
    getCell: "Range",
    getUsedRange: "Range",
    getUsedRangeOrNullObject: "Range",
    getNext: "Worksheet",
    getPrevious: "Worksheet",
  },
  // `workbook.getSelectedRange().getEntireRow()`
  Range: {
    worksheet: "Worksheet",
    getCell: "Range",
    getRow: "Range",
    getColumn: "Range",
    getEntireRow: "Range",
    getEntireColumn: "Range",
    getLastRow: "Range",
    getLastColumn: "Range",
    getLastCell: "Range",
    getOffsetRange: "Range",
    getResizedRange: "Range",
    getUsedRange: "Range",
    getUsedRangeOrNullObject: "Range",
    getCellProperties: "Value",
  },
  // `workbook.tables.getItem('Sales')`
  TableCollection: {
    getItem: "Table",
    getItemOrNullObject: "Table",
    getItemAt: "Table",
    getCount: "Value",
  },
  // `workbook.tables.getItem('Sales').getDataBodyRange()`
  Table: {
    worksheet: "Worksheet",
    columns: "TableColumnCollection",
    getRange: "Range",
    getHeaderRowRange: "Range",
    getDataBodyRange: "Range",
    getTotalRowRange: "Range",
  },
  // `workbook.names.getItem('TaxRate')`
  NamedItemCollection: {
    getItem: "NamedItem",
    getItemOrNullObject: "NamedItem",
    getCount: "Value",
  },
  // `workbook.names.getItem('TaxRate').getRange()`
  NamedItem: {
    getRange: "Range",
    getRangeOrNullObject: "Range",
  },
  // `workbook.tables.getItem('Sales').columns.getItem('Price')`
  TableColumnCollection: {
    getItem: "TableColumn",
    getItemOrNullObject: "TableColumn",
    getItemAt: "TableColumn",
    getCount: "Value",
  },
  // `workbook.tables.getItem('Sales').columns.getItem('Price').getDataBodyRange()`
  TableColumn: {
    getRange: "Range",
    getHeaderRowRange: "Range",
    getDataBodyRange: "Range",
    getTotalRowRange: "Range",
  },
  // `workbook.pivotTables.getItem('PivotTable1')`
  PivotTableCollection: {
    getItem: "PivotTable",
    getItemOrNullObject: "PivotTable",
    getCount: "Value",
  },
  // `workbook.pivotTables.getItem('PivotTable1').getDataSourceString()`
  PivotTable: {
    worksheet: "Worksheet",
    layout: "PivotLayout",
    getDataSourceString: "Value",
    getDataSourceType: "Value",
  },
  // `workbook.pivotTables.getItem('PivotTable1').layout.getDataBodyRange()`
  PivotLayout: {
    getRange: "Range",
    getDataBodyRange: "Range",
    getRowLabelRange: "Range",
    getColumnLabelRange: "Range",
    getFilterAxisRange: "Range",
  },
  // `workbook.worksheets.getItem('Sheet1').charts.getItemAt(0)`
  ChartCollection: {
    getItem: "Chart",
    getItemOrNullObject: "Chart",
    getItemAt: "Chart",
    getCount: "Value",
  },
  // `workbook.worksheets.getItem('Sheet1').charts.getItemAt(0)`, with `load: ["name", "title/text"]`.
  // `getImage()` is not in the list: it gives a large base64 image.
  Chart: {
    worksheet: "Worksheet",
  },
};

/**
 * Checks that each step is in the allowlist, from the type of the step before it. Returns an
 * error at the first step that is not allowed.
 *
 * Example: for `workbook.worksheets.getItem('Sheet1')`, it starts at `Workbook`. `worksheets`
 * gives `WorksheetCollection`, then `getItem` gives `Worksheet`. For
 * `workbook.worksheets.getItem('Sheet1').delete()`, it returns an error, because `delete` is not
 * in `Worksheet`.
 *
 * The `load` properties are not checked: a load only reads.
 *
 * TODO(office_addin): check the `load` step. An expression that gives an object must end with
 * `load(...)` with one argument, and `load` must be the last step.
 */
export function checkSteps(steps: Step[]): Result<undefined, string> {
  let type: TypeName = "Workbook";
  for (const step of steps) {
    if (type === "Value") {
      return new Err(
        `"${step.name}" is not allowed after a method that gives a value.`
      );
    }
    const members: Partial<Record<string, TypeName>> = ALLOWLIST[type];
    // Only the own keys of the list. Without this, `constructor` or `toString` would come from
    // the prototype of the object.
    const next = Object.hasOwn(members, step.name)
      ? members[step.name]
      : undefined;
    if (next === undefined) {
      // The allowed names help the agent to fix the expression. Example:
      // `"getFormat" is not allowed on Range. Allowed: worksheet, getCell, ...`
      return new Err(
        `"${step.name}" is not allowed on ${type}. Allowed: ${Object.keys(members).join(", ")}.`
      );
    }
    type = next;
  }
  return new Ok(undefined);
}
