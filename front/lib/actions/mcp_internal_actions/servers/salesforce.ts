import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";
import { z } from "zod";

import {
  getConnectionForInternalMCPServer,
  makeMCPToolPersonalAuthenticationRequiredError,
} from "@app/lib/actions/mcp_internal_actions/authentication";
import { makeMCPToolJSONSuccess } from "@app/lib/actions/mcp_internal_actions/utils";
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
    instructions: `You have access to the following tools: execute_query & list_objects.
# execute_query
You can use it to execute SOQL queries on Salesforce: queries can be used to retrieve data or to discover data.

**Custom objects / fields**
If you are attempting to use a custom object or field, be sure to append the '__c' after the custom object or field name.

**FIELDS() keyword**
Use the FIELDS() keyword in the fieldList to select groups of fields without knowing their names in advance.
This keyword simplifies SELECT statements, avoids the need for multiple API calls, and provides a low-code method to explore the data in your org.
- FIELDS(ALL) selects all the fields of an object
- FIELDS(CUSTOM) selects all the custom fields of an object
- FIELDS(STANDARD) selects all the standard fields of an object
The SOQL FIELDS function must have a LIMIT of at most 200.

# list_objects
You can use it to list the objects in Salesforce: standard and custom objects.
`,
  });

  server.tool(
    "execute_query",
    "Execute a query on Salesforce",
    {
      query: z.string().describe("The SOQL query to execute"),
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
        .map((object) => ({
          name: object.name,
          label: object.label,
          custom: object.custom,
        }));

      return makeMCPToolJSONSuccess({
        message: "Operation completed successfully",
        result: objects,
      });
    }
  );

  return server;
};

export default createServer;
