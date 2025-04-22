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
    "Get the properties available for an object. If creatableOnly is true (default), only the properties that can be created will be returned (i.e. form fields, not hidden, not calculated fields, value can be modified, and not file uploads).",
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_READ),
      creatableOnly: z.boolean().optional(),
    },
    async ({ objectType, creatableOnly = true }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
    "Create a new object in Hubspot",
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_WRITE),
      properties: z
        .record(z.string())
        .describe("An object containing the valid properties for the object."),
    },
    async ({ objectType, properties }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
    "Update an object in Hubspot",
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_WRITE),
      objectId: z.string().describe("The ID of the object to update."),
      properties: z.record(z.string()).describe("The properties to update."),
    },
    async ({ objectType, objectId, properties }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
    "Get the information of an object in Hubspot by ID",
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_READ),
      objectId: z.string().describe("The ID of the object to get."),
    },
    async ({ objectType, objectId }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
    "Get the information of an object in Hubspot by email",
    {
      objectType: z.enum(SUPPORTED_OBJECT_TYPES_READ),
      email: z.string().describe("The email address of the object."),
    },
    async ({ objectType, email }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
    "Get the information of a contact in Hubspot by name",
    {
      firstname: z.string().describe("The first name of the contact."),
      lastname: z.string().describe("The last name of the contact."),
    },
    async ({ firstname, lastname }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
    "Get the information of a company in Hubspot by name",
    {
      name: z.string().describe("The name of the company."),
    },
    async ({ name }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "hubspot",
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
