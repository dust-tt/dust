import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  describeObjectSchema,
  executeReadQuerySchema,
  listAttachmentsSchema,
  listObjectsSchema,
  readAttachmentSchema,
  SALESFORCE_TOOL_NAME,
  updateObjectSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/salesforce/metadata";
import {
  downloadSalesforceContent,
  extractTextFromSalesforceAttachment,
  getAllSalesforceAttachments,
} from "@app/lib/actions/mcp_internal_actions/servers/salesforce/salesforce_api_helper";
import {
  jsonToMarkdown,
  makeInternalMCPServer,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { processAttachment } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const SF_API_VERSION = "57.0";

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
    executeReadQuerySchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_NAME,
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

        const formattedRecords = jsonToMarkdown(result.records);

        const summaryParts = [
          `Query returned ${result.totalSize ?? result.records.length} record(s).`,
        ];

        if (!result.done) {
          summaryParts.push(
            "More records are available. Refine the query or paginate to retrieve remaining records."
          );
        }

        const summary = summaryParts.join(" ");

        return new Ok([
          { type: "text" as const, text: summary },
          {
            type: "text" as const,
            text: formattedRecords,
          },
        ]);
      }
    )
  );

  server.tool(
    "list_objects",
    "List the objects in Salesforce: standard and custom objects",
    listObjectsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_NAME,
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
    describeObjectSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_NAME,
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    updateObjectSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: false,
      },
      async ({ objectName, records, allOrNone }, { authInfo }) => {
        const owner = auth.getNonNullableWorkspace();
        const featureFlags = await getFeatureFlags(owner);

        if (!featureFlags.includes("salesforce_tool_write")) {
          return new Err(
            new MCPError(
              "Salesforce write operations are not enabled for this workspace."
            )
          );
        }

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
    listAttachmentsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_NAME,
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
    readAttachmentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SALESFORCE_TOOL_NAME,
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
