import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";
import { z } from "zod";

import {
  getConnectionForInternalMCPServer,
  makeMCPToolPersonalAuthenticationRequiredError,
} from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "salesforce",
  version: "1.0.0",
  description: "Salesforce tools.",
  authorization: {
    provider: "salesforce" as const,
    use_case: "personal_actions" as const,
  },
  icon: "SalesforceLogo",
};

const SF_API_VERSION = "57.0";

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
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
    async ({ query }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });
      const accessToken = connection?.access_token;
      const instanceUrl = connection?.connection.metadata.instance_url as
        | string
        | undefined;

      if (!accessToken || !instanceUrl) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }

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
    async ({ filter }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });

      const accessToken = connection?.access_token;
      const instanceUrl = connection?.connection.metadata.instance_url as
        | string
        | undefined;

      if (!accessToken || !instanceUrl) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
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
    async ({ objectName }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });

      const accessToken = connection?.access_token;
      const instanceUrl = connection?.connection.metadata.instance_url as
        | string
        | undefined;

      if (!accessToken || !instanceUrl) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
      const conn = new jsforce.Connection({
        instanceUrl,
        accessToken,
        version: SF_API_VERSION,
      });
      await conn.identity();

      const result = await conn.describe(objectName);

      return makeMCPToolJSONSuccess({
        message: "Operation completed successfully",
        result: result,
      });
    }
  );

  return server;
};

export default createServer;
