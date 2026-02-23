import { z } from "zod";

/**
 * Complete Zod schemas for all Google Sheets API batch update request types.
 *
 * This matches the googleapis Schema$Request structure where all request types
 * are optional properties on a single object (discriminated union pattern).
 *
 * Reference: https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request
 */

// ============================================================================
// Common Types
// ============================================================================

const GridRangeSchema = z.object({
  sheetId: z.number().int().optional(),
  startRowIndex: z.number().int().optional(),
  endRowIndex: z.number().int().optional(),
  startColumnIndex: z.number().int().optional(),
  endColumnIndex: z.number().int().optional(),
});

const DimensionRangeSchema = z.object({
  sheetId: z.number().int().optional(),
  dimension: z.enum(["ROWS", "COLUMNS"]).optional(),
  startIndex: z.number().int().optional(),
  endIndex: z.number().int().optional(),
});

const ColorSchema = z.object({
  red: z.number().min(0).max(1).optional(),
  green: z.number().min(0).max(1).optional(),
  blue: z.number().min(0).max(1).optional(),
  alpha: z.number().min(0).max(1).optional(),
});

const ColorStyleSchema = z.object({
  rgbColor: ColorSchema.optional(),
  themeColor: z
    .enum([
      "THEME_COLOR_TYPE_UNSPECIFIED",
      "TEXT",
      "BACKGROUND",
      "ACCENT1",
      "ACCENT2",
      "ACCENT3",
      "ACCENT4",
      "ACCENT5",
      "ACCENT6",
      "LINK",
    ])
    .optional(),
});

const TextFormatSchema = z.object({
  foregroundColor: ColorSchema.optional(),
  foregroundColorStyle: ColorStyleSchema.optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().int().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  underline: z.boolean().optional(),
  link: z
    .object({
      uri: z.string().optional(),
    })
    .optional(),
});

const NumberFormatSchema = z.object({
  type: z
    .enum([
      "NUMBER_FORMAT_TYPE_UNSPECIFIED",
      "TEXT",
      "NUMBER",
      "PERCENT",
      "CURRENCY",
      "DATE",
      "TIME",
      "DATE_TIME",
      "SCIENTIFIC",
    ])
    .optional(),
  pattern: z.string().optional(),
});

const BordersSchema = z.object({
  top: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  bottom: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  left: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  right: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
});

const PaddingSchema = z.object({
  top: z.number().int().optional(),
  right: z.number().int().optional(),
  bottom: z.number().int().optional(),
  left: z.number().int().optional(),
});

const CellFormatSchema = z.object({
  numberFormat: NumberFormatSchema.optional(),
  backgroundColor: ColorSchema.optional(),
  backgroundColorStyle: ColorStyleSchema.optional(),
  borders: BordersSchema.optional(),
  padding: PaddingSchema.optional(),
  horizontalAlignment: z
    .enum(["HORIZONTAL_ALIGN_UNSPECIFIED", "LEFT", "CENTER", "RIGHT"])
    .optional(),
  verticalAlignment: z
    .enum(["VERTICAL_ALIGN_UNSPECIFIED", "TOP", "MIDDLE", "BOTTOM"])
    .optional(),
  wrapStrategy: z
    .enum(["OVERFLOW_CELL", "LEGACY_WRAP", "CLIP", "WRAP"])
    .optional(),
  textDirection: z
    .enum(["TEXT_DIRECTION_UNSPECIFIED", "LEFT_TO_RIGHT", "RIGHT_TO_LEFT"])
    .optional(),
  hyperlinkDisplayType: z
    .enum(["HYPERLINK_DISPLAY_TYPE_UNSPECIFIED", "LINKED", "PLAIN_TEXT"])
    .optional(),
  textFormat: TextFormatSchema.optional(),
  textRotation: z
    .object({
      angle: z.number().int().optional(),
      vertical: z.boolean().optional(),
    })
    .optional(),
});

const ExtendedValueSchema = z.object({
  numberValue: z.number().optional(),
  stringValue: z.string().optional(),
  boolValue: z.boolean().optional(),
  formulaValue: z.string().optional(),
  errorValue: z
    .object({
      type: z
        .enum([
          "ERROR_TYPE_UNSPECIFIED",
          "ERROR",
          "NULL_VALUE",
          "DIVIDE_BY_ZERO",
          "VALUE",
          "REF",
          "NAME",
          "NUM",
          "N_A",
          "LOADING",
        ])
        .optional(),
      message: z.string().optional(),
    })
    .optional(),
});

const CellDataSchema = z.object({
  userEnteredValue: ExtendedValueSchema.optional(),
  effectiveValue: ExtendedValueSchema.optional(),
  formattedValue: z.string().optional(),
  userEnteredFormat: CellFormatSchema.optional(),
  effectiveFormat: CellFormatSchema.optional(),
  hyperlink: z.string().optional(),
  note: z.string().optional(),
  textFormatRuns: z
    .array(
      z.object({
        startIndex: z.number().int().optional(),
        format: TextFormatSchema.optional(),
      })
    )
    .optional(),
  dataValidation: z
    .object({
      condition: z
        .object({
          type: z
            .enum([
              "CONDITION_TYPE_UNSPECIFIED",
              "NUMBER_GREATER",
              "NUMBER_GREATER_THAN_EQ",
              "NUMBER_LESS",
              "NUMBER_LESS_THAN_EQ",
              "NUMBER_EQ",
              "NUMBER_NOT_EQ",
              "NUMBER_BETWEEN",
              "NUMBER_NOT_BETWEEN",
              "TEXT_CONTAINS",
              "TEXT_NOT_CONTAINS",
              "TEXT_STARTS_WITH",
              "TEXT_ENDS_WITH",
              "TEXT_EQ",
              "TEXT_IS_EMAIL",
              "TEXT_IS_URL",
              "DATE_EQ",
              "DATE_BEFORE",
              "DATE_AFTER",
              "DATE_ON_OR_BEFORE",
              "DATE_ON_OR_AFTER",
              "DATE_BETWEEN",
              "DATE_NOT_BETWEEN",
              "DATE_IS_VALID",
              "ONE_OF_RANGE",
              "ONE_OF_LIST",
              "BLANK",
              "NOT_BLANK",
              "CUSTOM_FORMULA",
              "BOOLEAN",
              "TEXT_NOT_EQ",
              "DATE_NOT_EQ",
            ])
            .optional(),
          values: z
            .array(
              z.object({
                relativeDate: z
                  .enum([
                    "RELATIVE_DATE_UNSPECIFIED",
                    "PAST_YEAR",
                    "PAST_MONTH",
                    "PAST_WEEK",
                    "YESTERDAY",
                    "TODAY",
                    "TOMORROW",
                  ])
                  .optional(),
                userEnteredValue: z.string().optional(),
              })
            )
            .optional(),
        })
        .optional(),
      inputMessage: z.string().optional(),
      strict: z.boolean().optional(),
      showCustomUi: z.boolean().optional(),
    })
    .optional(),
  pivotTable: z.record(z.string(), z.unknown()).optional(),
});

const RowDataSchema = z.object({
  values: z.array(CellDataSchema).optional(),
});

const SheetPropertiesSchema = z.object({
  sheetId: z.number().int().optional(),
  title: z.string().optional(),
  index: z.number().int().optional(),
  sheetType: z
    .enum(["SHEET_TYPE_UNSPECIFIED", "GRID", "OBJECT", "DATA_SOURCE"])
    .optional(),
  gridProperties: z
    .object({
      rowCount: z.number().int().optional(),
      columnCount: z.number().int().optional(),
      frozenRowCount: z.number().int().optional(),
      frozenColumnCount: z.number().int().optional(),
      hideGridlines: z.boolean().optional(),
      rowGroupControlAfter: z.boolean().optional(),
      columnGroupControlAfter: z.boolean().optional(),
    })
    .optional(),
  hidden: z.boolean().optional(),
  tabColor: ColorSchema.optional(),
  tabColorStyle: ColorStyleSchema.optional(),
  rightToLeft: z.boolean().optional(),
});

// ============================================================================
// Request Types
// ============================================================================

const UpdateCellsSchema = z.object({
  rows: z.array(RowDataSchema).optional(),
  fields: z.string().optional(),
  start: z
    .object({
      sheetId: z.number().int().optional(),
      rowIndex: z.number().int().optional(),
      columnIndex: z.number().int().optional(),
    })
    .optional(),
  range: GridRangeSchema.optional(),
});

const UpdateSheetPropertiesSchema = z.object({
  properties: SheetPropertiesSchema,
  fields: z.string(),
});

const UpdateDimensionPropertiesSchema = z.object({
  range: DimensionRangeSchema,
  properties: z.object({
    pixelSize: z.number().int().optional(),
    hiddenByFilter: z.boolean().optional(),
    hiddenByUser: z.boolean().optional(),
    developerMetadata: z.array(z.record(z.string(), z.unknown())).optional(),
    dataSourceColumnReference: z.record(z.string(), z.unknown()).optional(),
  }),
  fields: z.string(),
});

const RepeatCellSchema = z.object({
  range: GridRangeSchema,
  cell: CellDataSchema,
  fields: z.string(),
});

const AddSheetSchema = z.object({
  properties: SheetPropertiesSchema.optional(),
});

const DeleteSheetSchema = z.object({
  sheetId: z.number().int(),
});

const AppendCellsSchema = z.object({
  sheetId: z.number().int(),
  rows: z.array(RowDataSchema),
  fields: z.string(),
});

const ClearBasicFilterSchema = z.object({
  sheetId: z.number().int(),
});

const DeleteDimensionSchema = z.object({
  range: DimensionRangeSchema,
});

const InsertDimensionSchema = z.object({
  range: DimensionRangeSchema,
  inheritFromBefore: z.boolean().optional(),
});

const MoveDimensionSchema = z.object({
  source: DimensionRangeSchema,
  destinationIndex: z.number().int().optional(),
});

const UpdateBordersSchema = z.object({
  range: GridRangeSchema,
  top: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  bottom: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  left: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  right: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  innerHorizontal: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
  innerVertical: z
    .object({
      style: z
        .enum([
          "STYLE_UNSPECIFIED",
          "DOTTED",
          "DASHED",
          "SOLID",
          "SOLID_MEDIUM",
          "SOLID_THICK",
          "NONE",
          "DOUBLE",
        ])
        .optional(),
      width: z.number().int().optional(),
      color: ColorSchema.optional(),
      colorStyle: ColorStyleSchema.optional(),
    })
    .optional(),
});

const MergeCellsSchema = z.object({
  range: GridRangeSchema,
  mergeType: z.enum(["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"]).optional(),
});

const UnmergeCellsSchema = z.object({
  range: GridRangeSchema,
});

const AutoResizeDimensionsSchema = z.object({
  dimensions: DimensionRangeSchema,
});

const SortRangeSchema = z.object({
  range: GridRangeSchema,
  sortSpecs: z.array(
    z.object({
      dimensionIndex: z.number().int().optional(),
      sortOrder: z.enum(["SORT_ORDER_UNSPECIFIED", "ASCENDING", "DESCENDING"]),
      foregroundColor: ColorSchema.optional(),
      foregroundColorStyle: ColorStyleSchema.optional(),
      backgroundColor: ColorSchema.optional(),
      backgroundColorStyle: ColorStyleSchema.optional(),
      dataSourceColumnReference: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

const SetDataValidationSchema = z.object({
  range: GridRangeSchema,
  rule: z
    .object({
      condition: z
        .object({
          type: z
            .enum([
              "CONDITION_TYPE_UNSPECIFIED",
              "NUMBER_GREATER",
              "NUMBER_GREATER_THAN_EQ",
              "NUMBER_LESS",
              "NUMBER_LESS_THAN_EQ",
              "NUMBER_EQ",
              "NUMBER_NOT_EQ",
              "NUMBER_BETWEEN",
              "NUMBER_NOT_BETWEEN",
              "TEXT_CONTAINS",
              "TEXT_NOT_CONTAINS",
              "TEXT_STARTS_WITH",
              "TEXT_ENDS_WITH",
              "TEXT_EQ",
              "TEXT_IS_EMAIL",
              "TEXT_IS_URL",
              "DATE_EQ",
              "DATE_BEFORE",
              "DATE_AFTER",
              "DATE_ON_OR_BEFORE",
              "DATE_ON_OR_AFTER",
              "DATE_BETWEEN",
              "DATE_NOT_BETWEEN",
              "DATE_IS_VALID",
              "ONE_OF_RANGE",
              "ONE_OF_LIST",
              "BLANK",
              "NOT_BLANK",
              "CUSTOM_FORMULA",
              "BOOLEAN",
              "TEXT_NOT_EQ",
              "DATE_NOT_EQ",
            ])
            .optional(),
          values: z
            .array(
              z.object({
                relativeDate: z
                  .enum([
                    "RELATIVE_DATE_UNSPECIFIED",
                    "PAST_YEAR",
                    "PAST_MONTH",
                    "PAST_WEEK",
                    "YESTERDAY",
                    "TODAY",
                    "TOMORROW",
                  ])
                  .optional(),
                userEnteredValue: z.string().optional(),
              })
            )
            .optional(),
        })
        .optional(),
      inputMessage: z.string().optional(),
      strict: z.boolean().optional(),
      showCustomUi: z.boolean().optional(),
    })
    .optional(),
});

const SetBasicFilterSchema = z.object({
  filter: z.object({
    range: GridRangeSchema.optional(),
    sortSpecs: z
      .array(
        z.object({
          dimensionIndex: z.number().int().optional(),
          sortOrder: z
            .enum(["SORT_ORDER_UNSPECIFIED", "ASCENDING", "DESCENDING"])
            .optional(),
        })
      )
      .optional(),
    criteria: z.record(z.string(), z.unknown()).optional(),
    filterSpecs: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

const AddProtectedRangeSchema = z.object({
  protectedRange: z.object({
    range: GridRangeSchema.optional(),
    namedRangeId: z.string().optional(),
    protectedRangeId: z.number().int().optional(),
    description: z.string().optional(),
    warningOnly: z.boolean().optional(),
    requestingUserCanEdit: z.boolean().optional(),
    unprotectedRanges: z.array(GridRangeSchema).optional(),
    editors: z
      .object({
        users: z.array(z.string()).optional(),
        groups: z.array(z.string()).optional(),
        domainUsersCanEdit: z.boolean().optional(),
      })
      .optional(),
  }),
});

const DeleteProtectedRangeSchema = z.object({
  protectedRangeId: z.number().int(),
});

const UpdateProtectedRangeSchema = z.object({
  protectedRange: z.object({
    protectedRangeId: z.number().int(),
    range: GridRangeSchema.optional(),
    namedRangeId: z.string().optional(),
    description: z.string().optional(),
    warningOnly: z.boolean().optional(),
    requestingUserCanEdit: z.boolean().optional(),
    unprotectedRanges: z.array(GridRangeSchema).optional(),
    editors: z
      .object({
        users: z.array(z.string()).optional(),
        groups: z.array(z.string()).optional(),
        domainUsersCanEdit: z.boolean().optional(),
      })
      .optional(),
  }),
  fields: z.string(),
});

const AutoFillSchema = z.object({
  useAlternateSeries: z.boolean().optional(),
  range: GridRangeSchema.optional(),
  sourceAndDestination: z
    .object({
      source: GridRangeSchema,
      dimension: z.enum(["DIMENSION_UNSPECIFIED", "ROWS", "COLUMNS"]),
      fillLength: z.number().int(),
    })
    .optional(),
});

const CutPasteSchema = z.object({
  source: GridRangeSchema,
  destination: z
    .object({
      sheetId: z.number().int().optional(),
      rowIndex: z.number().int().optional(),
      columnIndex: z.number().int().optional(),
    })
    .optional(),
  pasteType: z
    .enum([
      "PASTE_NORMAL",
      "PASTE_VALUES",
      "PASTE_FORMAT",
      "PASTE_NO_BORDERS",
      "PASTE_FORMULA",
      "PASTE_DATA_VALIDATION",
      "PASTE_CONDITIONAL_FORMATTING",
    ])
    .optional(),
});

const CopyPasteSchema = z.object({
  source: GridRangeSchema,
  destination: GridRangeSchema,
  pasteType: z
    .enum([
      "PASTE_NORMAL",
      "PASTE_VALUES",
      "PASTE_FORMAT",
      "PASTE_NO_BORDERS",
      "PASTE_FORMULA",
      "PASTE_DATA_VALIDATION",
      "PASTE_CONDITIONAL_FORMATTING",
    ])
    .optional(),
  pasteOrientation: z.enum(["NORMAL", "TRANSPOSE"]).optional(),
});

const FindReplaceSchema = z.object({
  find: z.string(),
  replacement: z.string(),
  sheetId: z.number().int().optional(),
  range: GridRangeSchema.optional(),
  allSheets: z.boolean().optional(),
  matchCase: z.boolean().optional(),
  matchEntireCell: z.boolean().optional(),
  searchByRegex: z.boolean().optional(),
  includeFormulas: z.boolean().optional(),
});

const DuplicateSheetSchema = z.object({
  sourceSheetId: z.number().int(),
  insertSheetIndex: z.number().int().optional(),
  newSheetId: z.number().int().optional(),
  newSheetName: z.string().optional(),
});

const AddConditionalFormatRuleSchema = z.object({
  rule: z.record(z.string(), z.unknown()),
  index: z.number().int().optional(),
});

const UpdateConditionalFormatRuleSchema = z.object({
  sheetId: z.number().int().optional(),
  index: z.number().int().optional(),
  newIndex: z.number().int().optional(),
  rule: z.record(z.string(), z.unknown()).optional(),
});

const DeleteConditionalFormatRuleSchema = z.object({
  sheetId: z.number().int(),
  index: z.number().int(),
});

const AddNamedRangeSchema = z.object({
  namedRange: z.object({
    namedRangeId: z.string().optional(),
    name: z.string(),
    range: GridRangeSchema,
  }),
});

const DeleteNamedRangeSchema = z.object({
  namedRangeId: z.string(),
});

const UpdateNamedRangeSchema = z.object({
  namedRange: z.object({
    namedRangeId: z.string(),
    name: z.string().optional(),
    range: GridRangeSchema.optional(),
  }),
  fields: z.string(),
});

const AddFilterViewSchema = z.object({
  filter: z.record(z.string(), z.unknown()),
});

const DeleteFilterViewSchema = z.object({
  filterId: z.number().int(),
});

const DuplicateFilterViewSchema = z.object({
  filterId: z.number().int(),
});

const UpdateFilterViewSchema = z.object({
  filter: z.record(z.string(), z.unknown()),
  fields: z.string(),
});

const AppendDimensionSchema = z.object({
  sheetId: z.number().int(),
  dimension: z.enum(["DIMENSION_UNSPECIFIED", "ROWS", "COLUMNS"]),
  length: z.number().int(),
});

const AddChartSchema = z.object({
  chart: z.record(z.string(), z.unknown()),
});

const UpdateChartSpecSchema = z.object({
  chartId: z.number().int(),
  spec: z.record(z.string(), z.unknown()),
});

const DeleteEmbeddedObjectSchema = z.object({
  objectId: z.number().int(),
});

const TextToColumnsSchema = z.object({
  source: GridRangeSchema,
  delimiter: z.string().optional(),
  delimiterType: z
    .enum([
      "DELIMITER_TYPE_UNSPECIFIED",
      "COMMA",
      "SEMICOLON",
      "PERIOD",
      "SPACE",
      "CUSTOM",
      "AUTODETECT",
    ])
    .optional(),
});

const CreateDeveloperMetadataSchema = z.object({
  developerMetadata: z.record(z.string(), z.unknown()),
});

const DeleteDeveloperMetadataSchema = z.object({
  dataFilter: z.record(z.string(), z.unknown()),
});

const UpdateDeveloperMetadataSchema = z.object({
  dataFilters: z.array(z.record(z.string(), z.unknown())),
  developerMetadata: z.record(z.string(), z.unknown()),
  fields: z.string(),
});

const RandomizeRangeSchema = z.object({
  range: GridRangeSchema,
});

const AddDimensionGroupSchema = z.object({
  range: DimensionRangeSchema,
});

const DeleteDimensionGroupSchema = z.object({
  range: DimensionRangeSchema,
});

const UpdateDimensionGroupSchema = z.object({
  dimensionGroup: z.record(z.string(), z.unknown()),
  fields: z.string(),
});

const TrimWhitespaceSchema = z.object({
  range: GridRangeSchema,
});

const DeleteDuplicatesSchema = z.object({
  range: GridRangeSchema,
  comparisonColumns: z.array(DimensionRangeSchema),
});

const UpdateEmbeddedObjectPositionSchema = z.object({
  objectId: z.number().int(),
  newPosition: z.record(z.string(), z.unknown()),
  fields: z.string().optional(),
});

const InsertRangeSchema = z.object({
  range: GridRangeSchema,
  shiftDimension: z
    .enum(["DIMENSION_UNSPECIFIED", "ROWS", "COLUMNS"])
    .optional(),
});

const DeleteRangeSchema = z.object({
  range: GridRangeSchema,
  shiftDimension: z
    .enum(["DIMENSION_UNSPECIFIED", "ROWS", "COLUMNS"])
    .optional(),
});

const PasteDataSchema = z.object({
  coordinate: z.object({
    sheetId: z.number().int().optional(),
    rowIndex: z.number().int().optional(),
    columnIndex: z.number().int().optional(),
  }),
  data: z.string(),
  type: z
    .enum([
      "PASTE_NORMAL",
      "PASTE_VALUES",
      "PASTE_FORMAT",
      "PASTE_NO_BORDERS",
      "PASTE_FORMULA",
      "PASTE_DATA_VALIDATION",
      "PASTE_CONDITIONAL_FORMATTING",
    ])
    .optional(),
  delimiter: z.string().optional(),
  html: z.boolean().optional(),
});

// ============================================================================
// Main Request Schema
// ============================================================================

/**
 * Main Google Sheets request schema - all request types
 * are optional properties (discriminated union - only one should be set).
 */
export const GoogleSheetsRequestSchema = z.object({
  updateCells: UpdateCellsSchema.optional(),
  updateSheetProperties: UpdateSheetPropertiesSchema.optional(),
  updateDimensionProperties: UpdateDimensionPropertiesSchema.optional(),
  repeatCell: RepeatCellSchema.optional(),
  addSheet: AddSheetSchema.optional(),
  deleteSheet: DeleteSheetSchema.optional(),
  appendCells: AppendCellsSchema.optional(),
  clearBasicFilter: ClearBasicFilterSchema.optional(),
  deleteDimension: DeleteDimensionSchema.optional(),
  insertDimension: InsertDimensionSchema.optional(),
  moveDimension: MoveDimensionSchema.optional(),
  updateBorders: UpdateBordersSchema.optional(),
  mergeCells: MergeCellsSchema.optional(),
  unmergeCells: UnmergeCellsSchema.optional(),
  autoResizeDimensions: AutoResizeDimensionsSchema.optional(),
  sortRange: SortRangeSchema.optional(),
  setDataValidation: SetDataValidationSchema.optional(),
  setBasicFilter: SetBasicFilterSchema.optional(),
  addProtectedRange: AddProtectedRangeSchema.optional(),
  deleteProtectedRange: DeleteProtectedRangeSchema.optional(),
  updateProtectedRange: UpdateProtectedRangeSchema.optional(),
  autoFill: AutoFillSchema.optional(),
  cutPaste: CutPasteSchema.optional(),
  copyPaste: CopyPasteSchema.optional(),
  findReplace: FindReplaceSchema.optional(),
  duplicateSheet: DuplicateSheetSchema.optional(),
  addConditionalFormatRule: AddConditionalFormatRuleSchema.optional(),
  updateConditionalFormatRule: UpdateConditionalFormatRuleSchema.optional(),
  deleteConditionalFormatRule: DeleteConditionalFormatRuleSchema.optional(),
  addNamedRange: AddNamedRangeSchema.optional(),
  deleteNamedRange: DeleteNamedRangeSchema.optional(),
  updateNamedRange: UpdateNamedRangeSchema.optional(),
  addFilterView: AddFilterViewSchema.optional(),
  deleteFilterView: DeleteFilterViewSchema.optional(),
  duplicateFilterView: DuplicateFilterViewSchema.optional(),
  updateFilterView: UpdateFilterViewSchema.optional(),
  appendDimension: AppendDimensionSchema.optional(),
  addChart: AddChartSchema.optional(),
  updateChartSpec: UpdateChartSpecSchema.optional(),
  deleteEmbeddedObject: DeleteEmbeddedObjectSchema.optional(),
  textToColumns: TextToColumnsSchema.optional(),
  createDeveloperMetadata: CreateDeveloperMetadataSchema.optional(),
  deleteDeveloperMetadata: DeleteDeveloperMetadataSchema.optional(),
  updateDeveloperMetadata: UpdateDeveloperMetadataSchema.optional(),
  randomizeRange: RandomizeRangeSchema.optional(),
  addDimensionGroup: AddDimensionGroupSchema.optional(),
  deleteDimensionGroup: DeleteDimensionGroupSchema.optional(),
  updateDimensionGroup: UpdateDimensionGroupSchema.optional(),
  trimWhitespace: TrimWhitespaceSchema.optional(),
  deleteDuplicates: DeleteDuplicatesSchema.optional(),
  updateEmbeddedObjectPosition: UpdateEmbeddedObjectPositionSchema.optional(),
  insertRange: InsertRangeSchema.optional(),
  deleteRange: DeleteRangeSchema.optional(),
  pasteData: PasteDataSchema.optional(),
});

/**
 * Array of Google Sheets requests for use in metadata.ts.
 */
export const GoogleSheetsRequestsArraySchema = z.array(
  GoogleSheetsRequestSchema
);
