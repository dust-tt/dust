import type {
  IntercomArticleType,
  IntercomCollectionType,
  IntercomConversationType,
  IntercomConversationWithPartsType,
  IntercomHelpCenterType,
  IntercomTeamType,
} from "@connectors/connectors/intercom/lib/types";
import { ExternalOauthTokenError } from "@connectors/lib/error";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import logger from "@connectors/logger/logger";

const { NANGO_INTERCOM_CONNECTOR_ID } = process.env;

/**
 * Utility function to call the Intercom API.
 * It centralizes fetching the Access Token from Nango, calling the API and handling global errors.
 */
async function queryIntercomAPI({
  nangoConnectionId,
  path,
  method,
  body,
}: {
  nangoConnectionId: string;
  path: string;
  method: "GET" | "POST";
  body?: {
    query: {
      operator: "AND" | "OR";
      value: {
        field: string;
        operator: string;
        value: string | number | boolean | [] | null;
      }[];
    };
    pagination: {
      per_page: number;
      starting_after: string | null;
    };
  };
}) {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const accessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_INTERCOM_CONNECTOR_ID,
    useCache: true,
  });

  const rawResponse = await fetch(`https://api.intercom.io/${path}`, {
    method,
    headers: {
      "Intercom-Version": "2.10",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await rawResponse.json();

  if (!rawResponse.ok) {
    if (
      response.type === "error.list" &&
      response.errors &&
      response.errors.length > 0
    ) {
      const error = response.errors[0];
      // This error is thrown when we are dealing with a revoked OAuth token.
      if (error.code === "unauthorized") {
        throw new ExternalOauthTokenError();
      }
      // We return null for 404 errors.
      if (error.code === "not_found") {
        return null;
      }
    }
  }

  return response;
}

/**
 * Return the Intercom Workspace.
 */
export async function fetchIntercomWorkspace(
  nangoConnectionId: string
): Promise<{
  id: string;
  name: string;
} | null> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: "me",
    method: "GET",
  });

  const workspaceId = response?.app?.id_code;
  const workspaceName = response?.app?.name;

  if (!workspaceId || !workspaceName) {
    return null;
  }

  return {
    id: workspaceId,
    name: workspaceName,
  };
}

/**
 * Return the list of Help Centers of the Intercom workspace
 */
export async function fetchIntercomHelpCenters(
  nangoConnectionId: string
): Promise<IntercomHelpCenterType[]> {
  const response: {
    type: "list";
    data: IntercomHelpCenterType[];
  } = await queryIntercomAPI({
    nangoConnectionId,
    path: "help_center/help_centers",
    method: "GET",
  });

  return response.data;
}

/**
 * Return the detail of Help Center
 */
export async function fetchIntercomHelpCenter(
  nangoConnectionId: string,
  helpCenterId: string
): Promise<IntercomHelpCenterType | null> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `help_center/help_centers/${helpCenterId}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the list of Collections filtered by Help Center and parent Collection.
 */
export async function fetchIntercomCollections(
  nangoConnectionId: string,
  helpCenterId: string,
  parentId: string | null
): Promise<IntercomCollectionType[]> {
  let response, hasMore;
  let page = 1;
  const collections: IntercomCollectionType[] = [];
  do {
    response = await queryIntercomAPI({
      nangoConnectionId,
      path: `help_center/collections?page=${page}&per_page=12`,
      method: "GET",
    });
    if (response?.data && Array.isArray(response.data)) {
      collections.push(...response.data);
    } else {
      logger.error(
        { helpCenterId, page, response },
        "[Intercom] No collections found in the list collections response"
      );
    }
    if (response.pages.total_pages > page) {
      hasMore = true;
      page += 1;
    } else {
      hasMore = false;
    }
  } while (hasMore);

  return collections.filter(
    (collection) =>
      collection.help_center_id == helpCenterId &&
      collection.parent_id == parentId
  );
}

/**
 * Return the detail of a Collection.
 */
export async function fetchIntercomCollection(
  nangoConnectionId: string,
  collectionId: string
): Promise<IntercomCollectionType | null> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `help_center/collections/${collectionId}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the Articles that are children of a given Collection.
 */
export async function fetchIntercomArticles({
  nangoConnectionId,
  helpCenterId,
  page = 1,
  pageSize = 12,
}: {
  nangoConnectionId: string;
  helpCenterId: string;
  page: number;
  pageSize?: number;
}): Promise<{
  data: {
    articles: IntercomArticleType[];
  };
  pages: {
    type: "pages";
    prev?: "string";
    next?: "string";
    page: number;
    total_pages: number;
    per_page: number;
  };
}> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `articles/search?help_center_id=${helpCenterId}&state=published&page=${page}&per_page=${pageSize}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the list of Teams.
 */
export async function fetchIntercomTeams(
  nangoConnectionId: string
): Promise<IntercomTeamType[]> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `teams`,
    method: "GET",
  });

  return response.teams;
}

/**
 * Return the detail of a Team.
 */
export async function fetchIntercomTeam(
  nangoConnectionId: string,
  teamId: string
): Promise<IntercomTeamType | null> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `teams/${teamId}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the paginated list of Conversation for a given Team.
 * Filtered on a slidingWindow and closed Conversations.
 */
export async function fetchIntercomConversationsForTeamId({
  nangoConnectionId,
  teamId,
  slidingWindow,
  cursor = null,
  pageSize = 20,
}: {
  nangoConnectionId: string;
  teamId: string;
  slidingWindow: number;
  cursor: string | null;
  pageSize?: number;
}): Promise<{
  conversations: IntercomConversationType[];
  pages: {
    next?: {
      page: number;
      starting_after: string;
    };
  };
}> {
  const minCreatedAtDate = new Date(
    Date.now() - slidingWindow * 24 * 60 * 60 * 1000
  );
  const minCreatedAt = Math.floor(minCreatedAtDate.getTime() / 1000);

  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `conversations/search`,
    method: "POST",
    body: {
      query: {
        operator: "AND",
        value: [
          {
            field: "open",
            operator: "=",
            value: false,
          },
          {
            field: "team_assignee_id",
            operator: "=",
            value: teamId,
          },
          {
            field: "created_at",
            operator: ">",
            value: minCreatedAt,
          },
        ],
      },
      pagination: {
        per_page: pageSize,
        starting_after: cursor,
      },
    },
  });

  return response;
}

/**
 * Return the detail of a Conversation.
 */
export async function fetchIntercomConversation({
  nangoConnectionId,
  conversationId,
}: {
  nangoConnectionId: string;
  conversationId: string;
}): Promise<IntercomConversationWithPartsType | null> {
  const response = await queryIntercomAPI({
    nangoConnectionId,
    path: `conversations/${conversationId}`,
    method: "GET",
  });

  return response;
}
