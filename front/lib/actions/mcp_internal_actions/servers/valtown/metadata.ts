import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const VALTOWN_TOOL_NAME = "val_town" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const createValSchema = {
  name: z
    .string()
    .min(1)
    .max(48)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9\-_]*$/,
      "Name must start with a letter and contain only letters, numbers, hyphens, and underscores"
    )
    .describe("The name of the val to create."),
  privacy: z
    .enum(["public", "private", "unlisted"])
    .describe(
      "This resource's privacy setting. Unlisted resources do not appear on profile pages or elsewhere, but you can link to them."
    ),
  description: z
    .string()
    .max(64)
    .optional()
    .describe("Optional description of what the val does."),
  orgId: z
    .string()
    .uuid()
    .optional()
    .describe("ID of the org to create the val in."),
};

export const getValSchema = {
  valId: z.string().describe("The ID of the val to retrieve"),
};

export const listValsSchema = {
  limit: z
    .number()
    .int()
    .positive()
    .describe("Maximum number of vals to return"),
  cursor: z.string().optional().describe("Cursor to start the pagination from"),
  privacy: z
    .enum(["public", "private", "unlisted"])
    .optional()
    .describe("Filter vals by privacy level"),
  user_id: z.string().optional().describe("User ID to filter by"),
  list_only_user_vals: z
    .boolean()
    .optional()
    .default(true)
    .describe("List only the authenticated user's vals (default: true)"),
};

export const searchValsSchema = {
  query: z.string().describe("Search query to find vals"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(20)
    .describe("Maximum number of vals to return"),
  cursor: z.string().optional().describe("Cursor to start the pagination from"),
  privacy: z
    .enum(["public", "private", "unlisted"])
    .optional()
    .describe("Filter vals by privacy level"),
};

export const listValFilesSchema = {
  valId: z.string().describe("The ID of the val to list files for"),
  path: z
    .string()
    .optional()
    .describe(
      "The path to list files from (default: root directory, use empty string for root)"
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of files to return"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of files to skip"),
};

export const getFileContentSchema = {
  valId: z.string().describe("The ID of the val containing the file"),
  filePath: z
    .string()
    .describe("The path of the file to retrieve (e.g., 'main.ts')"),
};

export const deleteFileSchema = {
  valId: z.string().describe("The ID of the val containing the file"),
  filePath: z
    .string()
    .describe("The path of the file to delete (e.g., 'main.ts')"),
};

export const updateFileContentSchema = {
  valId: z.string().describe("The ID of the val containing the file"),
  filePath: z
    .string()
    .describe("The path of the file to update (e.g., 'main.ts')"),
  content: z
    .string()
    .max(80000)
    .describe("The new content for the file (max 80,000 characters)"),
};

export const writeFileSchema = {
  valId: z.string().describe("The ID of the val containing the file"),
  filePath: z
    .string()
    .describe("The path of the file to update (e.g., 'main.ts')"),
  content: z
    .string()
    .max(80000)
    .optional()
    .describe("The new content for the file (max 80,000 characters)"),
  name: z.string().optional().describe("The new name for the file"),
  type: z
    .enum(["script", "http", "email", "file", "interval"])
    .optional()
    .describe("The new type for the file"),
  parent_path: z
    .string()
    .optional()
    .describe("Path to the directory you'd like to move this file to"),
};

export const createFileSchema = {
  valId: z.string().describe("The ID of the val to create the file in"),
  filePath: z
    .string()
    .describe("The path of the file to create (e.g., 'main.ts')"),
};

export const callHttpEndpointSchema = {
  valId: z.string().describe("The ID of the val containing the file"),
  filePath: z
    .string()
    .describe("The path of the file to run (e.g., 'main.ts')"),
  body: z
    .string()
    .optional()
    .describe(
      'Optional JSON string to send as the request body. Example: \'{"key": "value"}\''
    ),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
    .optional()
    .default("POST")
    .describe("HTTP method to use"),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const VALTOWN_TOOLS: MCPToolType[] = [
  {
    name: "create_val",
    description:
      "Creates a new val in Val Town. Use create_file to add files to the val.",
    inputSchema: zodToJsonSchema(z.object(createValSchema)) as JSONSchema,
  },
  {
    name: "get_val",
    description: "Gets a specific val by its ID",
    inputSchema: zodToJsonSchema(z.object(getValSchema)) as JSONSchema,
  },
  {
    name: "list_vals",
    description: "Lists vals available to the user's account",
    inputSchema: zodToJsonSchema(z.object(listValsSchema)) as JSONSchema,
  },
  {
    name: "search_vals",
    description: "Searches for vals by name, description, or content",
    inputSchema: zodToJsonSchema(z.object(searchValsSchema)) as JSONSchema,
  },
  {
    name: "list_val_files",
    description: "Lists all files in a specific val",
    inputSchema: zodToJsonSchema(z.object(listValFilesSchema)) as JSONSchema,
  },
  {
    name: "get_file_content",
    description:
      "Gets the content of a specific file in a val using the Val Town API",
    inputSchema: zodToJsonSchema(z.object(getFileContentSchema)) as JSONSchema,
  },
  {
    name: "delete_file",
    description: "Deletes a specific file from a val using the Val Town API",
    inputSchema: zodToJsonSchema(z.object(deleteFileSchema)) as JSONSchema,
  },
  {
    name: "update_file_content",
    description:
      "Updates the content of a specific file in a val. Note: To change file type (e.g., to HTTP), use the file_update tool instead.",
    inputSchema: zodToJsonSchema(
      z.object(updateFileContentSchema)
    ) as JSONSchema,
  },
  {
    name: "write_file",
    description:
      "The primary function for writing content to files and updating file metadata. Use this to add content, change file type, rename files, or move files. For HTTP type: return value from serve handler must be a response or a promise resolving to a response.",
    inputSchema: zodToJsonSchema(z.object(writeFileSchema)) as JSONSchema,
  },
  {
    name: "create_file",
    description:
      "Creates a new empty file in an existing val. Use write_file to add content and set the file type.",
    inputSchema: zodToJsonSchema(z.object(createFileSchema)) as JSONSchema,
  },
  {
    name: "call_http_endpoint",
    description:
      "Runs an HTTP val endpoint by getting the file's endpoint link and making a request to it",
    inputSchema: zodToJsonSchema(
      z.object(callHttpEndpointSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const VALTOWN_SERVER_INFO = {
  name: "val_town" as const,
  version: "1.0.0",
  description: "Create and execute vals in Val Town.",
  authorization: null,
  icon: "ValTownLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/val-town",
  instructions: null,
  developerSecretSelection: "required" as const,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const VALTOWN_TOOL_STAKES = {
  create_val: "low",
  get_file_content: "low",
  delete_file: "low",
  update_file_content: "low",
  write_file: "low",
  create_file: "low",
  call_http_endpoint: "low",
  get_val: "never_ask",
  list_vals: "never_ask",
  search_vals: "never_ask",
  list_val_files: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
