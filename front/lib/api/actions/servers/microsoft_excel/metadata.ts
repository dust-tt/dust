import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const MICROSOFT_EXCEL_SERVER_NAME = "microsoft_excel" as const;

export const MICROSOFT_EXCEL_TOOLS_METADATA = createToolsRecord({
  list_excel_files: {
    description: "List Excel files (.xlsx, .xlsm) from SharePoint or OneDrive.",
    schema: {
      query: z
        .string()
        .describe(
          "Search query to find relevant files and content in OneDrive and SharePoint."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Microsoft Excel files",
      done: "List Microsoft Excel files",
    },
  },
  get_worksheets: {
    description:
      "Get a list of all worksheets (sheets/tabs) in an Excel workbook stored in SharePoint.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Excel worksheets",
      done: "Get Excel worksheets",
    },
  },
  read_worksheet: {
    description:
      "Read data from a specific range or entire worksheet in an Excel file stored in SharePoint.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading Excel worksheet",
      done: "Read Excel worksheet",
    },
  },
  write_worksheet: {
    description:
      "Write data to a specific range in an Excel worksheet stored in SharePoint.",
    schema: {
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
        .array(
          z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
        )
        .describe(
          "2D array of data to write. Each inner array represents a row, and all rows must have the same length. Example: [['Name', 'Age'], ['John', 30], ['Jane', 25]]"
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Writing to Excel worksheet",
      done: "Write to Excel worksheet",
    },
  },
  create_worksheet: {
    description:
      "Create a new worksheet (sheet/tab) in an Excel workbook stored in SharePoint.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Creating Excel worksheet",
      done: "Create Excel worksheet",
    },
  },
  clear_range: {
    description:
      "Clear data from a specific range in an Excel worksheet stored in SharePoint.",
    schema: {
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
      worksheetName: z
        .string()
        .describe("Name of the worksheet (e.g., 'Sheet1')"),
      range: z
        .string()
        .describe("Cell range to clear in A1 notation (e.g., 'A1:D10')"),
      applyTo: z
        .enum(["All", "Contents", "Formats"])
        .default("Contents")
        .describe(
          "What to clear: 'All' (values and formatting), 'Contents' (values only), 'Formats' (formatting only)"
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Clearing Excel range",
      done: "Clear Excel range",
    },
  },
});

export const MICROSOFT_EXCEL_SERVER = {
  serverInfo: {
    name: MICROSOFT_EXCEL_SERVER_NAME,
    version: "1.0.0",
    description:
      "Read and write Excel spreadsheets in Microsoft OneDrive and SharePoint.",
    icon: "MicrosoftExcelLogo",
    authorization: {
      provider: "microsoft",
      supported_use_cases: ["personal_actions"],
    },
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(MICROSOFT_EXCEL_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(MICROSOFT_EXCEL_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
