import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  ALL_OBJECTS,
  countObjectsByProperties,
  createObject,
  getLatestObjects,
  getObjectByEmail,
  getObjectById,
  getObjectProperties,
  getObjectsByProperties,
  MAX_COUNT_LIMIT,
  MAX_LIMIT,
  SIMPLE_OBJECTS,
  updateObject,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_api_helper";
import {
  ERROR_MESSAGES,
  returnJSONStringifiedSuccess,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hupspot_utils";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
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
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const result = await getObjectProperties({
          accessToken,
          objectType,
          creatableOnly,
        });
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result,
        });
      });
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
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const result = await createObject({
          accessToken,
          objectType,
          objectProperties: { properties, associations: [] },
        });
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result,
        });
      });
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
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const result = await updateObject({
          accessToken,
          objectType,
          objectId,
          objectProperties: { properties, associations: [] },
        });
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result,
        });
      });
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
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const object = await getObjectById(accessToken, objectType, objectId);
        if (!object) {
          return makeMCPToolTextError(ERROR_MESSAGES.OBJECT_NOT_FOUND);
        }
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result: object,
        });
      });
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
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const object = await getObjectByEmail(accessToken, objectType, email);
        if (!object) {
          return makeMCPToolTextError(ERROR_MESSAGES.OBJECT_NOT_FOUND);
        }
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result: object,
        });
      });
    }
  );

  server.tool(
    "get_objects_by_properties",
    `Searches for objects in Hubspot matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is ${MAX_LIMIT} objects retrieved.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      filters: z
        .array(
          z.object({
            propertyName: z
              .string()
              .describe("The name of the property to search by."),
            operator: z
              .nativeEnum(FilterOperatorEnum)
              .describe("The operator to use for comparison."),
            value: z.string().describe("The value to compare against."),
          })
        )
        .describe("Array of property filters to apply."),
    },
    async ({ objectType, filters }) => {
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const objects = await getObjectsByProperties(
          accessToken,
          objectType,
          filters
        );
        if (!objects.length) {
          return makeMCPToolTextError(ERROR_MESSAGES.NO_OBJECTS_FOUND);
        }
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result: objects,
        });
      });
    }
  );

  server.tool(
    "count_objects_by_properties",
    `Count objects in Hubspot with matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is ${MAX_COUNT_LIMIT} objects.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      filters: z
        .array(
          z.object({
            propertyName: z
              .string()
              .describe("The name of the property to search by."),
            operator: z
              .nativeEnum(FilterOperatorEnum)
              .describe("The operator to use for comparison."),
            value: z.string().describe("The value to compare against."),
          })
        )
        .describe("Array of property filters to apply."),
    },
    async ({ objectType, filters }) => {
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const count = await countObjectsByProperties(
          accessToken,
          objectType,
          filters
        );
        if (!count) {
          return makeMCPToolTextError(ERROR_MESSAGES.NO_OBJECTS_FOUND);
        }
        if (count === MAX_COUNT_LIMIT) {
          return makeMCPToolTextError(
            `Can't retrieve the exact number of objects matching the filters (hit Hubspot API limit of max ${MAX_COUNT_LIMIT} total objects).`
          );
        }
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result: count,
        });
      });
    }
  );

  server.tool(
    "get_latest_objects",
    `Retrieves the latest objects from Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is ${MAX_LIMIT} objects.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      limit: z.number().optional(),
    },
    async ({ objectType, limit = 5 }) => {
      return withAuth(auth, mcpServerId, async (accessToken) => {
        const objects = await getLatestObjects(accessToken, objectType, limit);
        if (!objects.length) {
          return makeMCPToolTextError(ERROR_MESSAGES.NO_OBJECTS_FOUND);
        }
        return returnJSONStringifiedSuccess({
          message: "Operation completed successfully",
          result: objects,
        });
      });
    }
  );

  return server;
};

export default createServer;
