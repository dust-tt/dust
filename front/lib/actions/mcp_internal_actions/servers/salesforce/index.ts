import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  downloadSalesforceContent,
  extractTextFromSalesforceAttachment,
  getAllSalesforceAttachments,
} from "@app/lib/actions/mcp_internal_actions/servers/salesforce/salesforce_api_helper";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { processAttachment } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const SF_API_VERSION = "57.0";

// We use a single tool name for monitoring given the high granularity (can be revisited).
const SALESFORCE_TOOL_LOG_NAME = "salesforce";

interface SalesforceRecord {
  Id: string;
  [key: string]: any;
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("salesforce");

  server.tool(
    "execute_read_query",
    "Execute a read query on Salesforce",
    {
      query: z.string().describe("The SOQL read query to execute"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ query }, { authInfo }) => {
        const accessToken = authInfo?.token;
        const instanceUrl = authInfo?.extra?.instance_url as string | undefined;

        const conn = new jsforce.Connection({
          instanceUrl,
          accessToken,
          version: SF_API_VERSION,
        });
        await conn.identity();

        const result = await conn.query(query);

        return new Ok([
          { type: "text" as const, text: "Operation completed successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "list_objects",
    "List the objects in Salesforce: standard and custom objects",
    {
      filter: z
        .enum(["all", "standard", "custom"])
        .optional()
        .default("all")
        .describe("Filter objects by type: all, standard, or custom"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ filter }, { authInfo }) => {
        const accessToken = authInfo?.token;
        const instanceUrl = authInfo?.extra?.instance_url as string | undefined;

        const conn = new jsforce.Connection({
          instanceUrl,
          accessToken,
          version: SF_API_VERSION,
        });
        await conn.identity();

        const result = await conn.describeGlobal();

        const objects = result.sobjects
          .filter((object) => {
            if (filter === "all") {
              return true;
            }
            return object.custom === (filter === "custom");
          })
          .map((object) => `${object.name} (display_name="${object.label}")`)
          .join("\n");

        return new Ok([
          { type: "text", text: "Operation completed successfully" },
          { type: "text", text: objects },
        ]);
      }
    )
  );

  server.tool(
    "describe_object",
    "Describe an object in Salesforce",
    {
      objectName: z.string().describe("The name of the object to describe"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ objectName }, { authInfo }) => {
        const accessToken = authInfo?.token;
        const instanceUrl = authInfo?.extra?.instance_url as string | undefined;

        const conn = new jsforce.Connection({
          instanceUrl,
          accessToken,
          version: SF_API_VERSION,
        });
        await conn.identity();

        const result = await conn.describe(objectName);

        let summary = `Object: ${result.name}\n`;
        summary += `Label: ${result.label}\n`;
        summary += `Plural Label: ${result.labelPlural}\n`;
        if (result.keyPrefix) {
          summary += `Key Prefix: ${result.keyPrefix}\n`;
        }
        summary += `Queryable: ${result.queryable}\n`;
        summary += `Createable: ${result.createable}\n`;
        summary += `Updateable: ${result.updateable}\n`;
        summary += `Deletable: ${result.deletable}\n`;
        summary += `Feed Enabled: ${result.feedEnabled}\n\n`;

        summary += "Fields:\n";
        const standardFields = result.fields.filter((f: any) => !f.custom);
        const customFields = result.fields.filter((f: any) => f.custom);

        const formatField = (field: any) => {
          let fieldStr = `- ${field.name} (Label: "${field.label}", Type: ${field.type}`;
          if (
            field.type === "reference" &&
            field.referenceTo &&
            field.referenceTo.length > 0
          ) {
            fieldStr += ` -> References: ${field.referenceTo.join(", ")}`;
            if (field.relationshipName) {
              fieldStr += ` (Use '${field.relationshipName}' for parent fields)`;
            }
          }
          if (
            field.type === "picklist" &&
            field.picklistValues &&
            field.picklistValues.length > 0
          ) {
            const activePicklistValues = field.picklistValues.filter(
              (pv: any) => pv.active
            );
            const values = activePicklistValues
              .map((pv: any) => pv.value)
              .slice(0, 5);
            if (values.length > 0) {
              fieldStr += ` (Values: ${values.join(", ")}${activePicklistValues.length > 5 ? ", ..." : ""})`;
            }
          }
          fieldStr += `, Nillable: ${field.nillable}, Createable: ${field.createable}, Updateable: ${field.updateable})`;
          return fieldStr;
        };

        if (standardFields.length > 0) {
          summary += "\nStandard Fields:\n";
          standardFields.forEach((field: any) => {
            summary += `${formatField(field)}\n`;
          });
        }

        if (customFields.length > 0) {
          summary += "\nCustom Fields (names end with '__c'):\n";
          customFields.forEach((field: any) => {
            summary += `${formatField(field)}\n`;
          });
        }

        summary +=
          "\nChild Relationships (for Parent-to-Child SOQL queries):\n";
        if (result.childRelationships && result.childRelationships.length > 0) {
          result.childRelationships.forEach((rel: any) => {
            summary += `- RelationshipName: ${rel.relationshipName || "(N/A - check API docs)"}`;
            summary += `, ChildObject: ${rel.childSObject}`;
            summary += `, Field on Child: ${rel.field}\n`;
          });
        } else {
          summary += "No child relationships found.\n";
        }

        summary +=
          "\nNote: For custom relationships in SOQL, names often end with '__r' (e.g., MyCustomChildren__r). Use the 'RelationshipName' listed above.\n";

        return new Ok([
          {
            type: "text",
            text: "Object described successfully. Summary provided.",
          },
          { type: "text", text: summary },
        ]);
      }
    )
  );

  server.tool(
    "update_object",
    "Update one or more records in Salesforce",
    {
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_LOG_NAME,
        skipAlerting: true,
      },
      async ({ objectName, records, allOrNone }, { authInfo }) => {
        const accessToken = authInfo?.token;
        const instanceUrl = authInfo?.extra?.instance_url as string | undefined;

        const conn = new jsforce.Connection({
          instanceUrl,
          accessToken,
          version: SF_API_VERSION,
        });
        await conn.identity();

        const result = await conn
          .sobject(objectName)
          .update(records as SalesforceRecord[], {
            allOrNone,
          });

        const results = Array.isArray(result) ? result : [result];
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.length - successCount;

        return new Ok([
          {
            type: "text" as const,
            text: `Update completed: ${successCount} successful, ${failureCount} failed`,
          },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "list_attachments",
    "List all attachments and files for a Salesforce record.",
    {
      recordId: z.string().describe("The Salesforce record ID"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ recordId }, { authInfo }) => {
        const accessToken = authInfo?.token;
        const instanceUrl = authInfo?.extra?.instance_url as string | undefined;

        const conn = new jsforce.Connection({
          instanceUrl,
          accessToken,
          version: SF_API_VERSION,
        });
        await conn.identity();

        const attachmentsResult = await getAllSalesforceAttachments(
          conn,
          recordId
        );

        if (attachmentsResult.isErr()) {
          return new Err(new MCPError(attachmentsResult.error));
        }

        const attachments = attachmentsResult.value;
        const attachmentSummary = attachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          created: att.created,
          author: att.author,
        }));

        return new Ok([
          {
            type: "text" as const,
            text: `Found ${attachments.length} attachment(s) for record ${recordId}`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                attachments: attachmentSummary,
              },
              null,
              2
            ),
          },
        ]);
      }
    )
  );

  server.tool(
    "read_attachment",
    "Read content from any attachment or file on a Salesforce record.",
    {
      recordId: z.string().describe("The Salesforce record ID"),
      attachmentId: z
        .string()
        .describe("The ID of the attachment or file to read"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ recordId, attachmentId }, { authInfo }) => {
        const accessToken = authInfo?.token;
        const instanceUrl = authInfo?.extra?.instance_url as string | undefined;

        const conn = new jsforce.Connection({
          instanceUrl,
          accessToken,
          version: SF_API_VERSION,
        });
        await conn.identity();

        const attachmentsResult = await getAllSalesforceAttachments(
          conn,
          recordId
        );

        if (attachmentsResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to get attachments: ${attachmentsResult.error}`
            )
          );
        }

        const attachments = attachmentsResult.value;
        const targetAttachment = attachments.find(
          (att) => att.id === attachmentId
        );

        if (!targetAttachment) {
          return new Err(
            new MCPError(
              `Attachment with ID ${attachmentId} not found on record ${recordId}.`
            )
          );
        }

        return processAttachment({
          mimeType: targetAttachment.mimeType,
          filename: targetAttachment.filename || `attachment-${attachmentId}`,
          extractText: async () =>
            extractTextFromSalesforceAttachment(
              conn,
              attachmentId,
              targetAttachment.mimeType
            ),
          downloadContent: async () =>
            downloadSalesforceContent(conn, attachmentId),
        });
      }
    )
  );

  return server;
}

export default createServer;
