import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  createObject,
  getCompaniesByName,
  getContactsByName,
  getObjectByEmail,
  getObjectById,
  getObjectProperties,
  SUPPORTED_OBJECT_TYPES_READ,
  SUPPORTED_OBJECT_TYPES_WRITE,
  updateObject,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot_api_helper";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "hubspot",
  version: "1.0.0",
  description: "Hubspot tools.",
  authorization: {
    provider: "hubspot" as const,
    use_case: "platform_actions" as const,
  },
  icon: "HubspotLogo",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_object_properties",
    "Lists all available properties for a Hubspot object. When creatableOnly is true, returns only properties that can be modified through forms (excludes hidden, calculated, read-only and file upload fields).",
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_READ),
      creatableOnly: z.boolean().optional(),
    },
    async ({ objectType, creatableOnly = true }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });
      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const properties = await getObjectProperties({
          accessToken,
          objectType,
          creatableOnly,
        });
        const content = JSON.stringify(properties, null, 2);

        return {
          isError: false,
          content: [
            { type: "text", text: "Object properties fetched successfully" },
            { type: "text", text: content },
          ],
        };
      } catch (error) {
        logger.error(
          {
            error,
            objectType,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error fetching object properties."
        );
        return {
          isError: true,
          content: [{ type: "text", text: "Error fetching object properties" }],
        };
      }
    }
  );

  server.tool(
    "create_object",
    `Creates a new object in Hubspot. Supports ${SUPPORTED_OBJECT_TYPES_WRITE.join(", ")}.`,
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_WRITE),
      properties: z
        .record(z.string())
        .describe("An object containing the valid properties for the object."),
    },
    async ({ objectType, properties }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });
      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const object = await createObject({
          accessToken,
          objectType,
          objectProperties: {
            properties,
            associations: [],
          },
        });

        return {
          isError: false,
          content: [
            { type: "text", text: "Object created successfully" },
            { type: "text", text: JSON.stringify(object, null, 2) },
          ],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            objectType,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error creating object."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "update_object",
    `Updates an existing object in Hubspot. Supports ${SUPPORTED_OBJECT_TYPES_WRITE.join(", ")}.`,
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_WRITE),
      objectId: z.string().describe("The ID of the object to update."),
      properties: z.record(z.string()).describe("The properties to update."),
    },
    async ({ objectType, objectId, properties }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });
      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const object = await updateObject({
          accessToken,
          objectType,
          objectId,
          objectProperties: {
            properties,
            associations: [],
          },
        });

        return {
          isError: false,
          content: [
            { type: "text", text: "Object updated successfully" },
            { type: "text", text: JSON.stringify(object, null, 2) },
          ],
        };
      } catch (error: any) {
        logger.error(
          {
            error: error,
            objectType,
            objectId,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error updating object."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "get_object_by_id",
    `Retrieves a Hubspot object using its unique ID. Supports ${SUPPORTED_OBJECT_TYPES_READ.join(", ")}.`,
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_READ),
      objectId: z.string().describe("The ID of the object to get."),
    },
    async ({ objectType, objectId }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });

      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const object = await getObjectById(accessToken, objectType, objectId);
        if (!object) {
          return {
            isError: true,
            content: [{ type: "text", text: "Object not found" }],
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(object, null, 2) }],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            objectType,
            objectId,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error getting object by ID."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "get_object_by_email",
    `Retrieves a Hubspot object using an email address. Supports ${SUPPORTED_OBJECT_TYPES_READ.join(", ")}.`,
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_READ),
      email: z.string().describe("The email address of the object."),
    },
    async ({ objectType, email }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });

      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const object = await getObjectByEmail(accessToken, objectType, email);
        if (!object) {
          return {
            isError: true,
            content: [{ type: "text", text: "Object not found" }],
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(object, null, 2) }],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            objectType,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error getting object by email."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "get_contact_by_name",
    "Searches for contacts in Hubspot matching a first and last name. May return multiple results.",
    {
      firstname: z
        .string()
        .optional()
        .describe("The first name of the contact (optional)."),
      lastname: z.string().describe("The last name of the contact."),
    },
    async ({ firstname, lastname }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });

      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const contacts = await getContactsByName(
          accessToken,
          firstname,
          lastname
        );
        if (!contacts.length) {
          return {
            isError: true,
            content: [{ type: "text", text: "No contact found" }],
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(contacts, null, 2) }],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error getting contact by name."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "get_company_by_name",
    "Searches for companies in Hubspot matching a name. May return multiple results.",
    {
      name: z.string().describe("The name of the company."),
    },
    async ({ name }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });

      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: "No access token found" }],
        };
      }

      try {
        const companies = await getCompaniesByName(accessToken, name);
        if (!companies.length) {
          return {
            isError: true,
            content: [{ type: "text", text: "No company found" }],
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(companies, null, 2) }],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error getting company by name."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  return server;
};

export default createServer;
