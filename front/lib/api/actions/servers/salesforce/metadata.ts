import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SALESFORCE_TOOLS_METADATA = createToolsRecord({
  execute_read_query: {
    description:
      "Run a read-only SOQL query on Salesforce to retrieve or discover data. It never writes. " +
      "The usual flow is list_objects to find an object name, then describe_object to learn exact fields and relationships, then this tool. " +
      "Custom objects and fields end in `__c`; custom relationships used in parent-to-child subqueries end in `__r`. " +
      "Use child-to-parent dot notation (e.g. SELECT Account.Name, LastName FROM Contact) and parent-to-child subqueries (e.g. SELECT Name, (SELECT FirstName, LastName FROM Contacts) FROM Account or SELECT Name, (SELECT Name FROM MyCustomChildren__r) FROM Account). " +
      "To list fields inline instead of calling describe_object, use FIELDS(ALL) for all fields, FIELDS(CUSTOM) for custom fields, or FIELDS(STANDARD) for standard fields. FIELDS() requires a LIMIT clause, with a maximum of 200. " +
      'A "No such column" or "Didn\'t understand relationship" error usually means the name is wrong, so confirm it with describe_object. If errors persist, the field, object, or relationship might not exist or the connected user may lack permissions.',
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
    description:
      "List Salesforce objects (standard, custom, or all). Use it to find an object's exact API name before describing or querying it when you are unsure.",
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
    description:
      "Get detailed metadata for a Salesforce object from its API name (e.g. Account, Lead, MyCustomObject__c): fields with names, labels, types, and other properties; child relationship names for SOQL subqueries; record types; and other object-level properties. " +
      "This is the most reliable way to discover and confirm field and relationship names before an execute_read_query.",
    schema: {
      objectName: z.string().describe("The name of the object to describe"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing Salesforce object",
      done: "Describe Salesforce object",
    },
  },
  create_object: {
    description:
      "Create one or more records in Salesforce. Use describe_object first if the required fields or exact field API names are uncertain.",
    schema: {
      objectName: z
        .string()
        .describe("The name of the Salesforce object (e.g., Account, Contact)"),
      records: z
        .array(z.object({}).passthrough())
        .min(1)
        .describe(
          "Record(s) to create. Must include all required fields for the object"
        ),
      allOrNone: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, all creates must succeed or all fail"),
    },
    stake: "medium",
    displayLabels: {
      running: "Creating Salesforce records",
      done: "Create Salesforce records",
    },
  },
  update_object: {
    description:
      "Update one or more records in Salesforce. Use describe_object first if the exact field API names are uncertain; every record must include its Salesforce Id.",
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
    stake: "medium",
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
    instructions: null,
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
