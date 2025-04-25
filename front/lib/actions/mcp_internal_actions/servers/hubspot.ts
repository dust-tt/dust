import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  ALL_OBJECTS,
  createObject,
  getObjectByEmail,
  getObjectById,
  getObjectProperties,
  getObjectsByProperties,
  getObjectsByProperty,
  SIMPLE_OBJECTS,
  updateObject,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot_api_helper";
import { logAndReturnError } from "@app/lib/actions/mcp_internal_actions/servers/hupspot_utils";
import { returnSuccess } from "@app/lib/actions/mcp_internal_actions/servers/hupspot_utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

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
      objectType: z.enum(ALL_OBJECTS),
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

        return returnSuccess({
          message: "Object properties fetched successfully",
          result: properties,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, creatableOnly },
          message: "Error fetching object properties.",
        });
      }
    }
  );

  server.tool(
    "create_object",
    `Creates a new object in Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
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

        return returnSuccess({
          message: "Object created successfully",
          result: object,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, properties },
          message: "Error creating object.",
        });
      }
    }
  );

  server.tool(
    "update_object",
    `Updates an existing object in Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
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

        return returnSuccess({
          message: "Object updated successfully",
          result: object,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, objectId, properties },
          message: "Error updating object.",
        });
      }
    }
  );

  server.tool(
    "get_object_by_id",
    `Retrieves a Hubspot object using its unique ID. Supports ${ALL_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(ALL_OBJECTS),
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
        return returnSuccess({
          message: "Object fetched successfully",
          result: object,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, objectId },
          message: "Error getting object by ID.",
        });
      }
    }
  );

  server.tool(
    "get_object_by_email",
    `Retrieves a Hubspot object using an email address. Supports ${ALL_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(ALL_OBJECTS),
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
        return returnSuccess({
          message: "Object fetched successfully",
          result: object,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, email },
          message: "Error getting object by email.",
        });
      }
    }
  );

  server.tool(
    "get_objects_by_property_value",
    `Searches for objects in Hubspot matching a property value. Supports ${SIMPLE_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      property: z.string().describe("The property to search by."),
      value: z.string().describe("The value of the property."),
    },
    async ({ objectType, property, value }) => {
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
        const objects = await getObjectsByProperty(
          accessToken,
          objectType,
          property,
          value
        );
        if (!objects.length) {
          return {
            isError: true,
            content: [{ type: "text", text: "No objects found" }],
          };
        }
        return returnSuccess({
          message: "Objects fetched successfully",
          result: objects,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, property, value },
          message: "Error getting objects by property value.",
        });
      }
    }
  );

  server.tool(
    "get_objects_by_properties",
    `Searches for objects in Hubspot matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      properties: z.record(z.string()).describe("The properties to search by."),
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
        const objects = await getObjectsByProperties(
          accessToken,
          objectType,
          properties
        );
        if (!objects.length) {
          return {
            isError: true,
            content: [{ type: "text", text: "No objects found" }],
          };
        }
        return returnSuccess({
          message: "Objects fetched successfully",
          result: objects,
        });
      } catch (error: any) {
        return logAndReturnError({
          error,
          params: { objectType, properties },
          message: "Error getting objects by properties.",
        });
      }
    }
  );

  return server;
};

export default createServer;
