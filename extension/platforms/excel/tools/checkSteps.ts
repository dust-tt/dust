import { Err, Ok, type Result } from "@app/types/shared/result";
import type { Step } from "@extension/platforms/excel/tools/parseExpression";

// The Office.js classes that an expression can go through. The key is the name of the class in
// the allowlist, and the value is the Office.js class. Example: `Range` is `Excel.Range`.
type ExcelClasses = {
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
  ChartSeriesCollection: Excel.ChartSeriesCollection;
  ChartSeries: Excel.ChartSeries;
};

// The name of a class in the allowlist, or `ClientResult`. A `ClientResult` is a value, as from
// `getCount()`: the expression must stop there.
type ExcelClass = keyof ExcelClasses | "ClientResult";

// For each class, the members that only read, and the class of the object that each member
// gives.
// Example: in `Workbook`, the line `worksheets: "WorksheetCollection"` allows
// `workbook.worksheets`, and the next step must be in `WorksheetCollection`.
//
// A method that changes the workbook (`delete`, `clear`, `insert`, `set`, `add`...) must not be
// in this list.
const ALLOWLIST: {
  [C in keyof ExcelClasses]: Partial<Record<keyof ExcelClasses[C], ExcelClass>>;
} = {
  Workbook: {
    worksheets: "WorksheetCollection",
    tables: "TableCollection",
    names: "NamedItemCollection",
    pivotTables: "PivotTableCollection",
    getSelectedRange: "Range",
    getActiveCell: "Range",
  },
  WorksheetCollection: {
    getItem: "Worksheet",
    getItemOrNullObject: "Worksheet",
    getActiveWorksheet: "Worksheet",
    getFirst: "Worksheet",
    getLast: "Worksheet",
    getCount: "ClientResult",
  },
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
    getCellProperties: "ClientResult",
  },
  TableCollection: {
    getItem: "Table",
    getItemOrNullObject: "Table",
    getItemAt: "Table",
    getCount: "ClientResult",
  },
  Table: {
    worksheet: "Worksheet",
    columns: "TableColumnCollection",
    getRange: "Range",
    getHeaderRowRange: "Range",
    getDataBodyRange: "Range",
    getTotalRowRange: "Range",
  },
  NamedItemCollection: {
    getItem: "NamedItem",
    getItemOrNullObject: "NamedItem",
    getCount: "ClientResult",
  },
  NamedItem: {
    getRange: "Range",
    getRangeOrNullObject: "Range",
  },
  TableColumnCollection: {
    getItem: "TableColumn",
    getItemOrNullObject: "TableColumn",
    getItemAt: "TableColumn",
    getCount: "ClientResult",
  },
  TableColumn: {
    getRange: "Range",
    getHeaderRowRange: "Range",
    getDataBodyRange: "Range",
    getTotalRowRange: "Range",
  },
  PivotTableCollection: {
    getItem: "PivotTable",
    getItemOrNullObject: "PivotTable",
    getCount: "ClientResult",
  },
  PivotTable: {
    worksheet: "Worksheet",
    layout: "PivotLayout",
    getDataSourceString: "ClientResult",
    getDataSourceType: "ClientResult",
  },
  PivotLayout: {
    getRange: "Range",
    getDataBodyRange: "Range",
    getRowLabelRange: "Range",
    getColumnLabelRange: "Range",
    getFilterAxisRange: "Range",
  },
  ChartCollection: {
    getItem: "Chart",
    getItemOrNullObject: "Chart",
    getItemAt: "Chart",
    getCount: "ClientResult",
  },
  // To read the data of a chart, use `load`, for example `load(['name', 'title/text'])`.
  // TODO(office_addin): allow `getImage()`. The tool returns only text, and the model sees a
  // base64 string in text as characters, not as an image. To allow it, return each image as an
  // `image` content block.
  Chart: {
    worksheet: "Worksheet",
    series: "ChartSeriesCollection",
  },
  ChartSeriesCollection: {
    getItemAt: "ChartSeries",
    getCount: "ClientResult",
  },
  ChartSeries: {
    getDimensionValues: "ClientResult",
    getDimensionDataSourceString: "ClientResult",
  },
};

/**
 * Returns the class of the object that `step` gives on an object of class `currentClass`, or an
 * error if the step is not allowed.
 *
 * Examples:
 *   - On `Workbook`, `worksheets` gives `WorksheetCollection`.
 *   - On `Worksheet`, `delete()` gives an error, because `delete` is not in the allowlist.
 */
function nextClass(
  currentClass: ExcelClass,
  step: Step
): Result<ExcelClass, string> {
  if (currentClass === "ClientResult") {
    return new Err(
      `"${step.name}" is not allowed after a method that gives a value.`
    );
  }
  const members: Partial<Record<string, ExcelClass>> = ALLOWLIST[currentClass];
  const next = Object.hasOwn(members, step.name)
    ? members[step.name]
    : undefined;
  if (next === undefined) {
    return new Err(
      `"${step.name}" is not allowed on ${currentClass}. Allowed: ${Object.keys(members).join(", ")}.`
    );
  }
  return new Ok(next);
}

/**
 * Checks the `load` step. `objectClass` is the class of the object to load.
 *
 * The properties in `load` are not checked: a load only reads, and Office.js gives an error for a
 * property that it does not know.
 *
 * Examples:
 *   - `workbook.worksheets.load('name').getItem('Sheet1')` is not allowed: `load` is not the last
 *     step.
 *   - `workbook.tables.getCount().load('x')` is not allowed: a value has nothing to load.
 *   - `workbook.getSelectedRange().load()` is not allowed: it loads all the properties, which can
 *     be very large.
 */
function checkLoad(
  step: Step,
  objectClass: ExcelClass,
  isLastStep: boolean
): Result<undefined, string> {
  if (!isLastStep) {
    return new Err('"load" must be the last step of the expression.');
  }
  if (objectClass === "ClientResult") {
    return new Err('"load" is not allowed after a method that gives a value.');
  }
  if (step.kind !== "call" || step.args.length !== 1) {
    return new Err(
      "\"load\" needs one argument, for example load(['address', 'values'])."
    );
  }
  return new Ok(undefined);
}

/**
 * Checks the steps of an expression, one at a time, from `Workbook`. The expression must end
 * with `load(...)`, because an Office.js object is empty until it is loaded. Only an expression
 * that gives a value, as from `getCount()`, has no `load`.
 *
 * Examples:
 *   - `workbook.worksheets.getItem('Sheet1').load('name')` is allowed. `worksheets` gives
 *     `WorksheetCollection`, `getItem` gives `Worksheet`, then `load` loads the worksheet.
 *   - `workbook.tables.getCount()` is allowed: it gives a value.
 *   - `workbook.getSelectedRange()` is not allowed: there is no `load`.
 */
export function checkSteps(steps: Step[]): Result<undefined, string> {
  let currentClass: ExcelClass = "Workbook";
  for (const [index, step] of steps.entries()) {
    if (step.name === "load") {
      return checkLoad(step, currentClass, index === steps.length - 1);
    }
    const next = nextClass(currentClass, step);
    if (next.isErr()) {
      return next;
    }
    currentClass = next.value;
  }
  if (currentClass !== "ClientResult") {
    return new Err(
      "End the expression with load(...), for example load(['address', 'values'])."
    );
  }
  return new Ok(undefined);
}
