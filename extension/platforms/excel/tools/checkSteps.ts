import { Err, Ok, type Result } from "@app/types/shared/result";
import type { Step } from "@extension/platforms/excel/tools/parseExpression";

// The member names of all the Excel classes. Example: "getRange" is in this type.
//   1. `keyof typeof Excel` gives each name in the `Excel` namespace. Example: "Range".
//   2. `infer Instance` keeps only the classes. For "Range", `Instance` is `Excel.Range`.
//   3. `keyof Instance` gives the member names of the class. Example: "getCell".
//   4. `[keyof typeof Excel]` puts the names of all the classes in one union.
type ExcelMember = {
  [Name in keyof typeof Excel]: (typeof Excel)[Name] extends abstract new (
    ...args: never[]
  ) => infer Instance
    ? keyof Instance
    : never;
}[keyof typeof Excel];

// The methods that an expression can call, other than `load`. Each one only reads. These are the
// `get*` methods of the Office.js Excel API, and the `find*` and `isFiltered` methods.
//
// The add-in loads the latest Office.js from the Microsoft CDN, so new methods can come without a
// release of the add-in.
//
// These methods only read, but they are not in the list:
//   - `evaluate`: a formula such as `WEBSERVICE("https://...")` can send data out.
//   - `getImage` and `getAsImage`: TODO(office_addin): allow them. The tool returns only text, and
//     the model sees a base64 string in text as characters, not as an image. To allow them, return
//     each image as an `image` content block.
const READ_METHODS: ReadonlySet<string> = new Set<ExcelMember>([
  "getAbsoluteResizedRange",
  "getActive",
  "getActiveCell",
  "getActiveChart",
  "getActiveChartOrNullObject",
  "getActiveShape",
  "getActiveShapeOrNullObject",
  "getActiveSlicer",
  "getActiveSlicerOrNullObject",
  "getActiveWorksheet",
  "getBoundingRect",
  "getByNamespace",
  "getCell",
  "getCellAfterBreak",
  "getCellProperties",
  "getColumn",
  "getColumnLabelRange",
  "getColumnProperties",
  "getColumnsAfter",
  "getColumnsBefore",
  "getCount",
  "getDataBodyRange",
  "getDataHierarchy",
  "getDataSourceString",
  "getDataSourceType",
  "getDataTable",
  "getDataTableOrNullObject",
  "getDefault",
  "getDependents",
  "getDimensionDataSourceString",
  "getDimensionDataSourceType",
  "getDimensionValues",
  "getDirectDependents",
  "getDirectPrecedents",
  "getDisplayedCellProperties",
  "getEntireColumn",
  "getEntireRow",
  "getExtendedRange",
  "getFilterAxisRange",
  "getFilters",
  "getFirst",
  "getFirstOrNullObject",
  "getHeaderRowRange",
  "getIntersection",
  "getIntersectionOrNullObject",
  "getInvalidCells",
  "getInvalidCellsOrNullObject",
  "getIsActiveCollabSession",
  "getItem",
  "getItemAt",
  "getItemByCell",
  "getItemByName",
  "getItemByNameOrNullObject",
  "getItemByReplyId",
  "getItemOrNullObject",
  "getLast",
  "getLastCell",
  "getLastColumn",
  "getLastRow",
  "getLinkedEntityCellValue",
  "getLocation",
  "getLocationOrNullObject",
  "getMergedAreasOrNullObject",
  "getNext",
  "getNextOrNullObject",
  "getOffsetRange",
  "getOffsetRangeAreas",
  "getOnlyItem",
  "getOnlyItemOrNullObject",
  "getParentComment",
  "getPivotItems",
  "getPivotTables",
  "getPrecedents",
  "getPrevious",
  "getPreviousOrNullObject",
  "getPrintArea",
  "getPrintAreaOrNullObject",
  "getPrintTitleColumns",
  "getPrintTitleColumnsOrNullObject",
  "getPrintTitleRows",
  "getPrintTitleRowsOrNullObject",
  "getRange",
  "getRangeAreasBySheet",
  "getRangeAreasOrNullObjectBySheet",
  "getRangeByIndexes",
  "getRangeEdge",
  "getRangeOrNullObject",
  "getRanges",
  "getResizedRange",
  "getRow",
  "getRowLabelRange",
  "getRowProperties",
  "getRowsAbove",
  "getRowsBelow",
  "getSelectedItems",
  "getSelectedRange",
  "getSelectedRanges",
  "getSolidColor",
  "getSpecialCells",
  "getSpecialCellsOrNullObject",
  "getSpillParent",
  "getSpillParentOrNullObject",
  "getSpillingToRange",
  "getSpillingToRangeOrNullObject",
  "getSubstring",
  "getSurroundingRegion",
  "getTable",
  "getTables",
  "getTailAnchor",
  "getText",
  "getTotalRowRange",
  "getUsedRange",
  "getUsedRangeAreas",
  "getUsedRangeAreasOrNullObject",
  "getUsedRangeOrNullObject",
  "getVisibleView",
  "find",
  "findOrNullObject",
  "findAll",
  "findAllOrNullObject",
  "isFiltered",
]);

/**
 * Checks the `load` step.
 *
 * The properties in `load` are not checked: a load only reads, and Office.js gives an error for a
 * property that it does not know.
 *
 * Examples:
 *   - `workbook.worksheets.load('name').getItem('Sheet1')` is not allowed: `load` is not the last
 *     step.
 *   - `workbook.getSelectedRange().load()` is not allowed: it loads all the properties, which can
 *     be very large.
 */
function checkLoad(step: Step, isLastStep: boolean): Result<undefined, string> {
  if (!isLastStep) {
    return new Err('"load" must be the last step of the expression.');
  }
  if (step.kind !== "call" || step.args.length !== 1) {
    return new Err(
      "\"load\" needs one argument, for example load(['address', 'values'])."
    );
  }
  return new Ok(undefined);
}

/**
 * Checks one step.
 *
 * Examples:
 *   - The property `worksheets` is allowed: to get a property only reads.
 *   - The call `getItem('Sheet1')` is allowed: `getItem` is in `READ_METHODS`.
 *   - The call `delete()` is not allowed: it is not in `READ_METHODS`.
 */
function checkStep(step: Step, isLastStep: boolean): Result<undefined, string> {
  // A property is always allowed, so these names are refused here. They are not part of the
  // Office.js API:
  //   - `workbook.constructor` gives the `Workbook` class, not a workbook.
  //     `workbook.constructor.constructor` gives `Function`, which turns a string into code.
  //   - `workbook.__proto__` gives the object that holds the methods of all workbooks.
  //   - `workbook._context` and the other names that start with `_` are internal data of
  //     Office.js.
  if (step.name.startsWith("_") || step.name === "constructor") {
    return new Err(`"${step.name}" is not allowed.`);
  }
  if (step.name === "load") {
    return checkLoad(step, isLastStep);
  }
  switch (step.kind) {
    case "property":
      return new Ok(undefined);
    case "call":
      if (!READ_METHODS.has(step.name)) {
        return new Err(
          `"${step.name}" is not allowed: only read methods are allowed.`
        );
      }
      return new Ok(undefined);
  }
}

/**
 * Checks the steps of an expression. A property is always allowed, and a method call only if the
 * method only reads.
 *
 * Example: `workbook.worksheets.getItem('Sheet1').load('name')` is allowed. Each step is checked:
 * the property `worksheets`, the call `getItem('Sheet1')`, then the call `load('name')`.
 *
 * This check does not know what each step gives. Thus `queueReads` checks, in Excel.run, that an
 * expression that gives an Office.js object ends with `load(...)`.
 */
export function checkSteps(steps: Step[]): Result<undefined, string> {
  for (const [index, step] of steps.entries()) {
    const check = checkStep(step, index === steps.length - 1);
    if (check.isErr()) {
      return check;
    }
  }
  return new Ok(undefined);
}
