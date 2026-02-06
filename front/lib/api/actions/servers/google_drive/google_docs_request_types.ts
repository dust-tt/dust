import { z } from "zod";

/**
 * Complete Zod schemas for all Google Docs API batch update request types.
 *
 * This matches the googleapis Schema$Request structure where all request types
 * are optional properties on a single object (discriminated union pattern).
 *
 * Reference: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request
 */

// ============================================================================
// Common Types
// ============================================================================

const LocationSchema = z.object({
  index: z.number().int(),
  segmentId: z.string().optional(),
  tabId: z.string().optional(),
});

const RangeSchema = z.object({
  startIndex: z.number().int().optional(),
  endIndex: z.number().int().optional(),
  segmentId: z.string().optional(),
  tabId: z.string().optional(),
});

const DimensionSchema = z.object({
  magnitude: z.number(),
  unit: z.enum(["PT"]),
});

const RgbColorSchema = z.object({
  red: z.number().min(0).max(1).optional(),
  green: z.number().min(0).max(1).optional(),
  blue: z.number().min(0).max(1).optional(),
});

const ColorSchema = z.object({
  rgbColor: RgbColorSchema.optional(),
});

const OptionalColorSchema = z.object({
  color: ColorSchema.optional(),
});

const TableCellLocationSchema = z.object({
  tableStartLocation: LocationSchema,
  rowIndex: z.number().int(),
  columnIndex: z.number().int(),
  tabId: z.string().optional(),
});

// ============================================================================
// Individual Request Type Schemas
// ============================================================================

const CreateFooterSchema = z.object({
  type: z.enum(["DEFAULT", "FIRST_PAGE_ONLY", "EVEN_PAGE_ONLY"]).optional(),
  sectionBreakLocation: LocationSchema.optional(),
  tabId: z.string().optional(),
});

const CreateFootnoteSchema = z.object({
  location: LocationSchema,
  footnoteContent: z.array(z.record(z.unknown())).optional(),
});

const CreateHeaderSchema = z.object({
  type: z.enum(["DEFAULT", "FIRST_PAGE_ONLY", "EVEN_PAGE_ONLY"]).optional(),
  sectionBreakLocation: LocationSchema.optional(),
  tabId: z.string().optional(),
});

const CreateNamedRangeSchema = z.object({
  name: z.string(),
  range: RangeSchema,
});

const CreateParagraphBulletsSchema = z.object({
  range: RangeSchema,
  bulletPreset: z
    .enum([
      "BULLET_DISC_CIRCLE_SQUARE",
      "BULLET_DIAMONDX_ARROW3D_SQUARE",
      "BULLET_CHECKBOX",
      "BULLET_ARROW_DIAMOND_DISC",
      "BULLET_STAR_CIRCLE_SQUARE",
      "BULLET_ARROW3D_CIRCLE_SQUARE",
      "BULLET_LEFTTRIANGLE_DIAMOND_DISC",
      "BULLET_DIAMONDX_HOLLOWDIAMOND_SQUARE",
      "BULLET_DIAMOND_CIRCLE_SQUARE",
      "NUMBERED_DECIMAL_ALPHA_ROMAN",
      "NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS",
      "NUMBERED_DECIMAL_NESTED",
      "NUMBERED_UPPERALPHA_ALPHA_ROMAN",
      "NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL",
      "NUMBERED_ZERODECIMAL_ALPHA_ROMAN",
    ])
    .optional(),
});

const DeleteContentRangeSchema = z.object({
  range: RangeSchema,
});

const DeleteFooterSchema = z.object({
  footerId: z.string(),
  tabId: z.string().optional(),
});

const DeleteHeaderSchema = z.object({
  headerId: z.string(),
  tabId: z.string().optional(),
});

const DeleteNamedRangeSchema = z.object({
  name: z.string().optional(),
  namedRangeId: z.string().optional(),
  tabId: z.string().optional(),
});

const DeleteParagraphBulletsSchema = z.object({
  range: RangeSchema,
});

const DeletePositionedObjectSchema = z.object({
  objectId: z.string(),
  tabId: z.string().optional(),
});

const DeleteTableColumnSchema = z.object({
  tableCellLocation: TableCellLocationSchema,
});

const DeleteTableRowSchema = z.object({
  tableCellLocation: TableCellLocationSchema,
});

const InsertInlineImageSchema = z.object({
  location: LocationSchema,
  uri: z.string().url(),
  objectSize: z
    .object({
      width: DimensionSchema.optional(),
      height: DimensionSchema.optional(),
    })
    .optional(),
});

const InsertPageBreakSchema = z.object({
  location: LocationSchema,
});

const InsertSectionBreakSchema = z.object({
  location: LocationSchema,
  sectionType: z
    .enum(["SECTION_TYPE_UNSPECIFIED", "CONTINUOUS", "NEXT_PAGE"])
    .optional(),
});

const InsertTableSchema = z.object({
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  location: LocationSchema,
});

const InsertTableColumnSchema = z.object({
  tableCellLocation: TableCellLocationSchema,
  insertRight: z.boolean().optional(),
});

const InsertTableRowSchema = z.object({
  tableCellLocation: TableCellLocationSchema,
  insertBelow: z.boolean().optional(),
});

const InsertTextSchema = z.object({
  text: z.string(),
  location: LocationSchema,
});

const MergeTableCellsSchema = z.object({
  tableRange: z.object({
    tableCellLocation: TableCellLocationSchema,
    rowSpan: z.number().int().positive(),
    columnSpan: z.number().int().positive(),
  }),
});

const PinTableHeaderRowsSchema = z.object({
  tableStartLocation: LocationSchema,
  pinnedHeaderRowsCount: z.number().int(),
  tabId: z.string().optional(),
});

const ReplaceAllTextSchema = z.object({
  containsText: z.object({
    text: z.string(),
    matchCase: z.boolean().optional(),
  }),
  replaceText: z.string(),
  tabsCriteria: z.record(z.unknown()).optional(),
});

const ReplaceImageSchema = z.object({
  imageObjectId: z.string(),
  uri: z.string().url(),
  imageReplaceMethod: z.enum(["CENTER_CROP"]).optional(),
  tabId: z.string().optional(),
});

const ReplaceNamedRangeContentSchema = z.object({
  namedRangeId: z.string().optional(),
  namedRangeName: z.string().optional(),
  text: z.string(),
  tabId: z.string().optional(),
});

const UnmergeTableCellsSchema = z.object({
  tableRange: z.object({
    tableCellLocation: TableCellLocationSchema,
    rowSpan: z.number().int().positive(),
    columnSpan: z.number().int().positive(),
  }),
});

const UpdateDocumentStyleSchema = z.object({
  documentStyle: z.record(z.unknown()),
  fields: z.string(),
  tabId: z.string().optional(),
});

const UpdateParagraphStyleSchema = z.object({
  range: RangeSchema,
  paragraphStyle: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateSectionStyleSchema = z.object({
  range: RangeSchema,
  sectionStyle: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateTableCellStyleSchema = z.object({
  tableRange: z.object({
    tableCellLocation: TableCellLocationSchema,
    rowSpan: z.number().int().positive().optional(),
    columnSpan: z.number().int().positive().optional(),
  }),
  tableCellStyle: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateTableColumnPropertiesSchema = z.object({
  tableStartLocation: LocationSchema,
  columnIndices: z.array(z.number().int()),
  tableColumnProperties: z.record(z.unknown()),
  fields: z.string(),
  tabId: z.string().optional(),
});

const UpdateTableRowStyleSchema = z.object({
  tableStartLocation: LocationSchema,
  rowIndices: z.array(z.number().int()),
  tableRowStyle: z.record(z.unknown()),
  fields: z.string(),
  tabId: z.string().optional(),
});

const UpdateTextStyleSchema = z.object({
  range: RangeSchema,
  textStyle: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
    smallCaps: z.boolean().optional(),
    fontSize: DimensionSchema.optional(),
    foregroundColor: OptionalColorSchema.optional(),
    backgroundColor: OptionalColorSchema.optional(),
    weightedFontFamily: z.record(z.unknown()).optional(),
    baselineOffset: z
      .enum(["BASELINE_OFFSET_UNSPECIFIED", "NONE", "SUPERSCRIPT", "SUBSCRIPT"])
      .optional(),
    link: z.record(z.unknown()).optional(),
  }),
  fields: z.string(),
});

// ============================================================================
// Combined Request Schema (matches googleapis Schema$Request structure)
// ============================================================================

/**
 * Schema for a single Google Docs API request.
 * Matches the googleapis Schema$Request interface where all request types
 * are optional properties (discriminated union - only one should be set).
 */
export const GoogleDocsRequestSchema = z.object({
  createFooter: CreateFooterSchema.optional(),
  createFootnote: CreateFootnoteSchema.optional(),
  createHeader: CreateHeaderSchema.optional(),
  createNamedRange: CreateNamedRangeSchema.optional(),
  createParagraphBullets: CreateParagraphBulletsSchema.optional(),
  deleteContentRange: DeleteContentRangeSchema.optional(),
  deleteFooter: DeleteFooterSchema.optional(),
  deleteHeader: DeleteHeaderSchema.optional(),
  deleteNamedRange: DeleteNamedRangeSchema.optional(),
  deleteParagraphBullets: DeleteParagraphBulletsSchema.optional(),
  deletePositionedObject: DeletePositionedObjectSchema.optional(),
  deleteTableColumn: DeleteTableColumnSchema.optional(),
  deleteTableRow: DeleteTableRowSchema.optional(),
  insertInlineImage: InsertInlineImageSchema.optional(),
  insertPageBreak: InsertPageBreakSchema.optional(),
  insertSectionBreak: InsertSectionBreakSchema.optional(),
  insertTable: InsertTableSchema.optional(),
  insertTableColumn: InsertTableColumnSchema.optional(),
  insertTableRow: InsertTableRowSchema.optional(),
  insertText: InsertTextSchema.optional(),
  mergeTableCells: MergeTableCellsSchema.optional(),
  pinTableHeaderRows: PinTableHeaderRowsSchema.optional(),
  replaceAllText: ReplaceAllTextSchema.optional(),
  replaceImage: ReplaceImageSchema.optional(),
  replaceNamedRangeContent: ReplaceNamedRangeContentSchema.optional(),
  unmergeTableCells: UnmergeTableCellsSchema.optional(),
  updateDocumentStyle: UpdateDocumentStyleSchema.optional(),
  updateParagraphStyle: UpdateParagraphStyleSchema.optional(),
  updateSectionStyle: UpdateSectionStyleSchema.optional(),
  updateTableCellStyle: UpdateTableCellStyleSchema.optional(),
  updateTableColumnProperties: UpdateTableColumnPropertiesSchema.optional(),
  updateTableRowStyle: UpdateTableRowStyleSchema.optional(),
  updateTextStyle: UpdateTextStyleSchema.optional(),
});

/**
 * Array of Google Docs requests for use in metadata.ts.
 */
export const GoogleDocsRequestsArraySchema = z.array(GoogleDocsRequestSchema);
