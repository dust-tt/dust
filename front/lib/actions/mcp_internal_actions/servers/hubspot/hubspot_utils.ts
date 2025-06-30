import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No access token found",
  OBJECT_NOT_FOUND: "Object not found",
  NO_OBJECTS_FOUND: "No objects found",
} as const;

// HubSpot object type mappings
export const HUBSPOT_OBJECT_TYPE_TO_ID = {
  appointments: "0-421",
  calls: "0-48",
  communications: "0-18",
  companies: "0-2",
  contacts: "0-1",
  courses: "0-410",
  deals: "0-3",
  emails: "0-49",
  leads: "0-136",
  line_items: "0-8",
  listings: "0-420",
  marketing_events: "0-54",
  meetings: "0-47",
  notes: "0-46",
  orders: "0-123",
  postal_mail: "0-116",
  products: "0-7",
  quotes: "0-14",
  services: "0-162",
  subscriptions: "0-69",
  tasks: "0-27",
  tickets: "0-5",
  users: "0-115",
};

export const HUBSPOT_ID_TO_OBJECT_TYPE = Object.entries(
  HUBSPOT_OBJECT_TYPE_TO_ID
).reduce(
  (acc, [objectType, id]) => ({
    ...acc,
    [id]: objectType,
  }),
  {}
);

export const withAuth = async ({
  action,
  params,
  authInfo,
}: {
  action: (accessToken: string) => Promise<CallToolResult>;
  params?: any;
  authInfo?: AuthInfo;
}): Promise<CallToolResult> => {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return makeMCPToolTextError(ERROR_MESSAGES.NO_ACCESS_TOKEN);
  }
  try {
    return await action(accessToken);
  } catch (error: any) {
    return logAndReturnError({ error, params, message: "Operation failed" });
  }
};

export const logAndReturnError = ({
  error,
  params,
  message,
}: {
  error: any;
  params: Record<string, any>;
  message: string;
}): CallToolResult => {
  logger.error(
    {
      error,
      ...params,
    },
    `[Hubspot MCP Server] ${message}`
  );
  return makeMCPToolTextError(
    error.response?.body?.message ?? error.message ?? message
  );
};

// HubSpot link generation tool
const PageTypeEnum = z
  .enum(["record", "index"])
  .describe(
    "The type of page to link to: 'record' for a specific object's page, 'index' for a list page"
  );

const PageRequestSchema = z.object({
  pagetype: PageTypeEnum,
  objectTypeId: z
    .string()
    .describe(
      "The HubSpot object type ID to link to (e.g., '0-1', '0-2' for contacts, companies, or '2-x' for custom objects)"
    ),
  objectId: z
    .string()
    .optional()
    .describe(
      "The specific object ID to link to (required for 'record' page types)"
    ),
});

export const GetHubspotLinkSchema = z.object({
  portalId: z.string().describe("The HubSpot portal/account ID"),
  uiDomain: z
    .string()
    .describe("The HubSpot UI domain(e.g., 'app.hubspot.com')"),
  pageRequests: z
    .array(PageRequestSchema)
    .describe("Array of page link requests to generate"),
});

export type PageRequest = z.infer<typeof PageRequestSchema>;

export const generateUrls = (
  portalId: string,
  uiDomain: string,
  pageRequests: PageRequest[]
) => {
  return pageRequests.map((request) => {
    const { pagetype, objectTypeId, objectId } = request;
    let url = "";

    if (pagetype === "index") {
      url = `https://${uiDomain}/contacts/${portalId}/objects/${objectTypeId}`;
    } else {
      url = `https://${uiDomain}/contacts/${portalId}/record/${objectTypeId}/${objectId}`;
    }

    return {
      pagetype,
      objectTypeId,
      objectId,
      url,
    };
  });
};
