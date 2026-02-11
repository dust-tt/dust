import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import logger from "@app/logger/logger";
import { Err } from "@app/types/shared/result";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No access token found",
  OBJECT_NOT_FOUND: "Object not found",
  NO_OBJECTS_FOUND: "No objects found",
} as const;

// HubSpot object type mappings
export const HUBSPOT_OBJECT_TYPE_TO_ID: Record<string, string> = {
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
).reduce<Record<string, string>>(
  (acc, [objectType, id]) => ({
    ...acc,
    [id]: objectType,
  }),
  {}
);

export const getObjectTypeId = (objectType: string): string | null => {
  return HUBSPOT_OBJECT_TYPE_TO_ID[objectType] ?? null;
};

export const convertObjectTypeToId = (objectTypeId: string): string => {
  if (objectTypeId.startsWith("0-") || objectTypeId.startsWith("2-")) {
    return objectTypeId;
  }
  const convertedId = getObjectTypeId(objectTypeId);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return convertedId || objectTypeId; // Return original if conversion fails
};

/**
 * Wrapper to handle authentication and error logging for HubSpot operations.
 */
export const withAuth = async (
  extra: ToolHandlerExtra,
  action: (accessToken: string) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> => {
  const accessToken = extra.authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
  }
  try {
    return await action(accessToken);
  } catch (error: unknown) {
    return logAndReturnError({ error, message: "Operation failed" });
  }
};

export const logAndReturnError = ({
  error,
  params,
  message,
}: {
  error: unknown;
  params?: Record<string, unknown>;
  message: string;
}): ToolHandlerResult => {
  logger.error(
    {
      error,
      ...params,
    },
    `[Hubspot MCP Server] ${message}`
  );

  const errorAny = error as {
    response?: { body?: { message?: string } };
    message?: string;
  };
  const errorMessage =
    errorAny?.response?.body?.message ?? errorAny?.message ?? message;

  return new Err(new MCPError(errorMessage));
};

export interface PageRequest {
  pagetype: "record" | "index";
  objectTypeId: string;
  objectId?: string;
}

const isValidObjectTypeId = (objectTypeId: string): boolean => {
  if (Object.keys(HUBSPOT_ID_TO_OBJECT_TYPE).includes(objectTypeId)) {
    return true;
  }
  // Custom objects
  if (objectTypeId.startsWith("2-")) {
    return true;
  }
  return false;
};

export const validateRequests = (
  pageRequests: PageRequest[]
): { errors: string[]; invalidObjectTypeIds: string[] } => {
  const errors: string[] = [];
  const invalidObjectTypeIds: string[] = [];

  for (const request of pageRequests) {
    const { pagetype, objectTypeId, objectId } = request;

    // Convert object type name to ID if it's a valid name
    const convertedObjectTypeId = convertObjectTypeToId(objectTypeId);

    // Update the request with the converted ID
    request.objectTypeId = convertedObjectTypeId;

    // Validate the converted objectTypeId exists
    if (!isValidObjectTypeId(convertedObjectTypeId)) {
      invalidObjectTypeIds.push(objectTypeId);
      errors.push(`Invalid objectTypeId: ${objectTypeId}`);
      continue;
    }

    // For record pages, objectId is required
    if (pagetype === "record" && !objectId) {
      errors.push(
        `objectId is required for record page with objectTypeId: ${convertedObjectTypeId}`
      );
    }
  }

  return { errors, invalidObjectTypeIds };
};

export const generateUrls = (
  portalId: string,
  uiDomain: string,
  pageRequests: PageRequest[]
): Array<{
  pagetype: "record" | "index";
  objectTypeId: string;
  objectId?: string;
  url: string;
}> => {
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
