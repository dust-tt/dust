import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const MICROSOFT_DRIVE_TOOL_NAME = "microsoft_drive" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const searchInFilesSchema = {
  query: z
    .string()
    .describe("Search query to find relevant files and content."),
  dataSource: z
    .enum(["oneDriveBusiness", "Sharepoint", "externalItem"])
    .describe(
      "Specific data source to search in (must be among 'oneDriveBusiness', 'Sharepoint', 'externalItem')."
    ),
  maximumResults: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results to return (max 25)."),
};

export const searchDriveItemsSchema = {
  query: z
    .string()
    .describe(
      "Search query to find relevant files and content in OneDrive and SharePoint."
    ),
};

export const updateWordDocumentSchema = {
  itemId: z.string().describe("The ID of the Word document to update."),
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
  documentXml: z
    .string()
    .describe(
      "The updated document.xml content to replace in the Word document."
    ),
};

export const getFileContentSchema = {
  itemId: z
    .string()
    .describe("The ID of the file item to retrieve content from."),
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
  offset: z
    .number()
    .default(0)
    .describe(
      "Character offset to start reading from (for pagination). Defaults to 0."
    ),
  limit: z
    .number()
    .default(32000)
    .describe("Maximum number of characters to return. Defaults to 32000."),
  getAsXml: z
    .boolean()
    .optional()
    .describe(
      "If true, the content will be returned as XML (for .docx file only). Otherwise, it will be returned as text/html. Must be true if you want to edit the document."
    ),
};

export const uploadFileSchema = {
  fileId: z
    .string()
    .describe("The Dust fileId from the conversation attachments to upload."),
  driveId: z
    .string()
    .optional()
    .describe(
      "The ID of the drive to upload to. Takes priority over siteId if provided."
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "The ID of the SharePoint site to upload to. Used if driveId is not provided."
    ),
  folderPath: z
    .string()
    .optional()
    .describe(
      "Optional path to folder where the file should be uploaded (e.g., 'Documents/Projects'). Folders will be created automatically if they don't exist. If not provided, uploads to the root of the drive."
    ),
  fileName: z
    .string()
    .optional()
    .describe(
      "Optional custom filename for the uploaded file. If not provided, uses the original filename from the attachment."
    ),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const MICROSOFT_DRIVE_TOOLS: MCPToolType[] = [
  {
    name: "search_in_files",
    description:
      "Search in files in Microsoft OneDrive and SharePoint using Microsoft Copilot retrieval API.",
    inputSchema: zodToJsonSchema(z.object(searchInFilesSchema)) as JSONSchema,
  },
  {
    name: "search_drive_items",
    description:
      "Search OneDrive and SharePoint content using Microsoft Graph Search API to find relevant files and documents. This tool returns the results in relevance order.",
    inputSchema: zodToJsonSchema(
      z.object(searchDriveItemsSchema)
    ) as JSONSchema,
  },
  {
    name: "update_word_document",
    description:
      "Update an existing Word document on OneDrive/SharePoint by providing a new document.xml content. Uses driveId if provided, otherwise falls back to siteId.",
    inputSchema: zodToJsonSchema(
      z.object(updateWordDocumentSchema)
    ) as JSONSchema,
  },
  {
    name: "get_file_content",
    description:
      "Retrieve the content of files from SharePoint/OneDrive (Powerpoint, Word, Excel, etc.). Uses driveId if provided, otherwise falls back to siteId.",
    inputSchema: zodToJsonSchema(z.object(getFileContentSchema)) as JSONSchema,
  },
  {
    name: "upload_file",
    description:
      "Upload a file from Dust conversation to SharePoint or OneDrive. Supports files up to 250MB using the simple upload API. Uses driveId if provided, otherwise falls back to siteId. Automatically creates folders if they don't exist.",
    inputSchema: zodToJsonSchema(z.object(uploadFileSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const MICROSOFT_DRIVE_SERVER_INFO = {
  name: "microsoft_drive" as const,
  version: "1.0.0",
  description: "Tools for managing Microsoft files.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "User.Read Files.ReadWrite.All Sites.Read.All ExternalItem.Read.All offline_access" as const,
  },
  icon: "MicrosoftLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/microsoft-drive-tool-setup",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const MICROSOFT_DRIVE_TOOL_STAKES = {
  search_in_files: "never_ask",
  search_drive_items: "never_ask",
  update_word_document: "high",
  get_file_content: "never_ask",
  upload_file: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
