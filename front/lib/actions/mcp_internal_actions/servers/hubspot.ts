import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  createContact,
  getContactByEmail,
  getContactByName,
  getProperties,
  updateContact,
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
      objectType: z.enum(["contacts", "companies", "deals", "leads"]),
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
        const properties = await getProperties({
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
    "create_contact",
    "Create a new contact in Hubspot",
    {
      properties: z
        .record(z.string())
        .describe("An object containing any valid contact properties."),
    },
    async ({ properties }) => {
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
        const contact = await createContact(accessToken, {
          properties,
          associations: [],
        });

        return {
          isError: false,
          content: [
            { type: "text", text: "Contact created successfully" },
            { type: "text", text: JSON.stringify(contact, null, 2) },
          ],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error creating contact."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "update_contact",
    "Update a contact in Hubspot",
    {
      contactId: z.string().describe("The ID of the contact to update."),
      properties: z.record(z.string()).describe("The properties to update."),
    },
    async ({ contactId, properties }) => {
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
        const contact = await updateContact(accessToken, contactId, {
          properties,
          associations: [],
        });

        return {
          isError: false,
          content: [
            { type: "text", text: "Contact updated successfully" },
            { type: "text", text: JSON.stringify(contact, null, 2) },
          ],
        };
      } catch (error: any) {
        logger.error(
          {
            error: error,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error updating contact."
        );
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    }
  );

  server.tool(
    "get_contact_by_email",
    "Get the information of a contact in Hubspot by email",
    {
      email: z.string().describe("The email address of the contact."),
    },
    async ({ email }) => {
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
        const contact = await getContactByEmail(accessToken, email);
        if (!contact) {
          return {
            isError: true,
            content: [{ type: "text", text: "Contact not found" }],
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(contact, null, 2) }],
        };
      } catch (error: any) {
        logger.error(
          {
            error,
            mcpServerId,
            server: "hubspot",
          },
          "[Hubspot MCP Server] Error getting contact by email."
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
        const contacts = await getContactByName(
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

  return server;
};

export default createServer;
