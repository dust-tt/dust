import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const VAL_TOWN_TOOL_NAME = "val_town" as const;

export const VAL_TOWN_TOOLS_METADATA = createToolsRecord({
  create_val: {
    description:
      "Creates a new val in Val Town. Use create_file to add files to the val.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Creating val",
      done: "Create val",
    },
  },
  get_val: {
    description: "Gets a specific val by its ID",
    schema: {
      valId: z.string().describe("The ID of the val to retrieve"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving val",
      done: "Retrieve val",
    },
  },
  list_vals: {
    description: "Lists vals available to the user's account",
    schema: {
      limit: z
        .number()
        .int()
        .positive()
        .describe("Maximum number of vals to return"),
      cursor: z
        .string()
        .optional()
        .describe("Cursor to start the pagination from"),
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing vals",
      done: "List vals",
    },
  },
  search_vals: {
    description: "Searches for vals by name, description, or content",
    schema: {
      query: z.string().describe("Search query to find vals"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(20)
        .describe("Maximum number of vals to return"),
      cursor: z
        .string()
        .optional()
        .describe("Cursor to start the pagination from"),
      privacy: z
        .enum(["public", "private", "unlisted"])
        .optional()
        .describe("Filter vals by privacy level"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching vals",
      done: "Search vals",
    },
  },
  list_val_files: {
    description: "Lists all files in a specific val",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing val files",
      done: "List val files",
    },
  },
  get_file_content: {
    description:
      "Gets the content of a specific file in a val using the Val Town API",
    schema: {
      valId: z.string().describe("The ID of the val containing the file"),
      filePath: z
        .string()
        .describe("The path of the file to retrieve (e.g., 'main.ts')"),
    },
    stake: "low",
    displayLabels: {
      running: "Retrieving file content",
      done: "Retrieve file content",
    },
  },
  delete_file: {
    description: "Deletes a specific file from a val using the Val Town API",
    schema: {
      valId: z.string().describe("The ID of the val containing the file"),
      filePath: z
        .string()
        .describe("The path of the file to delete (e.g., 'main.ts')"),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting file",
      done: "Delete file",
    },
  },
  update_file_content: {
    description:
      "Updates the content of a specific file in a val. Note: To change file type (e.g., to HTTP), use the file_update tool instead.",
    schema: {
      valId: z.string().describe("The ID of the val containing the file"),
      filePath: z
        .string()
        .describe("The path of the file to update (e.g., 'main.ts')"),
      content: z
        .string()
        .max(80000)
        .describe("The new content for the file (max 80,000 characters)"),
    },
    stake: "low",
    displayLabels: {
      running: "Updating file content",
      done: "Update file content",
    },
  },
  write_file: {
    description:
      "The primary function for writing content to files and updating file metadata. Use this to add content, change file type, rename files, or move files. For HTTP type: return value from serve handler must be a response or a promise resolving to a response.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Writing file",
      done: "Write file",
    },
  },
  create_file: {
    description:
      "Creates a new empty file in an existing val. Use write_file to add content and set the file type.",
    schema: {
      valId: z.string().describe("The ID of the val to create the file in"),
      filePath: z
        .string()
        .describe("The path of the file to create (e.g., 'main.ts')"),
    },
    stake: "low",
    displayLabels: {
      running: "Creating file",
      done: "Create file",
    },
  },
  call_http_endpoint: {
    description:
      "Runs an HTTP val endpoint by getting the file's endpoint link and making a request to it",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Calling HTTP endpoint",
      done: "Call HTTP endpoint",
    },
  },
});

export const VAL_TOWN_SERVER = {
  serverInfo: {
    name: "val_town",
    version: "1.0.0",
    description: "Create and execute vals in Val Town.",
    authorization: null,
    icon: "ValTownLogo",
    documentationUrl: "https://docs.dust.tt/docs/val-town",
    instructions: null,
    developerSecretSelection: "required",
  },
  tools: Object.values(VAL_TOWN_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(VAL_TOWN_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
