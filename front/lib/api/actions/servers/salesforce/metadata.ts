import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { SALESFORCE_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const SALESFORCE_TOOL_NAME = "salesforce" as const;

export const SALESFORCE_TOOLS_METADATA = createToolsRecord({
  execute_read_query: {
    description: "Execute a read query on Salesforce",
    schema: {
      query: z.string().describe("The SOQL read query to execute"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Executing Salesforce query",
      done: "Execute Salesforce query",
    },
  },
  list_objects: {
    description: "List the objects in Salesforce: standard and custom objects",
    schema: {
      filter: z
        .enum(["all", "standard", "custom"])
        .optional()
        .default("all")
        .describe("Filter objects by type: all, standard, or custom"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Salesforce objects",
      done: "List Salesforce objects",
    },
  },
  describe_object: {
    description: "Describe an object in Salesforce",
    schema: {
      objectName: z.string().describe("The name of the object to describe"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing Salesforce object",
      done: "Describe Salesforce object",
    },
  },
  update_object: {
    description: "Update one or more records in Salesforce",
    schema: {
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
    },
    stake: "high",
    displayLabels: {
      running: "Updating Salesforce records",
      done: "Update Salesforce records",
    },
  },
  list_attachments: {
    description: "List all attachments and files for a Salesforce record.",
    schema: {
      recordId: z.string().describe("The Salesforce record ID"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing attachments on Salesforce",
      done: "List attachments on Salesforce",
    },
  },
  read_attachment: {
    description:
      "Read content from any attachment or file on a Salesforce record.",
    schema: {
      recordId: z.string().describe("The Salesforce record ID"),
      attachmentId: z
        .string()
        .describe("The ID of the attachment or file to read"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading attachment from Salesforce",
      done: "Read attachment from Salesforce",
    },
  },
});

export const SALESFORCE_SERVER = {
  serverInfo: {
    name: "salesforce",
    version: "1.0.0",
    description: "Salesforce tools.",
    authorization: {
      provider: "salesforce" as const,
      supported_use_cases: ["personal_actions", "platform_actions"] as const,
    },
    icon: "SalesforceLogo",
    documentationUrl: "https://docs.dust.tt/docs/salesforce",
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions: SALESFORCE_SERVER_INSTRUCTIONS,
  },
  tools: Object.values(SALESFORCE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SALESFORCE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
