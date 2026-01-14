// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { SALESFORCE_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// =============================================================================
// Exports for monitoring
// =============================================================================

export const SALESFORCE_TOOL_NAME = "salesforce" as const;

// =============================================================================
// Tool Schemas - Input schemas for each tool
// =============================================================================

export const executeReadQuerySchema = {
  query: z.string().describe("The SOQL read query to execute"),
};

export const listObjectsSchema = {
  filter: z
    .enum(["all", "standard", "custom"])
    .optional()
    .default("all")
    .describe("Filter objects by type: all, standard, or custom"),
};

export const describeObjectSchema = {
  objectName: z.string().describe("The name of the object to describe"),
};

export const updateObjectSchema = {
  objectName: z
    .string()
    .describe("The name of the Salesforce object (e.g., Account, Contact)"),
  records: z
    .array(
      z
        .object({
          Id: z.string().min(1).describe("The Salesforce record ID"),
        })
        .passthrough()
    )
    .min(1)
    .describe(
      "Record(s) to update. Must include Id field and any fields to update"
    ),
  allOrNone: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, all updates must succeed or all fail"),
};

export const listAttachmentsSchema = {
  recordId: z.string().describe("The Salesforce record ID"),
};

export const readAttachmentSchema = {
  recordId: z.string().describe("The Salesforce record ID"),
  attachmentId: z.string().describe("The ID of the attachment or file to read"),
};

// =============================================================================
// Tool Definitions - Static tool metadata for constants registry
// =============================================================================

export const SALESFORCE_TOOLS: MCPToolType[] = [
  {
    name: "execute_read_query",
    description: "Execute a read query on Salesforce",
    inputSchema: zodToJsonSchema(
      z.object(executeReadQuerySchema)
    ) as JSONSchema7,
  },
  {
    name: "list_objects",
    description: "List the objects in Salesforce: standard and custom objects",
    inputSchema: zodToJsonSchema(z.object(listObjectsSchema)) as JSONSchema7,
  },
  {
    name: "describe_object",
    description: "Describe an object in Salesforce",
    inputSchema: zodToJsonSchema(z.object(describeObjectSchema)) as JSONSchema7,
  },
  {
    name: "update_object",
    description: "Update one or more records in Salesforce",
    inputSchema: zodToJsonSchema(z.object(updateObjectSchema)) as JSONSchema7,
  },
  {
    name: "list_attachments",
    description: "List all attachments and files for a Salesforce record.",
    inputSchema: zodToJsonSchema(
      z.object(listAttachmentsSchema)
    ) as JSONSchema7,
  },
  {
    name: "read_attachment",
    description:
      "Read content from any attachment or file on a Salesforce record.",
    inputSchema: zodToJsonSchema(z.object(readAttachmentSchema)) as JSONSchema7,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SALESFORCE_SERVER_INFO = {
  name: "salesforce" as const,
  version: "1.0.0",
  description: "Salesforce tools.",
  authorization: {
    provider: "salesforce" as const,
    supported_use_cases: [
      "personal_actions",
      "platform_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "SalesforceLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/salesforce",
  instructions: SALESFORCE_SERVER_INSTRUCTIONS,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const SALESFORCE_TOOL_STAKES = {
  execute_read_query: "never_ask",
  list_objects: "never_ask",
  describe_object: "never_ask",
  list_attachments: "never_ask",
  read_attachment: "never_ask",
  update_object: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
