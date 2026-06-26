import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const MICROSOFT_DRIVE_SERVER_NAME = "microsoft_drive" as const;

const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content

export const MICROSOFT_DRIVE_TOOLS_METADATA = createToolsRecord({
  search_in_files: {
    description:
      "Search the content inside Microsoft OneDrive and SharePoint files using semantic retrieval. Answers questions from what documents contain by finding relevant passages and information within Word, Excel, PowerPoint, and other files, including external items indexed in Microsoft Graph.",
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
    displayLabels: {
      running: "Searching in OneDrive/SharePoint files",
      done: "Search in OneDrive/SharePoint files",
    },
  },
  search_drive_items: {
    description:
      "Find and locate a file or document by its name or title in Microsoft OneDrive and SharePoint, returned in relevance order. Use when you know the file name and want to look it up, such as a specific Word, Excel, or PowerPoint document.",
    schema: {
      query: z
        .string()
        .describe(
          "Search query matching the name or title of files in OneDrive and SharePoint."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching OneDrive/SharePoint items",
      done: "Search OneDrive/SharePoint items",
    },
  },
  list_drive_items: {
    description:
      "Browse and list items (folders and/or files) in a Microsoft OneDrive or SharePoint drive, SharePoint site, or under a specific parent folder. Use parentFolderId to drill into a specific folder; otherwise lists items at the root of the drive/site. Filter the result with itemType. Supports pagination via skipToken.",
    schema: {
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive to list items from. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site to list items from. Used if driveId is not provided."
        ),
      parentFolderId: z
        .string()
        .optional()
        .describe(
          "ID of the parent folder to list items from. If omitted, lists items at the root of the drive/site."
        ),
      itemType: z
        .enum(["all", "folder", "file"])
        .optional()
        .default("all")
        .describe(
          "Filter to apply to the listed items. 'all' returns both folders and files (default), 'folder' returns folders only, 'file' returns files only."
        ),
      top: z
        .number()
        .optional()
        .default(50)
        .describe(
          "Maximum number of items to fetch per page (default 50, capped at 200). When itemType is not 'all', items are filtered client-side, so fewer than `top` items may be returned per page."
        ),
      skipToken: z
        .string()
        .optional()
        .describe(
          "Pagination token returned as `nextSkipToken` from a previous call. Pass it back to retrieve the next page."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing OneDrive/SharePoint items",
      done: "List OneDrive/SharePoint items",
    },
  },
  update_word_document: {
    description:
      "Edit and update an existing Microsoft Word document on OneDrive or SharePoint by providing new document.xml content. Uses driveId if provided, otherwise falls back to siteId.",
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
    displayLabels: {
      running: "Updating Microsoft Word document",
      done: "Update Microsoft Word document",
    },
  },
  get_file_content: {
    description:
      "Read, open, and retrieve the content of a file from Microsoft OneDrive or SharePoint (PowerPoint, Word, Excel, PDF, etc.). Uses driveId if provided, otherwise falls back to siteId.",
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
    displayLabels: {
      running: "Getting OneDrive/SharePoint file content",
      done: "Get OneDrive/SharePoint file content",
    },
  },
  upload_file: {
    description:
      "Upload a file from the Dust conversation to Microsoft OneDrive or SharePoint. Supports files up to 250MB using the simple upload API. Uses driveId if provided, otherwise falls back to siteId. Automatically creates folders if they don't exist.",
    schema: {
      fileId: z
        .string()
        .describe(
          "The file reference from the conversation. Accepts a scoped file path (e.g. 'conversation/report.pdf') or a legacy file sId."
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
    displayLabels: {
      running: "Uploading file to OneDrive/SharePoint",
      done: "Upload file to OneDrive/SharePoint",
    },
  },
  rename_drive_item: {
    description:
      "Rename a file or folder in Microsoft OneDrive or SharePoint. Uses driveId if provided, otherwise falls back to siteId.",
    schema: {
      itemId: z.string().describe("The ID of the file or folder to rename."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the item. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the item. Used if driveId is not provided."
        ),
      name: z.string().describe("The new name for the file or folder."),
    },
    stake: "medium",
    displayLabels: {
      running: "Renaming OneDrive/SharePoint item",
      done: "Rename OneDrive/SharePoint item",
    },
  },
  copy_file: {
    description:
      "Copy, clone, or duplicate a file or folder to a new location in Microsoft OneDrive or SharePoint.",
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
      parentReference: z
        .object({
          id: z.string().describe("ID of the destination folder for the copy."),
          driveId: z
            .string()
            .describe("ID of the drive containing the destination folder"),
        })
        .optional()
        .describe(
          "Reference to the destination folder for the copy. If omitted, the item is copied into the same folder as the source."
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
      provider: "microsoft_tools",
      supported_use_cases: ["personal_actions"],
      scope:
        "User.Read Files.ReadWrite.All Sites.Read.All ExternalItem.Read.All SensitivityLabel.Read offline_access",
      availableScopes: [
        {
          value: "Files.Read.All",
          label: "Read files",
          description: "Read files in OneDrive and SharePoint.",
          impliedBy: "Files.ReadWrite.All",
          required: true,
        },
        {
          value: "Files.ReadWrite.All",
          label: "Write files",
          description:
            "Modify files in OneDrive and SharePoint. Required for uploading, updating, and copying files.",
          fallbackScope: "Files.Read.All",
        },
        {
          value: "Sites.Read.All",
          label: "Read SharePoint sites",
          description:
            "Access SharePoint sites for content search via the Copilot retrieval API.",
        },
        {
          value: "ExternalItem.Read.All",
          label: "Read external items",
          description: "Search external items indexed in Microsoft Graph.",
        },
        {
          value: "User.Read",
          label: "Read user profile",
          description: "Read basic profile information of the signed-in user.",
          required: true,
        },
        {
          value: "offline_access",
          label: "Offline access",
          description: "Maintain access without requiring re-authentication.",
          required: true,
        },
      ],
    },
    documentationUrl: "https://docs.dust.tt/docs/microsoft-drive-tool-setup",
  },
  tools: Object.values(MICROSOFT_DRIVE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(MICROSOFT_DRIVE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
