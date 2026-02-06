import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const MICROSOFT_DRIVE_SERVER_NAME = "microsoft_drive" as const;

const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content

export const MICROSOFT_DRIVE_TOOLS_METADATA = createToolsRecord({
  search_in_files: {
    description:
      "Search in files in Microsoft OneDrive and SharePoint using Microsoft Copilot retrieval API.",
    schema: {
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
    },
    stake: "never_ask",
  },
  search_drive_items: {
    description:
      "Search OneDrive and SharePoint content using Microsoft Graph Search API to find relevant files and documents. This tool returns the results in relevance order.",
    schema: {
      query: z
        .string()
        .describe(
          "Search query to find relevant files and content in OneDrive and SharePoint."
        ),
    },
    stake: "never_ask",
  },
  update_word_document: {
    description:
      "Update an existing Word document on OneDrive/SharePoint by providing a new document.xml content. Uses driveId if provided, otherwise falls back to siteId.",
    schema: {
      itemId: z.string().describe("The ID of the Word document to update."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the source file. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the source file. Used if driveId is not provided."
        ),
      documentXml: z
        .string()
        .describe(
          "The updated document.xml content to replace in the Word document."
        ),
    },
    stake: "high",
  },
  get_file_content: {
    description:
      "Retrieve the content of files from SharePoint/OneDrive (Powerpoint, Word, Excel, etc.). Uses driveId if provided, otherwise falls back to siteId.",
    schema: {
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
        .default(MAX_CONTENT_SIZE)
        .describe(
          `Maximum number of characters to return. Defaults to ${MAX_CONTENT_SIZE}.`
        ),
      getAsXml: z
        .boolean()
        .optional()
        .describe(
          "If true, the content will be returned as XML (for .docx file only). Otherwise, it will be returned as text/html. Must be true if you want to edit the document."
        ),
    },
    stake: "never_ask",
  },
  upload_file: {
    description:
      "Upload a file from Dust conversation to SharePoint or OneDrive. Supports files up to 250MB using the simple upload API. Uses driveId if provided, otherwise falls back to siteId. Automatically creates folders if they don't exist.",
    schema: {
      fileId: z
        .string()
        .describe(
          "The Dust fileId from the conversation attachments to upload."
        ),
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
    },
    stake: "high",
  },
  copy_file: {
    description:
      "Copy a file or folder to a new location in OneDrive or SharePoint.",
    schema: {
      itemId: z.string().describe("ID of the file or folder to copy"),
      driveId: z
        .string()
        .optional()
        .describe(
          "ID of the drive containing the file (takes priority over siteId)"
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "ID of the SharePoint site containing the file (used if driveId not provided)"
        ),
      parentItemId: z
        .string()
        .optional()
        .describe(
          "ID of the destination folder for the copy (defaults to same folder if not specified)"
        ),
      name: z.string().describe("Name for the copied item"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Copying file",
      done: "Copy file",
    },
  },
});

export const MICROSOFT_DRIVE_SERVER = {
  serverInfo: {
    name: MICROSOFT_DRIVE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Search, read, and upload files in Microsoft OneDrive and SharePoint.",
    icon: "MicrosoftLogo",
    authorization: {
      provider: "microsoft",
      supported_use_cases: ["personal_actions"],
    },
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(MICROSOFT_DRIVE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(MICROSOFT_DRIVE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
