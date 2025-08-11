import _ from "lodash";

import {
  isZendeskNotFoundError,
  ZendeskApiError,
} from "@connectors/connectors/zendesk/lib/errors";
import type {
  ZendeskFetchedArticle,
  ZendeskFetchedBrand,
  ZendeskFetchedCategory,
  ZendeskFetchedOrganization,
  ZendeskFetchedSection,
  ZendeskFetchedTicket,
  ZendeskFetchedTicketComment,
  ZendeskFetchedTicketField,
  ZendeskFetchedUser,
} from "@connectors/connectors/zendesk/lib/types";
import { setTimeoutAsync } from "@connectors/lib/async_utils";
import mainLogger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import type { ZendeskCategoryResource } from "@connectors/resources/zendesk_resources";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";
import type { ModelId } from "@connectors/types";
import { removeNulls } from "@connectors/types/shared/utils/general";

const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_TIMEOUT_SECONDS = 60;

const TICKET_PAGE_SIZE = 300;
const COMMENT_PAGE_SIZE = 100;
const CUSTOM_FIELDS_PAGE_SIZE = 100;

const logger = mainLogger.child(
  {
    connector: "zendesk",
  },
  { msgPrefix: "[Zendesk] " }
);

const ZENDESK_URL_REGEX = /^https?:\/\/(.*)\.zendesk\.com([^?]*).*/;
const ZENDESK_ENDPOINT_REGEX = /\/([a-zA-Z_]+)\/(\d+)/g;

function extractMetadataFromZendeskUrl(url: string): {
  subdomain: string;
  endpoint: string;
} {
  const rawEndpoint = url.replace(ZENDESK_URL_REGEX, "$2");

  // Replace numeric IDs with placeholders using the first letter of the previous word.
  const normalizedEndpoint = rawEndpoint.replace(
    ZENDESK_ENDPOINT_REGEX,
    (_, word) => {
      const firstLetter = word.charAt(0).toLowerCase();
      return `/${word}/{${firstLetter}Id}`;
    }
  );

  return {
    subdomain: url.replace(ZENDESK_URL_REGEX, "$1"),
    endpoint: normalizedEndpoint,
  };
}

/**
 * Retrieves a brand's subdomain from the database if it exists, fetches it from the Zendesk API otherwise.
 * Throws if the brand is not found neither in DB nor in Zendesk.
 */
export async function getZendeskBrandSubdomain({
  connectorId,
  brandId,
  subdomain,
  accessToken,
}: {
  connectorId: ModelId;
  brandId: number;
  subdomain: string;
  accessToken: string;
}): Promise<string> {
  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (brandInDb) {
    return brandInDb.subdomain;
  }
  const brand = await fetchZendeskBrand({ subdomain, accessToken, brandId });
  if (!brand) {
    throw new Error(`Brand ${brandId} not found in Zendesk.`);
  }
  return brand.subdomain;
}

/**
 * Handles rate limit responses from Zendesk API.
 * Expects to find the header `Retry-After` in the response.
 * https://developer.zendesk.com/api-reference/introduction/rate-limits/
 * @returns true if the rate limit was handled and the request should be retried, false otherwise.
 */
async function handleZendeskRateLimit(
  response: Response,
  url: string
): Promise<boolean> {
  if (response.status === 429) {
    const { subdomain, endpoint } = extractMetadataFromZendeskUrl(url);
    let retryAfter = 1;

    const headerValue = response.headers.get("retry-after"); // https://developer.zendesk.com/api-reference/introduction/rate-limits/
    if (headerValue) {
      const delay = parseInt(headerValue, 10);
      if (!Number.isNaN(delay)) {
        retryAfter = Math.max(delay, 1);
      }
    }

    statsDClient.increment("zendesk_api.rate_limit.hit.count", 1, [
      `subdomain:${subdomain}`,
      `endpoint:${endpoint}`,
    ]);

    if (retryAfter > RATE_LIMIT_TIMEOUT_SECONDS) {
      logger.info(
        { subdomain, endpoint, response, retryAfter },
        `Attempting to wait more than ${RATE_LIMIT_TIMEOUT_SECONDS} s, aborting.`
      );
      throw new Error(
        `Zendesk retry after larger than ${RATE_LIMIT_TIMEOUT_SECONDS} s, aborting.`
      );
    }
    logger.info(
      { subdomain, endpoint, response, retryAfter },
      "Rate limit hit, waiting before retrying."
    );
    await setTimeoutAsync(retryAfter * 1000);
    return true;
  }
  return false;
}

/**
 * Runs a GET request to the Zendesk API with a maximum number of retries before throwing.
 * TODO(2024-12-20): add some basic io-ts validation here (pass a codec as argument and decode with it)
 */
async function fetchFromZendeskWithRetries({
  url,
  accessToken,
}: {
  url: string;
  accessToken: string;
}) {
  const { subdomain, endpoint } = extractMetadataFromZendeskUrl(url);

  const runFetch = async () =>
    fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

  let rawResponse = await runFetch();

  let retryCount = 0;
  while (await handleZendeskRateLimit(rawResponse, url)) {
    rawResponse = await runFetch();
    retryCount++;
    if (retryCount >= RATE_LIMIT_MAX_RETRIES) {
      logger.info(
        { response: rawResponse },
        `Rate limit hit more than ${RATE_LIMIT_MAX_RETRIES}, aborting.`
      );
      throw new Error(
        `Zendesk rate limit hit more than ${RATE_LIMIT_MAX_RETRIES} times, aborting.`
      );
    }
  }

  const tags = [`subdomain:${subdomain}`, `endpoint:${endpoint}`];
  statsDClient.increment("zendesk_api.requests.count", 1, tags);

  let response;
  try {
    response = await rawResponse.json();
  } catch (e) {
    statsDClient.increment("zendesk_api.requests.error.count", 1, tags);
    throw new ZendeskApiError(
      "Error parsing Zendesk API response",
      rawResponse.status,
      { rawResponse, ...extractMetadataFromZendeskUrl(url) }
    );
  }
  if (!rawResponse.ok) {
    statsDClient.increment("zendesk_api.requests.error.count", 1, tags);
    throw new ZendeskApiError("Zendesk API error.", rawResponse.status, {
      response,
      rawResponse,
      ...extractMetadataFromZendeskUrl(url),
    });
  }

  return response;
}

/**
 * Fetches a single brand from the Zendesk API.
 */
export async function fetchZendeskBrand({
  subdomain,
  accessToken,
  brandId,
}: {
  subdomain: string;
  accessToken: string;
  brandId: number;
}): Promise<ZendeskFetchedBrand | null> {
  const url = `https://${subdomain}.zendesk.com/api/v2/brands/${brandId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.brand ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches all the brands available in the Zendesk API.
 */
export async function listZendeskBrands({
  subdomain,
  accessToken,
}: {
  subdomain: string;
  accessToken: string;
}): Promise<ZendeskFetchedBrand[]> {
  let url = `https://${subdomain}.zendesk.com/api/v2/brands`;
  const brands = [];
  let hasMore = true;

  do {
    try {
      const response = await fetchFromZendeskWithRetries({
        url,
        accessToken,
      });
      brands.push(...response.brands);
      hasMore = response.next_page !== null && response.articles.length !== 0;
      url = response.next_page;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return brands;
      }
      throw e;
    }
  } while (hasMore);

  return brands;
}

/**
 * Fetches a single article from the Zendesk API.
 */
export async function fetchZendeskArticle({
  brandSubdomain,
  accessToken,
  articleId,
}: {
  brandSubdomain: string;
  accessToken: string;
  articleId: number;
}): Promise<ZendeskFetchedArticle | null> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/articles/${articleId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.article ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches a single category from the Zendesk API.
 */
export async function fetchZendeskCategory({
  brandSubdomain,
  accessToken,
  categoryId,
}: {
  brandSubdomain: string;
  accessToken: string;
  categoryId: number;
}): Promise<ZendeskFetchedCategory | null> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories/${categoryId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.category ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches a batch of categories from the Zendesk API.
 */
export async function listZendeskCategoriesInBrand(
  accessToken: string,
  {
    brandSubdomain,
    pageSize,
    url,
  }:
    | { brandSubdomain: string; pageSize: number; url?: never }
    | { brandSubdomain?: never; pageSize?: never; url: string }
): Promise<{
  categories: ZendeskFetchedCategory[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  try {
    const response = await fetchFromZendeskWithRetries({
      url:
        url ?? // using the URL if we got one, reconstructing it otherwise
        `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories?page[size]=${pageSize}`,
      accessToken,
    });
    return {
      categories: response.categories,
      hasMore: response.meta.has_more,
      nextLink: response.links.next,
    };
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return { categories: [], hasMore: false, nextLink: null };
    }
    throw e;
  }
}

/**
 * Fetches a batch of the recently updated articles from the Zendesk API using the incremental API endpoint.
 * https://developer.zendesk.com/documentation/help_center/help-center-api/understanding-incremental-article-exports/
 */
export async function listRecentlyUpdatedArticles({
  subdomain,
  brandSubdomain,
  accessToken,
  startTime, // start time in Unix epoch time, in seconds
}: {
  subdomain: string;
  brandSubdomain: string;
  accessToken: string;
  startTime: number;
}): Promise<{
  articles: ZendeskFetchedArticle[];
  hasMore: boolean;
  endTime: number;
}> {
  // this endpoint retrieves changes in content, not only in metadata despite what is mentioned in the documentation.
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/incremental/articles.json?start_time=${startTime}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return {
      articles: response.articles,
      hasMore: response.next_page !== null && response.articles.length !== 0,
      endTime: response.end_time,
    };
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      const user = await fetchZendeskCurrentUser({
        subdomain,
        accessToken,
      });
      // only admins and agents can fetch this endpoint: https://developer.zendesk.com/documentation/help_center/help-center-api/understanding-incremental-article-exports/#authenticating-the-requests
      if (user && user.role !== "admin" && user.role !== "agent") {
        const { role, suspended, active } = user;
        throw new ZendeskApiError(
          "Error fetching the incremental articles endpoint, user must be admin/agent.",
          403,
          { ...e.data, role, suspended, active }
        );
      }
      logger.warn(
        { subdomain, brandSubdomain },
        "Could not fetch article diff."
      );
      return { articles: [], hasMore: false, endTime: 0 };
    }
    throw e;
  }
}

/**
 * Fetches a batch of articles in a category from the Zendesk API.
 */
export async function listZendeskArticlesInCategory(
  category: ZendeskCategoryResource,
  accessToken: string,
  {
    brandSubdomain,
    pageSize,
    url,
  }:
    | { brandSubdomain: string; pageSize: number; url?: never }
    | { brandSubdomain?: never; pageSize?: never; url: string }
): Promise<{
  articles: ZendeskFetchedArticle[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  const response = await fetchFromZendeskWithRetries({
    url:
      url ?? // using the URL if we got one, reconstructing it otherwise
      `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories/${category.categoryId}/articles?page[size]=${pageSize}`,
    accessToken,
  });
  return {
    articles: response.articles,
    hasMore: response.meta.has_more,
    nextLink: response.links.next,
  };
}

/**
 * Fetches a batch of the recently updated tickets from the Zendesk API using the incremental API endpoint.
 */
export async function listZendeskTickets(
  accessToken: string,
  {
    brandSubdomain,
    startTime,
    url,
  }:
    | { brandSubdomain: string; startTime: number; url?: never }
    | { brandSubdomain?: never; startTime?: never; url: string }
): Promise<{
  tickets: ZendeskFetchedTicket[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  try {
    const response = await fetchFromZendeskWithRetries({
      url:
        url ?? // using the URL if we got one, reconstructing it otherwise
        `https://${brandSubdomain}.zendesk.com/api/v2/incremental/tickets/cursor?` +
          `per_page=${TICKET_PAGE_SIZE}&start_time=${startTime}`,
      accessToken,
    });
    return {
      tickets: response.tickets,
      hasMore:
        !response.end_of_stream &&
        response.after_url !== null &&
        response.tickets.length !== 0,
      nextLink: response.after_url,
    };
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return { tickets: [], hasMore: false, nextLink: null };
    }
    throw e;
  }
}

/**
 * Fetches a single ticket from the Zendesk API.
 */
export async function fetchZendeskTicket({
  accessToken,
  brandSubdomain,
  ticketId,
}: {
  accessToken: string;
  brandSubdomain: string;
  ticketId: number;
}): Promise<ZendeskFetchedTicket | null> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/tickets/${ticketId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.ticket ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches a single ticket from the Zendesk API.
 */
export async function listZendeskTicketComments({
  accessToken,
  brandSubdomain,
  ticketId,
}: {
  accessToken: string;
  brandSubdomain: string;
  ticketId: number;
}): Promise<ZendeskFetchedTicketComment[]> {
  const comments = [];
  let url: string = `https://${brandSubdomain}.zendesk.com/api/v2/tickets/${ticketId}/comments?page[size]=${COMMENT_PAGE_SIZE}`;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetchFromZendeskWithRetries({ url, accessToken });
      comments.push(...response.comments);
      hasMore = response.hasMore || false;
      url = response.nextLink;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return [];
      }
      throw e;
    }
  }
  return comments;
}

/**
 * Fetches the number of tickets in a Brand from the Zendesk API.
 * Only counts tickets that have been solved, and that were updated within the retention period.
 */
export async function getZendeskTicketCount({
  accessToken,
  brandSubdomain,
  retentionPeriodDays,
  query = null,
}: {
  brandSubdomain: string;
  accessToken: string;
} & (
  | { retentionPeriodDays?: number; query: string }
  | { retentionPeriodDays: number; query?: null }
)): Promise<number> {
  logger.warn(
    "Ticket count relies on the Search API, which has proved unreliable."
  );
  query ||= `type:ticket status:solved updated>${retentionPeriodDays}days`;
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/search/count?query=${encodeURIComponent(query)}`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return parseInt(response.count, 10);
}

/**
 * Fetches multiple organizations at once from the Zendesk API.
 * May run multiple queries, more precisely we need organizationCount // 100 + 1 API calls.
 */
export async function listZendeskOrganizations({
  accessToken,
  brandSubdomain,
  organizationIds,
}: {
  accessToken: string;
  brandSubdomain: string;
  organizationIds: number[];
}): Promise<ZendeskFetchedOrganization[]> {
  const users: ZendeskFetchedOrganization[] = [];
  // we can fetch at most 100 organizations at once: https://developer.zendesk.com/api-reference/ticketing/organizations/organizations/#show-many-organizations
  for (const chunk of _.chunk(organizationIds, 100)) {
    const parameter = `ids=${encodeURIComponent(chunk.join(","))}`;
    const response = await fetchFromZendeskWithRetries({
      url: `https://${brandSubdomain}.zendesk.com/api/v2/organizations/show_many?${parameter}`,
      accessToken,
    });
    users.push(...response.organizations);
  }
  return users;
}

/**
 * Fetches the current user through a call to `/users/me`.
 */
export async function fetchZendeskCurrentUser({
  subdomain,
  accessToken,
}: {
  subdomain: string;
  accessToken: string;
}): Promise<ZendeskFetchedUser> {
  const url = `https://${subdomain}.zendesk.com/api/v2/users/me`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return response.user;
}

export function isUserAdmin(user: ZendeskFetchedUser): boolean {
  return user.active && user.role === "admin";
}

/**
 * Fetches multiple users at once from the Zendesk API.
 * May run multiple queries, more precisely we need userCount // 100 + 1 API calls.
 */
export async function listZendeskUsers({
  accessToken,
  brandSubdomain,
  userIds,
}: {
  accessToken: string;
  brandSubdomain: string;
  userIds: number[];
}): Promise<ZendeskFetchedUser[]> {
  const users: ZendeskFetchedUser[] = [];
  // we can fetch at most 100 users at once: https://developer.zendesk.com/api-reference/ticketing/users/users/#show-many-users
  for (const chunk of _.chunk(userIds, 100)) {
    const response = await fetchFromZendeskWithRetries({
      url: `https://${brandSubdomain}.zendesk.com/api/v2/users/show_many?ids=${chunk.join(",")}`,
      accessToken,
    });
    users.push(...response.users);
  }
  return users;
}

/**
 * Fetches all sections in a category from the Zendesk API.
 */
export async function listZendeskSectionsByCategory({
  accessToken,
  brandSubdomain,
  categoryId,
}: {
  accessToken: string;
  brandSubdomain: string;
  categoryId: number;
}): Promise<ZendeskFetchedSection[]> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories/${categoryId}/sections`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.sections ?? [];
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return [];
    }
    throw e;
  }
}

/**
 * Fetches a single section from the Zendesk API.
 */
export async function fetchZendeskSection({
  accessToken,
  brandSubdomain,
  sectionId,
}: {
  accessToken: string;
  brandSubdomain: string;
  sectionId: number;
}): Promise<ZendeskFetchedSection | null> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/sections/${sectionId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.section ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches a single user from the Zendesk API.
 */
export async function fetchZendeskUser({
  accessToken,
  brandSubdomain,
  userId,
}: {
  accessToken: string;
  brandSubdomain: string;
  userId: number;
}): Promise<ZendeskFetchedUser | null> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/users/${userId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.user ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches all categories from the Zendesk API.
 */
export async function listZendeskCategories({
  accessToken,
  brandSubdomain,
}: {
  accessToken: string;
  brandSubdomain: string;
}): Promise<ZendeskFetchedCategory[]> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.categories ?? [];
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return [];
    }
    throw e;
  }
}

export async function getOrganizationTagMapForTickets(
  tickets: ZendeskFetchedTicket[],
  {
    accessToken,
    brandSubdomain,
  }: { accessToken: string; brandSubdomain: string }
) {
  const organizationIds = removeNulls(
    tickets.map((t) => t.organization_id ?? null)
  );
  const organizations = await listZendeskOrganizations({
    accessToken,
    brandSubdomain,
    organizationIds,
  });
  return new Map(organizations.map((t) => [t.id, t.tags]));
}

/**
 * Fetches a single ticket field by ID from the Zendesk API.
 */
export async function getZendeskTicketFieldById({
  accessToken,
  subdomain,
  fieldId,
}: {
  accessToken: string;
  subdomain: string;
  fieldId: number;
}): Promise<ZendeskFetchedTicketField | null> {
  const url = `https://${subdomain}.zendesk.com/api/v2/ticket_fields/${fieldId}`;
  try {
    const response = await fetchFromZendeskWithRetries({ url, accessToken });
    return response?.ticket_field ?? null;
  } catch (e) {
    if (isZendeskNotFoundError(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Fetches all ticket fields from the Zendesk API.
 */
export async function listZendeskTicketFields({
  accessToken,
  subdomain,
}: {
  accessToken: string;
  subdomain: string;
}): Promise<ZendeskFetchedTicketField[]> {
  let url =
    `https://${subdomain}.zendesk.com/api/v2/ticket_fields` +
    +`?page[size]=${CUSTOM_FIELDS_PAGE_SIZE}`;
  const ticketFields = [];
  let hasMore = true;

  do {
    try {
      const response = await fetchFromZendeskWithRetries({
        url,
        accessToken,
      });
      ticketFields.push(...response.ticket_fields);
      hasMore = response.meta?.has_more || false;
      url = response.links?.next || null;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return ticketFields;
      }
      throw e;
    }
  } while (hasMore);

  return ticketFields;
}
