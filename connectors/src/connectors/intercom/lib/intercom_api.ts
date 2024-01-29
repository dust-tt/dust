import type { ArticleObject, CollectionObject } from "intercom-client";
import { Client } from "intercom-client";

import { HTTPError } from "@connectors/lib/error";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";

const { NANGO_INTERCOM_CONNECTOR_ID } = process.env;

type IntercomMeResponseType = {
  type: string;
  id: string;
  email: string;
  name: string;
  app: {
    type: "app";
    id_code: string;
    name: string;
  };
};

type IntercomHelpCenterType = {
  id: string;
  workspace_id: string;
  created_at: number;
  updated_at: number;
  identifier: string;
  website_turned_on: boolean;
  display_name: string | null;
};

export type IntercomCollectionType = CollectionObject & {
  help_center_id: string;
  parent_id: string;
};

type IntercomArticleType = ArticleObject & {
  parent_ids: string[];
};

// TO BE REMOVED IN A NEXT PR
export async function validateAccessToken(intercomAccessToken: string) {
  const intercomClient = new Client({
    tokenAuth: { token: intercomAccessToken },
  });
  try {
    await intercomClient.admins.list(); // trying a simple request
  } catch (e) {
    return false;
  }
  return true;
}

/**
 * Return the Intercom Access Token that was defined in the Dust Intercom App.
 * We store it in Nango.
 */
export async function getIntercomClient(
  nangoConnectionId: string
): Promise<Client> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const accessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_INTERCOM_CONNECTOR_ID,
    useCache: true,
  });

  return new Client({
    tokenAuth: { token: accessToken },
  });
}

/**
 * Return the Intercom Workspace Id.
 * Not available via the Node SDK, calling the API directly.
 */
export async function fetchIntercomWorkspaceId(nangoConnectionId: string) {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const accessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_INTERCOM_CONNECTOR_ID,
    useCache: true,
  });

  const resp = await fetch(`https://api.intercom.io/me`, {
    method: "GET",
    headers: {
      "Intercom-Version": "2.10",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data: IntercomMeResponseType = await resp.json();
  const workspaceId = data.app.id_code;

  if (!workspaceId) {
    throw new Error("No Intercom Workspace Id found.");
  }
  return workspaceId;
}

/**
 * Return the list of Help Centers of the Intercom workspace
 * Not available via the Node SDK, calling the API directly.
 */
export async function fetchIntercomHelpCenters(
  nangoConnectionId: string
): Promise<IntercomHelpCenterType[]> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const accessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_INTERCOM_CONNECTOR_ID,
    useCache: true,
  });

  const resp = await fetch(`https://api.intercom.io/help_center/help_centers`, {
    method: "GET",
    headers: {
      "Intercom-Version": "2.10",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  type HelpCentersGetResponseType = {
    type: "list";
    data: IntercomHelpCenterType[];
  };

  const response: HelpCentersGetResponseType = await resp.json();
  return response.data;
}

/**
 * Return the detail of Help Center
 * Not available via the Node SDK, calling the API directly.
 */
export async function fetchIntercomHelpCenter(
  nangoConnectionId: string,
  helpCenterId: string
): Promise<IntercomHelpCenterType> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const accessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_INTERCOM_CONNECTOR_ID,
    useCache: true,
  });

  const resp = await fetch(
    `https://api.intercom.io/help_center/help_centers/${helpCenterId}`,
    {
      method: "GET",
      headers: {
        "Intercom-Version": "2.10",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const response: IntercomHelpCenterType = await resp.json();
  return response;
}

/**
 * Return the list of Collections filtered by Help Center and parent Collection.
 */
export async function fetchIntercomCollections(
  intercomClient: Client,
  helpCenterId: string,
  parentId: string | null
): Promise<IntercomCollectionType[]> {
  let response, hasMore;
  let page = 1;
  const collections: IntercomCollectionType[] = [];
  do {
    response = await intercomClient.helpCenter.collections.list({
      page,
      perPage: 12,
    });
    // @ts-expect-error Argument of type 'CollectionObject' is not assignable to parameter of type 'IntercomCollectionType'.
    collections.push(...response.data);
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
  intercomClient: Client,
  collectionId: string
): Promise<IntercomCollectionType | null> {
  try {
    // @ts-expect-error Property "parent_id" does not exist on type "CollectioObject".
    return await intercomClient.helpCenter.collections.find({
      id: collectionId,
    });
  } catch (error: unknown) {
    if (error instanceof HTTPError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Return the Articles that are children of a given Collection.
 */
export async function fetchIntercomArticles(
  intercomClient: Client,
  parentId: string | null
): Promise<IntercomArticleType[]> {
  let response, hasMore;
  let page = 1;
  const articles: IntercomArticleType[] = [];
  do {
    response = await intercomClient.articles.list({
      page,
      perPage: 12,
    });
    // @ts-expect-error Property "parent_ids" does not exist on type "ArticleObject".
    articles.push(...response.data);
    if (response.pages.total_pages > page) {
      hasMore = true;
      page += 1;
    } else {
      hasMore = false;
    }
  } while (hasMore);

  return articles.filter((article) => article.parent_id == parentId);
}

/**
 * Return the detail of an Article.
 */
export async function fetchIntercomArticle(
  intercomClient: Client,
  articleId: string
): Promise<IntercomArticleType | null> {
  try {
    // @ts-expect-error Property "parent_ids" does not exist on type "ArticleObject".
    return await intercomClient.articles.find({
      id: articleId,
    });
  } catch (error: unknown) {
    if (error instanceof HTTPError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}
