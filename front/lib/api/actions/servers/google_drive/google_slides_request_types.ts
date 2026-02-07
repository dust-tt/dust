import { z } from "zod";

/**
 * Complete Zod schemas for all Google Slides API batch update request types.
 *
 * This matches the googleapis Schema$Request structure where all request types
 * are optional properties on a single object (discriminated union pattern).
 *
 * Reference: https://developers.google.com/slides/api/reference/rest/v1/presentations/request
 */

// ============================================================================
// Common Types
// ============================================================================

const DimensionSchema = z.object({
  magnitude: z.number(),
  unit: z.enum(["EMU", "PT"]),
});

const SizeSchema = z.object({
  width: DimensionSchema.optional(),
  height: DimensionSchema.optional(),
});

const RgbColorSchema = z.object({
  red: z.number().min(0).max(1).optional(),
  green: z.number().min(0).max(1).optional(),
  blue: z.number().min(0).max(1).optional(),
});

const OpaqueColorSchema = z.object({
  rgbColor: RgbColorSchema.optional(),
  themeColor: z
    .enum([
      "THEME_COLOR_TYPE_UNSPECIFIED",
      "DARK1",
      "LIGHT1",
      "DARK2",
      "LIGHT2",
      "ACCENT1",
      "ACCENT2",
      "ACCENT3",
      "ACCENT4",
      "ACCENT5",
      "ACCENT6",
      "HYPERLINK",
      "FOLLOWED_HYPERLINK",
      "TEXT1",
      "BACKGROUND1",
      "TEXT2",
      "BACKGROUND2",
    ])
    .optional(),
});

const OptionalColorSchema = z.object({
  opaqueColor: OpaqueColorSchema.optional(),
});

const AffineTransformSchema = z.object({
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  shearX: z.number().optional(),
  shearY: z.number().optional(),
  translateX: z.number().optional(),
  translateY: z.number().optional(),
  unit: z.enum(["EMU", "PT"]).optional(),
});

const PageElementPropertiesSchema = z.object({
  pageObjectId: z.string(),
  size: SizeSchema.optional(),
  transform: AffineTransformSchema.optional(),
});

const TableCellLocationSchema = z.object({
  tableObjectId: z.string(),
  rowIndex: z.number().int(),
  columnIndex: z.number().int(),
});

const TableRangeSchema = z.object({
  location: TableCellLocationSchema,
  rowSpan: z.number().int().optional(),
  columnSpan: z.number().int().optional(),
});

// ============================================================================
// Individual Request Type Schemas
// ============================================================================

const CreateImageSchema = z.object({
  objectId: z.string().optional(),
  url: z.string().url(),
  elementProperties: PageElementPropertiesSchema,
});

const CreateLineSchema = z.object({
  objectId: z.string().optional(),
  elementProperties: PageElementPropertiesSchema,
  lineCategory: z
    .enum([
      "LINE",
      "STRAIGHT_CONNECTOR_1",
      "BENT_CONNECTOR_2",
      "CURVED_CONNECTOR_3",
    ])
    .optional(),
});

const CreateParagraphBulletsSchema = z.object({
  objectId: z.string(),
  textRange: z
    .object({
      type: z.enum([
        "RANGE_TYPE_UNSPECIFIED",
        "FIXED_RANGE",
        "FROM_START_INDEX",
        "ALL",
      ]),
      startIndex: z.number().int().optional(),
      endIndex: z.number().int().optional(),
    })
    .optional(),
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
  cellLocation: TableCellLocationSchema.optional(),
});

const CreateShapeSchema = z.object({
  objectId: z.string().optional(),
  shapeType: z
    .enum([
      "TYPE_UNSPECIFIED",
      "TEXT_BOX",
      "RECTANGLE",
      "ROUND_RECTANGLE",
      "ELLIPSE",
      "CLOUD",
      "CUSTOM",
      "CLOUD_CALLOUT",
      "BENT_ARROW",
      "BENT_UP_ARROW",
      "BEVEL",
      "BLOCK_ARC",
      "BRACE_PAIR",
      "BRACKET_PAIR",
      "CAN",
      "CHEVRON",
      "CHORD",
      "DECAGON",
      "DIAGONAL_STRIPE",
      "DIAMOND",
      "DODECAGON",
      "DONUT",
      "DOUBLE_WAVE",
      "DOWN_ARROW",
      "DOWN_ARROW_CALLOUT",
      "FOLDED_CORNER",
      "FRAME",
      "HALF_FRAME",
      "HEART",
      "HEPTAGON",
      "HEXAGON",
      "HOME_PLATE",
      "HORIZONTAL_SCROLL",
      "IRREGULAR_SEAL_1",
      "IRREGULAR_SEAL_2",
      "LEFT_ARROW",
      "LEFT_ARROW_CALLOUT",
      "LEFT_BRACE",
      "LEFT_BRACKET",
      "LEFT_RIGHT_ARROW",
      "LEFT_RIGHT_ARROW_CALLOUT",
      "LEFT_RIGHT_UP_ARROW",
      "LEFT_UP_ARROW",
      "LIGHTNING_BOLT",
      "MATH_DIVIDE",
      "MATH_EQUAL",
      "MATH_MINUS",
      "MATH_MULTIPLY",
      "MATH_NOT_EQUAL",
      "MATH_PLUS",
      "MOON",
      "NO_SMOKING",
      "NOTCHED_RIGHT_ARROW",
      "OCTAGON",
      "PARALLELOGRAM",
      "PENTAGON",
      "PIE",
      "PLAQUE",
      "PLUS",
      "QUAD_ARROW",
      "QUAD_ARROW_CALLOUT",
      "RIBBON",
      "RIBBON_2",
      "RIGHT_ARROW",
      "RIGHT_ARROW_CALLOUT",
      "RIGHT_BRACE",
      "RIGHT_BRACKET",
      "ROUND_1_RECTANGLE",
      "ROUND_2_DIAGONAL_RECTANGLE",
      "ROUND_2_SAME_RECTANGLE",
      "RIGHT_TRIANGLE",
      "SMILEY_FACE",
      "SNIP_1_RECTANGLE",
      "SNIP_2_DIAGONAL_RECTANGLE",
      "SNIP_2_SAME_RECTANGLE",
      "SNIP_ROUND_RECTANGLE",
      "STAR_10",
      "STAR_12",
      "STAR_16",
      "STAR_24",
      "STAR_32",
      "STAR_4",
      "STAR_5",
      "STAR_6",
      "STAR_7",
      "STAR_8",
      "STRIPED_RIGHT_ARROW",
      "SUN",
      "TRAPEZOID",
      "TRIANGLE",
      "UP_ARROW",
      "UP_ARROW_CALLOUT",
      "UP_DOWN_ARROW",
      "UTURN_ARROW",
      "VERTICAL_SCROLL",
      "WAVE",
      "WEDGE_ELLIPSE_CALLOUT",
      "WEDGE_RECTANGLE_CALLOUT",
      "WEDGE_ROUND_RECTANGLE_CALLOUT",
      "FLOW_CHART_ALTERNATE_PROCESS",
      "FLOW_CHART_COLLATE",
      "FLOW_CHART_CONNECTOR",
      "FLOW_CHART_DECISION",
      "FLOW_CHART_DELAY",
      "FLOW_CHART_DISPLAY",
      "FLOW_CHART_DOCUMENT",
      "FLOW_CHART_EXTRACT",
      "FLOW_CHART_INPUT_OUTPUT",
      "FLOW_CHART_INTERNAL_STORAGE",
      "FLOW_CHART_MAGNETIC_DISK",
      "FLOW_CHART_MAGNETIC_DRUM",
      "FLOW_CHART_MAGNETIC_TAPE",
      "FLOW_CHART_MANUAL_INPUT",
      "FLOW_CHART_MANUAL_OPERATION",
      "FLOW_CHART_MERGE",
      "FLOW_CHART_MULTIDOCUMENT",
      "FLOW_CHART_OFFLINE_STORAGE",
      "FLOW_CHART_OFFPAGE_CONNECTOR",
      "FLOW_CHART_ONLINE_STORAGE",
      "FLOW_CHART_OR",
      "FLOW_CHART_PREDEFINED_PROCESS",
      "FLOW_CHART_PREPARATION",
      "FLOW_CHART_PROCESS",
      "FLOW_CHART_PUNCHED_CARD",
      "FLOW_CHART_PUNCHED_TAPE",
      "FLOW_CHART_SORT",
      "FLOW_CHART_SUMMING_JUNCTION",
      "FLOW_CHART_TERMINATOR",
      "ARROW_EAST",
      "ARROW_NORTH_EAST",
      "ARROW_NORTH",
      "SPEECH",
      "STARBURST",
      "TEARDROP",
      "ELLIPSE_RIBBON",
      "ELLIPSE_RIBBON_2",
      "CORNER",
      "DIAGRAM_2",
      "DIAGRAM_3",
      "DIAGRAM_4",
      "DIAGRAM_5",
      "DIAGRAM_6",
    ])
    .optional(),
  elementProperties: PageElementPropertiesSchema,
});

const CreateSheetsChartSchema = z.object({
  objectId: z.string().optional(),
  spreadsheetId: z.string(),
  chartId: z.number().int(),
  linkingMode: z
    .enum(["NOT_LINKED_IMAGE", "LINKED"])
    .optional()
    .default("NOT_LINKED_IMAGE"),
  elementProperties: PageElementPropertiesSchema,
});

const CreateSlideSchema = z.object({
  objectId: z.string().optional(),
  insertionIndex: z.number().int().optional(),
  slideLayoutReference: z
    .object({
      predefinedLayout: z
        .enum([
          "PREDEFINED_LAYOUT_UNSPECIFIED",
          "BLANK",
          "CAPTION_ONLY",
          "TITLE",
          "TITLE_AND_BODY",
          "TITLE_AND_TWO_COLUMNS",
          "TITLE_ONLY",
          "SECTION_HEADER",
          "SECTION_TITLE_AND_DESCRIPTION",
          "ONE_COLUMN_TEXT",
          "MAIN_POINT",
          "BIG_NUMBER",
        ])
        .optional(),
      layoutId: z.string().optional(),
    })
    .optional(),
  placeholderIdMappings: z
    .array(
      z.object({
        layoutPlaceholder: z.record(z.unknown()),
        objectId: z.string(),
      })
    )
    .optional(),
});

const CreateTableSchema = z.object({
  objectId: z.string().optional(),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  elementProperties: PageElementPropertiesSchema,
});

const CreateVideoSchema = z.object({
  objectId: z.string().optional(),
  source: z.enum(["SOURCE_UNSPECIFIED", "YOUTUBE", "DRIVE"]),
  id: z.string(),
  elementProperties: PageElementPropertiesSchema,
});

const DeleteObjectSchema = z.object({
  objectId: z.string(),
});

const DeleteParagraphBulletsSchema = z.object({
  objectId: z.string(),
  textRange: z
    .object({
      type: z.enum([
        "RANGE_TYPE_UNSPECIFIED",
        "FIXED_RANGE",
        "FROM_START_INDEX",
        "ALL",
      ]),
      startIndex: z.number().int().optional(),
      endIndex: z.number().int().optional(),
    })
    .optional(),
  cellLocation: TableCellLocationSchema.optional(),
});

const DeleteTableColumnSchema = z.object({
  tableObjectId: z.string(),
  cellLocation: TableCellLocationSchema,
});

const DeleteTableRowSchema = z.object({
  tableObjectId: z.string(),
  cellLocation: TableCellLocationSchema,
});

const DeleteTextSchema = z.object({
  objectId: z.string(),
  textRange: z
    .object({
      type: z.enum([
        "RANGE_TYPE_UNSPECIFIED",
        "FIXED_RANGE",
        "FROM_START_INDEX",
        "ALL",
      ]),
      startIndex: z.number().int().optional(),
      endIndex: z.number().int().optional(),
    })
    .optional(),
  cellLocation: TableCellLocationSchema.optional(),
});

const DuplicateObjectSchema = z.object({
  objectId: z.string(),
  objectIds: z.record(z.string()).optional(),
});

const GroupObjectsSchema = z.object({
  childrenObjectIds: z.array(z.string()),
  groupObjectId: z.string().optional(),
});

const InsertTableColumnsSchema = z.object({
  tableObjectId: z.string(),
  cellLocation: TableCellLocationSchema,
  insertRight: z.boolean().optional(),
  number: z.number().int().positive().optional().default(1),
});

const InsertTableRowsSchema = z.object({
  tableObjectId: z.string(),
  cellLocation: TableCellLocationSchema,
  insertBelow: z.boolean().optional(),
  number: z.number().int().positive().optional().default(1),
});

const InsertTextSchema = z.object({
  objectId: z.string(),
  text: z.string(),
  insertionIndex: z.number().int().optional(),
  cellLocation: TableCellLocationSchema.optional(),
});

const MergeTableCellsSchema = z.object({
  objectId: z.string(),
  tableRange: TableRangeSchema,
});

const RefreshSheetsChartSchema = z.object({
  objectId: z.string(),
});

const ReplaceAllShapesWithImageSchema = z.object({
  imageUrl: z.string().url(),
  imageReplaceMethod: z.enum(["CENTER_INSIDE", "CENTER_CROP"]),
  containsText: z.object({
    text: z.string(),
    matchCase: z.boolean().optional(),
  }),
  pageObjectIds: z.array(z.string()).optional(),
});

const ReplaceAllShapesWithSheetsChartSchema = z.object({
  spreadsheetId: z.string(),
  chartId: z.number().int(),
  linkingMode: z
    .enum(["NOT_LINKED_IMAGE", "LINKED"])
    .optional()
    .default("NOT_LINKED_IMAGE"),
  containsText: z.object({
    text: z.string(),
    matchCase: z.boolean().optional(),
  }),
  pageObjectIds: z.array(z.string()).optional(),
});

const ReplaceAllTextSchema = z.object({
  containsText: z.object({
    text: z.string(),
    matchCase: z.boolean().optional(),
  }),
  replaceText: z.string(),
  pageObjectIds: z.array(z.string()).optional(),
});

const ReplaceImageSchema = z.object({
  imageObjectId: z.string(),
  url: z.string().url(),
  imageReplaceMethod: z.enum(["CENTER_INSIDE", "CENTER_CROP"]),
});

const RerouteLineSchema = z.object({
  objectId: z.string(),
});

const UngroupObjectsSchema = z.object({
  objectIds: z.array(z.string()),
});

const UnmergeTableCellsSchema = z.object({
  objectId: z.string(),
  tableRange: TableRangeSchema,
});

const UpdateImagePropertiesSchema = z.object({
  objectId: z.string(),
  imageProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateLinePropertiesSchema = z.object({
  objectId: z.string(),
  lineProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdatePageElementAltTextSchema = z.object({
  objectId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const UpdatePageElementTransformSchema = z.object({
  objectId: z.string(),
  transform: AffineTransformSchema,
  applyMode: z.enum(["APPLY_MODE_UNSPECIFIED", "RELATIVE", "ABSOLUTE"]),
});

const UpdatePageElementsZOrderSchema = z.object({
  pageElementObjectIds: z.array(z.string()),
  operation: z.enum([
    "Z_ORDER_OPERATION_UNSPECIFIED",
    "BRING_TO_FRONT",
    "BRING_FORWARD",
    "SEND_BACKWARD",
    "SEND_TO_BACK",
  ]),
});

const UpdatePagePropertiesSchema = z.object({
  objectId: z.string(),
  pageProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateParagraphStyleSchema = z.object({
  objectId: z.string(),
  style: z.record(z.unknown()),
  fields: z.string(),
  textRange: z
    .object({
      type: z.enum([
        "RANGE_TYPE_UNSPECIFIED",
        "FIXED_RANGE",
        "FROM_START_INDEX",
        "ALL",
      ]),
      startIndex: z.number().int().optional(),
      endIndex: z.number().int().optional(),
    })
    .optional(),
  cellLocation: TableCellLocationSchema.optional(),
});

const UpdateShapePropertiesSchema = z.object({
  objectId: z.string(),
  shapeProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateSlidePropertiesSchema = z.object({
  objectId: z.string(),
  slideProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateSlidesPositionSchema = z.object({
  slideObjectIds: z.array(z.string()),
  insertionIndex: z.number().int().optional().default(0),
});

const UpdateTableBorderPropertiesSchema = z.object({
  objectId: z.string(),
  tableRange: TableRangeSchema.optional(),
  borderPosition: z
    .enum([
      "ALL",
      "BOTTOM",
      "INNER",
      "INNER_HORIZONTAL",
      "INNER_VERTICAL",
      "LEFT",
      "OUTER",
      "RIGHT",
      "TOP",
    ])
    .optional(),
  tableBorderProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateTableCellPropertiesSchema = z.object({
  objectId: z.string(),
  tableRange: TableRangeSchema,
  tableCellProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateTableColumnPropertiesSchema = z.object({
  objectId: z.string(),
  columnIndices: z.array(z.number().int()),
  tableColumnProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateTableRowPropertiesSchema = z.object({
  objectId: z.string(),
  rowIndices: z.array(z.number().int()),
  tableRowProperties: z.record(z.unknown()),
  fields: z.string(),
});

const UpdateTextStyleSchema = z.object({
  objectId: z.string(),
  style: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
    smallCaps: z.boolean().optional(),
    fontSize: DimensionSchema.optional(),
    foregroundColor: OptionalColorSchema.optional(),
    backgroundColor: OptionalColorSchema.optional(),
    fontFamily: z.string().optional(),
    baselineOffset: z
      .enum(["BASELINE_OFFSET_UNSPECIFIED", "NONE", "SUPERSCRIPT", "SUBSCRIPT"])
      .optional(),
    link: z.record(z.unknown()).optional(),
    weightedFontFamily: z.record(z.unknown()).optional(),
  }),
  textRange: z
    .object({
      type: z.enum([
        "RANGE_TYPE_UNSPECIFIED",
        "FIXED_RANGE",
        "FROM_START_INDEX",
        "ALL",
      ]),
      startIndex: z.number().int().optional(),
      endIndex: z.number().int().optional(),
    })
    .optional(),
  cellLocation: TableCellLocationSchema.optional(),
  fields: z.string(),
});

const UpdateVideoPropertiesSchema = z.object({
  objectId: z.string(),
  videoProperties: z.record(z.unknown()),
  fields: z.string(),
});

// ============================================================================
// Combined Request Schema (matches googleapis Schema$Request structure)
// ============================================================================

/**
 * Schema for a single Google Slides API request.
 * Matches the googleapis Schema$Request interface where all request types
 * are optional properties (discriminated union - only one should be set).
 */
export const GoogleSlidesRequestSchema = z.object({
  createImage: CreateImageSchema.optional(),
  createLine: CreateLineSchema.optional(),
  createParagraphBullets: CreateParagraphBulletsSchema.optional(),
  createShape: CreateShapeSchema.optional(),
  createSheetsChart: CreateSheetsChartSchema.optional(),
  createSlide: CreateSlideSchema.optional(),
  createTable: CreateTableSchema.optional(),
  createVideo: CreateVideoSchema.optional(),
  deleteObject: DeleteObjectSchema.optional(),
  deleteParagraphBullets: DeleteParagraphBulletsSchema.optional(),
  deleteTableColumn: DeleteTableColumnSchema.optional(),
  deleteTableRow: DeleteTableRowSchema.optional(),
  deleteText: DeleteTextSchema.optional(),
  duplicateObject: DuplicateObjectSchema.optional(),
  groupObjects: GroupObjectsSchema.optional(),
  insertTableColumns: InsertTableColumnsSchema.optional(),
  insertTableRows: InsertTableRowsSchema.optional(),
  insertText: InsertTextSchema.optional(),
  mergeTableCells: MergeTableCellsSchema.optional(),
  refreshSheetsChart: RefreshSheetsChartSchema.optional(),
  replaceAllShapesWithImage: ReplaceAllShapesWithImageSchema.optional(),
  replaceAllShapesWithSheetsChart:
    ReplaceAllShapesWithSheetsChartSchema.optional(),
  replaceAllText: ReplaceAllTextSchema.optional(),
  replaceImage: ReplaceImageSchema.optional(),
  rerouteLine: RerouteLineSchema.optional(),
  ungroupObjects: UngroupObjectsSchema.optional(),
  unmergeTableCells: UnmergeTableCellsSchema.optional(),
  updateImageProperties: UpdateImagePropertiesSchema.optional(),
  updateLineProperties: UpdateLinePropertiesSchema.optional(),
  updatePageElementAltText: UpdatePageElementAltTextSchema.optional(),
  updatePageElementTransform: UpdatePageElementTransformSchema.optional(),
  updatePageElementsZOrder: UpdatePageElementsZOrderSchema.optional(),
  updatePageProperties: UpdatePagePropertiesSchema.optional(),
  updateParagraphStyle: UpdateParagraphStyleSchema.optional(),
  updateShapeProperties: UpdateShapePropertiesSchema.optional(),
  updateSlideProperties: UpdateSlidePropertiesSchema.optional(),
  updateSlidesPosition: UpdateSlidesPositionSchema.optional(),
  updateTableBorderProperties: UpdateTableBorderPropertiesSchema.optional(),
  updateTableCellProperties: UpdateTableCellPropertiesSchema.optional(),
  updateTableColumnProperties: UpdateTableColumnPropertiesSchema.optional(),
  updateTableRowProperties: UpdateTableRowPropertiesSchema.optional(),
  updateTextStyle: UpdateTextStyleSchema.optional(),
  updateVideoProperties: UpdateVideoPropertiesSchema.optional(),
});

/**
 * Array of Google Slides requests for use in metadata.ts.
 */
export const GoogleSlidesRequestsArraySchema = z.array(
  GoogleSlidesRequestSchema
);
