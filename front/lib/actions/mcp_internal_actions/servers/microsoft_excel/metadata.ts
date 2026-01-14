import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const MICROSOFT_EXCEL_TOOL_NAME = "microsoft_excel" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listExcelFilesSchema = {
  query: z
    .string()
    .describe(
      "Search query to find relevant files and content in OneDrive and SharePoint."
    ),
};

export const getWorksheetsSchema = {
  itemId: z
    .string()
    .describe("The ID of the Excel file to get worksheets from."),
  driveId: z
    .string()
    .optional()
    .describe(
      "The ID of the drive containing the file. Takes priority over siteId if provided."
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "The ID of the SharePoint site containing the file. Used if driveId is not provided."
    ),
};

export const readWorksheetSchema = {
  itemId: z.string().describe("The ID of the Excel file to read from."),
  driveId: z
    .string()
    .optional()
    .describe(
      "The ID of the drive containing the file. Takes priority over siteId if provided."
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "The ID of the SharePoint site containing the file. Used if driveId is not provided."
    ),
  worksheetName: z
    .string()
    .describe("Name of the worksheet to read from (e.g., 'Sheet1')"),
  range: z
    .string()
    .optional()
    .describe(
      "Optional cell range in A1 notation (e.g., 'A1:D10'). If not provided, reads the used range."
    ),
};

export const writeWorksheetSchema = {
  itemId: z.string().describe("The ID of the Excel file to write to."),
  driveId: z
    .string()
    .optional()
    .describe(
      "The ID of the drive containing the file. Takes priority over siteId if provided."
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "The ID of the SharePoint site containing the file. Used if driveId is not provided."
    ),
  worksheetName: z
    .string()
    .describe("Name of the worksheet to write to (e.g., 'Sheet1')"),
  range: z
    .string()
    .describe(
      "Target range in A1 notation. Can be either a single cell (e.g., 'A1', 'B5') or a full range (e.g., 'A1:C10'). Data dimensions must match the range size."
    ),
  data: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .describe(
      "2D array of data to write. Each inner array represents a row, and all rows must have the same length. Example: [['Name', 'Age'], ['John', 30], ['Jane', 25]]"
    ),
};

export const createWorksheetSchema = {
  itemId: z
    .string()
    .describe("The ID of the Excel file to create a worksheet in."),
  driveId: z
    .string()
    .optional()
    .describe(
      "The ID of the drive containing the file. Takes priority over siteId if provided."
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "The ID of the SharePoint site containing the file. Used if driveId is not provided."
    ),
  worksheetName: z
    .string()
    .describe("Name for the new worksheet (e.g., 'Q4 Results')"),
};

export const clearRangeSchema = {
  itemId: z
    .string()
    .describe("The ID of the Excel file to clear the range in."),
  driveId: z
    .string()
    .optional()
    .describe(
      "The ID of the drive containing the file. Takes priority over siteId if provided."
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "The ID of the SharePoint site containing the file. Used if driveId is not provided."
    ),
  worksheetName: z.string().describe("Name of the worksheet (e.g., 'Sheet1')"),
  range: z
    .string()
    .describe("Cell range to clear in A1 notation (e.g., 'A1:D10')"),
  applyTo: z
    .enum(["All", "Contents", "Formats"])
    .default("Contents")
    .describe(
      "What to clear: 'All' (values and formatting), 'Contents' (values only), 'Formats' (formatting only)"
    ),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const MICROSOFT_EXCEL_TOOLS: MCPToolType[] = [
  {
    name: "list_excel_files",
    description: "List Excel files (.xlsx, .xlsm) from SharePoint or OneDrive.",
    inputSchema: zodToJsonSchema(z.object(listExcelFilesSchema)) as JSONSchema,
  },
  {
    name: "get_worksheets",
    description:
      "Get a list of all worksheets (sheets/tabs) in an Excel workbook stored in SharePoint.",
    inputSchema: zodToJsonSchema(z.object(getWorksheetsSchema)) as JSONSchema,
  },
  {
    name: "read_worksheet",
    description:
      "Read data from a specific range or entire worksheet in an Excel file stored in SharePoint.",
    inputSchema: zodToJsonSchema(z.object(readWorksheetSchema)) as JSONSchema,
  },
  {
    name: "write_worksheet",
    description:
      "Write data to a specific range in an Excel worksheet stored in SharePoint.",
    inputSchema: zodToJsonSchema(z.object(writeWorksheetSchema)) as JSONSchema,
  },
  {
    name: "create_worksheet",
    description:
      "Create a new worksheet (sheet/tab) in an Excel workbook stored in SharePoint.",
    inputSchema: zodToJsonSchema(z.object(createWorksheetSchema)) as JSONSchema,
  },
  {
    name: "clear_range",
    description:
      "Clear data from a specific range in an Excel worksheet stored in SharePoint.",
    inputSchema: zodToJsonSchema(z.object(clearRangeSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const MICROSOFT_EXCEL_SERVER_INFO = {
  name: "microsoft_excel" as const,
  version: "1.0.0",
  description: "Work with Excel files in SharePoint.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "User.Read Files.ReadWrite.All Sites.Read.All offline_access" as const,
  },
  icon: "MicrosoftExcelLogo" as const,
  documentationUrl: null,
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const MICROSOFT_EXCEL_TOOL_STAKES = {
  list_excel_files: "never_ask",
  get_worksheets: "never_ask",
  read_worksheet: "never_ask",
  write_worksheet: "high",
  create_worksheet: "low",
  clear_range: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
