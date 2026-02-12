import type { DescribeSObjectResult } from "jsforce";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { jsonToMarkdown } from "@app/lib/actions/mcp_internal_actions/utils";
import { processAttachment } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import {
  downloadSalesforceContent,
  extractTextFromSalesforceAttachment,
  getAllSalesforceAttachments,
} from "@app/lib/api/actions/servers/salesforce/api_helper";
import {
  logAndReturnError,
  withAuth,
} from "@app/lib/api/actions/servers/salesforce/helpers";
import { SALESFORCE_TOOLS_METADATA } from "@app/lib/api/actions/servers/salesforce/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

// This interface is needed because SF does not export the type we need
interface DescribeFieldResult {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  referenceTo?: string[] | null;
  relationshipName?: string | null;
  picklistValues?: Array<{ active: boolean; value: string }> | null;
}

export function createSalesforceTools(auth: Authenticator): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SALESFORCE_TOOLS_METADATA> = {
    execute_read_query: async ({ query }, extra) => {
      return withAuth(extra, async (conn) => {
        try {
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
            { type: "text" as const, text: formattedRecords },
          ]);
        } catch (error) {
          return logAndReturnError({
            error,
            params: { query },
            message: "Error executing Salesforce query",
          });
        }
      });
    },

    list_objects: async ({ filter }, extra) => {
      return withAuth(extra, async (conn) => {
        try {
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
        } catch (error) {
          return logAndReturnError({
            error,
            params: { filter },
            message: "Error listing Salesforce objects",
          });
        }
      });
    },

    describe_object: async ({ objectName }, extra) => {
      return withAuth(extra, async (conn) => {
        try {
          const result: DescribeSObjectResult = await conn.describe(objectName);

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
          const standardFields = result.fields.filter((f) => !f.custom);
          const customFields = result.fields.filter((f) => f.custom);

          const formatField = (field: DescribeFieldResult) => {
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
                (pv) => pv.active
              );
              const values = activePicklistValues
                .map((pv) => pv.value)
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
            standardFields.forEach((field) => {
              summary += `${formatField(field)}\n`;
            });
          }

          if (customFields.length > 0) {
            summary += "\nCustom Fields (names end with '__c'):\n";
            customFields.forEach((field) => {
              summary += `${formatField(field)}\n`;
            });
          }

          summary +=
            "\nChild Relationships (for Parent-to-Child SOQL queries):\n";
          if (
            result.childRelationships &&
            result.childRelationships.length > 0
          ) {
            result.childRelationships.forEach((rel) => {
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
        } catch (error) {
          return logAndReturnError({
            error,
            params: { objectName },
            message: "Error describing Salesforce object",
          });
        }
      });
    },

    update_object: async ({ objectName, records, allOrNone }, extra) => {
      const owner = auth.getNonNullableWorkspace();
      const featureFlags = await getFeatureFlags(owner);

      if (!featureFlags.includes("salesforce_tool_write")) {
        return new Err(
          new MCPError(
            "Salesforce write operations are not enabled for this workspace."
          )
        );
      }

      return withAuth(extra, async (conn) => {
        try {
          const result = await conn.sobject(objectName).update(records, {
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
        } catch (error) {
          return logAndReturnError({
            error,
            params: { objectName, recordCount: records.length, allOrNone },
            message: "Error updating Salesforce records",
          });
        }
      });
    },

    list_attachments: async ({ recordId }, extra) => {
      return withAuth(extra, async (conn) => {
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
      });
    },

    read_attachment: async ({ recordId, attachmentId }, extra) => {
      return withAuth(extra, async (conn) => {
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
      });
    },
  };

  return buildTools(SALESFORCE_TOOLS_METADATA, handlers);
}
