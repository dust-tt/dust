import type {
  IntercomArticleType,
  IntercomCollectionType,
  IntercomConversationType,
  IntercomConversationWithPartsType,
  IntercomHelpCenterType,
  IntercomTeamType,
} from "@connectors/connectors/intercom/lib/types";
import {
  ExternalOauthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import logger from "@connectors/logger/logger";

/**
 * Utility function to call the Intercom API.
 * It centralizes fetching the Access Token from Nango, calling the API and handling global errors.
 */
async function queryIntercomAPI({
  accessToken,
  path,
  method,
  body,
}: {
  accessToken: string;
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
  // Intercom will route to the correct region based on the token.
  // https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/#regional-hosting
  const rawResponse = await fetch(`https://api.intercom.io/${path}`, {
    method,
    headers: {
      "Intercom-Version": "2.10",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // We get the text and attempt to parse so that we can log the raw text in case of error (the
  // body is already consumed by response.json() if used otherwise).
  const text = await rawResponse.text();

  let response = null;
  try {
    response = JSON.parse(text);

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
  } catch (e) {
    if (rawResponse.status === 405) {
      const isCaptchaError = text.includes("captcha-container");

      throw new ProviderWorkflowError(
        "intercom",
        `405 - ${isCaptchaError ? "Captcha error" : text}`,
        "transient_upstream_activity_error"
      );
    } else {
      logger.info(
        { path, response: text, status: rawResponse.status },
        "Failed to parse Intercom JSON response."
      );
      throw e;
    }
  }
}

/**
 * Return the Intercom Workspace.
 */
export async function fetchIntercomWorkspace(accessToken: string): Promise<{
  id: string;
  name: string;
  region: string;
} | null> {
  const response = await queryIntercomAPI({
    accessToken,
    path: "me",
    method: "GET",
  });

  const workspaceId = response?.app?.id_code;
  const workspaceName = response?.app?.name;
  const region = response?.app?.region;

  if (!workspaceId || !workspaceName || !region) {
    return null;
  }

  return {
    id: workspaceId,
    name: workspaceName,
    region,
  };
}

/**
 * Return the list of Help Centers of the Intercom workspace
 */
export async function fetchIntercomHelpCenters(
  accessToken: string
): Promise<IntercomHelpCenterType[]> {
  const response: {
    type: "list";
    data: IntercomHelpCenterType[];
  } = await queryIntercomAPI({
    accessToken,
    path: "help_center/help_centers",
    method: "GET",
  });

  return response.data;
}

/**
 * Return the detail of Help Center
 */
export async function fetchIntercomHelpCenter(
  accessToken: string,
  helpCenterId: string
): Promise<IntercomHelpCenterType | null> {
  const response = await queryIntercomAPI({
    accessToken,
    path: `help_center/help_centers/${helpCenterId}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the list of Collections filtered by Help Center and parent Collection.
 */
export async function fetchIntercomCollections(
  accessToken: string,
  helpCenterId: string,
  parentId: string | null
): Promise<IntercomCollectionType[]> {
  let response, hasMore;
  let page = 1;
  const collections: IntercomCollectionType[] = [];
  do {
    response = await queryIntercomAPI({
      accessToken,
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
    if (response.pages?.total_pages && response.pages.total_pages > page) {
      hasMore = true;
      page += 1;
    } else {
      hasMore = false;
    }
  } while (hasMore);

  return collections.filter(
    (collection) =>
      collection.parent_id == parentId &&
      (parentId === null ? collection.help_center_id == helpCenterId : true)
  );
}

/**
 * Return the detail of a Collection.
 */
export async function fetchIntercomCollection(
  accessToken: string,
  collectionId: string
): Promise<IntercomCollectionType | null> {
  const response = await queryIntercomAPI({
    accessToken,
    path: `help_center/collections/${collectionId}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the Articles that are children of a given Collection.
 */
export async function fetchIntercomArticles({
  accessToken,
  helpCenterId,
  page = 1,
  pageSize = 12,
}: {
  accessToken: string;
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
    accessToken,
    path: `articles/search?help_center_id=${helpCenterId}&state=published&page=${page}&per_page=${pageSize}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the list of Teams.
 */
export async function fetchIntercomTeams(
  accessToken: string
): Promise<IntercomTeamType[]> {
  const response = await queryIntercomAPI({
    accessToken,
    path: `teams`,
    method: "GET",
  });

  return response.teams;
}

/**
 * Return the detail of a Team.
 */
export async function fetchIntercomTeam(
  accessToken: string,
  teamId: string
): Promise<IntercomTeamType | null> {
  const response = await queryIntercomAPI({
    accessToken,
    path: `teams/${teamId}`,
    method: "GET",
  });

  return response;
}

/**
 * Return the paginated list of Conversation for a given Team.
 * Filtered on a slidingWindow and closed Conversations.
 */
export async function fetchIntercomConversations({
  accessToken,
  teamId,
  slidingWindow,
  cursor = null,
  pageSize = 20,
}: {
  accessToken: string;
  teamId?: string;
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

  const queryFilters: {
    field: string;
    operator: string;
    value: string | number | boolean | [] | null;
  }[] = [
    {
      field: "open",
      operator: "=",
      value: false,
    },
    {
      field: "created_at",
      operator: ">",
      value: minCreatedAt,
    },
  ];

  if (teamId) {
    queryFilters.push({
      field: "team_assignee_id",
      operator: "=",
      value: teamId,
    });
  }

  const response = await queryIntercomAPI({
    accessToken,
    path: `conversations/search`,
    method: "POST",
    body: {
      query: {
        operator: "AND",
        value: queryFilters,
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
 * Return the paginated list of Conversation for a given day.
 * Filtered on closed Conversations.
 */
export async function fetchIntercomConversationsForDay({
  accessToken,
  minCreatedAt,
  maxCreatedAt,
  cursor = null,
  pageSize = 20,
}: {
  accessToken: string;
  minCreatedAt: number;
  maxCreatedAt: number;
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
  const response = await queryIntercomAPI({
    accessToken,
    path: `conversations/search`,
    method: "POST",
    body: {
      query: {
        operator: "AND",
        value: [
          {
            field: "created_at",
            operator: ">",
            value: minCreatedAt,
          },
          {
            field: "created_at",
            operator: "<",
            value: maxCreatedAt,
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
  accessToken,
  conversationId,
}: {
  accessToken: string;
  conversationId: string;
}): Promise<IntercomConversationWithPartsType | null> {
  const response = await queryIntercomAPI({
    accessToken,
    path: `conversations/${conversationId}`,
    method: "GET",
  });

  return response;
}
