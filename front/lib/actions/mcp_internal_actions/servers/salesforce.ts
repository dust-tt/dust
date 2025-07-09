import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";
import { z } from "zod";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "salesforce",
  version: "1.0.0",
  description: "Salesforce tools.",
  authorization: {
    provider: "salesforce" as const,
    supported_use_cases: ["personal_actions", "platform_actions"] as const,
  },
  icon: "SalesforceLogo",
  documentationUrl: "https://docs.dust.tt/docs/salesforce",
};

const SF_API_VERSION = "57.0";

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions: `You have access to the following tools: execute_read_query, list_objects, and describe_object.

# General Workflow for Salesforce Data:
1.  **List Objects (Optional):** If you don't know the exact name of an object, use \`list_objects\` to find it.
2.  **Describe Object:** Use \`describe_object\` with the specific object name (e.g., \`Account\`, \`MyCustomObject__c\`) to get its detailed metadata. This will show you all available fields, their exact names, data types, and information about relationships (child relationships are particularly important for subqueries).
3.  **Execute Read Query:** Use \`execute_read_query\` to retrieve data using SOQL. Construct your SOQL queries based on the information obtained from \`describe_object\` to ensure you are using correct field and relationship names.

# execute_read_query
You can use it to execute SOQL read queries on Salesforce. Queries can be used to retrieve or discover data, never to write data.

**Best Practices for Querying:**
1.  **Discover Object Structure First:** ALWAYS use \`describe_object(objectName='YourObjectName')\` to understand an object's fields and relationships before writing complex queries. Alternatively, for a quick field list directly in a query, use \`FIELDS()\` (e.g., \`SELECT FIELDS(ALL) FROM Account LIMIT 1\`). This helps prevent errors from misspelled or non-existent field/relationship names. The \`FIELDS()\` function requires a \`LIMIT\` clause, with a maximum of 200.
2.  **Verify Field and Relationship Names:** If you encounter "No such column" or "Didn't understand relationship" errors, use \`describe_object\` for the relevant object(s) to confirm the exact names and their availability. For example, child relationship names used in subqueries (e.g., \`(SELECT Name FROM Contacts)\` or \`(SELECT Name FROM MyCustomChildren__r)\`) can be found in the output of \`describe_object\`.

**Custom Objects, Fields, and Relationships:**
-   **Custom Objects & Fields:** When referencing custom objects or fields, append \`__c\` to their names (e.g., \`MyCustomField__c\`, \`MyCustomObject__c\`). Confirm these names using \`describe_object\`.
-   **Custom Relationships:** When referencing custom relationships (typically in parent-to-child subqueries), append \`__r\` to the relationship name (e.g., \`(SELECT Name FROM MyCustomRelatedObjects__r)\`). \`describe_object\` will list these child relationship names.

**FIELDS() Keyword Details (Alternative to describe_object for quick field listing in query):**
Use \`FIELDS(ALL)\`, \`FIELDS(CUSTOM)\`, or \`FIELDS(STANDARD)\` in your \`SELECT\` statement to retrieve groups of fields.
-   \`FIELDS(ALL)\`: Selects all fields.
-   \`FIELDS(CUSTOM)\`: Selects all custom fields.
-   \`FIELDS(STANDARD)\`: Selects all standard fields.
Remember to include \`LIMIT\` (max 200) when using \`FIELDS()\`.

**Relationships in Queries (Confirm names with describe_object):**
-   **Child-to-Parent:** Use dot notation. E.g., \`SELECT Account.Name, LastName FROM Contact\`.
-   **Parent-to-Child (Subqueries):** Use a subquery. Confirm relationship name (e.g., \`Contacts\` or \`MyCustomChildren__r\`) via \`describe_object\`.
    -   Standard Relationship: \`SELECT Name, (SELECT FirstName, LastName FROM Contacts) FROM Account\`
    -   Custom Relationship: \`SELECT Name, (SELECT Name FROM MyCustomChildren__r) FROM Account\`

If errors persist after using \`describe_object\` and following these guidelines, the field, object, or relationship might genuinely not exist, or you may lack permissions.

# list_objects
You can use it to list the objects in Salesforce: standard and custom objects. Useful for finding object names if you're unsure.

# describe_object
Use this tool to get detailed metadata about a specific Salesforce object. Provide the object's API name (e.g., \`Account\`, \`Lead\`, \`MyCustomObject__c\`).
The output includes:
-   A list of all fields with their names, labels, types, and other properties.
-   Details about child relationships (useful for parent-to-child subqueries in SOQL), including the relationship name.
-   Information about record types.
-   Other object-level properties.
This is the most reliable way to discover the correct names for fields and relationships before writing an \`execute_read_query\`.
`,
  });

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
