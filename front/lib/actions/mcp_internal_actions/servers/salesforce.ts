import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";

const SF_API_VERSION = "57.0";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("salesforce");

  server.tool(
    "execute_read_query",
    "Execute a read query on Salesforce",
    {
      query: z.string().describe("The SOQL read query to execute"),
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

      return makeMCPToolJSONSuccess({
        message: "Operation completed successfully",
        result: result,
      });
    }
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

      return makeMCPToolTextSuccess({
        message: "Operation completed successfully",
        result: objects,
      });
    }
  );

  server.tool(
    "describe_object",
    "Describe an object in Salesforce",
    {
      objectName: z.string().describe("The name of the object to describe"),
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

      summary += "\nChild Relationships (for Parent-to-Child SOQL queries):\n";
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

      return makeMCPToolTextSuccess({
        message: "Object described successfully. Summary provided.",
        result: summary,
      });
    }
  );

  return server;
};

export default createServer;
