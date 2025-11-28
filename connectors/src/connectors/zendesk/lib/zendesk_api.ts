import _ from "lodash";
import type { z } from "zod";

import {
  isZendeskNotFoundError,
  ZendeskApiError,
} from "@connectors/connectors/zendesk/lib/errors";
import {
  getOrganizationFromCache,
  setOrganizationInCache,
} from "@connectors/connectors/zendesk/lib/in_memory_cache";
import type {
  ZendeskArticle,
  ZendeskBrand,
  ZendeskCategory,
  ZendeskOrganization,
  ZendeskSection,
  ZendeskTicket,
  ZendeskTicketComment,
  ZendeskTicketField,
  ZendeskUser,
} from "@connectors/connectors/zendesk/lib/types";
import {
  ZendeskArticleResponseSchema,
  ZendeskArticlesResponseSchema,
  ZendeskBrandResponseSchema,
  ZendeskBrandsResponseSchema,
  ZendeskCategoriesResponseSchema,
  ZendeskCategoryResponseSchema,
  ZendeskOrganizationsResponseSchema,
  ZendeskSearchCountResponseSchema,
  ZendeskSectionResponseSchema,
  ZendeskSectionsResponseSchema,
  ZendeskTicketCommentsResponseSchema,
  ZendeskTicketFieldResponseSchema,
  ZendeskTicketResponseSchema,
  ZendeskTicketsResponseSchema,
  ZendeskUserResponseSchema,
  ZendeskUsersResponseSchema,
} from "@connectors/connectors/zendesk/lib/types";
import { setTimeoutAsync } from "@connectors/lib/async_utils";
import type { RateLimit } from "@connectors/lib/throttle";
import { throttleWithRedis } from "@connectors/lib/throttle";
import mainLogger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";
import type { ModelId } from "@connectors/types";

const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_TIMEOUT_SECONDS = 60;

const TICKET_PAGE_SIZE = 300;
const COMMENT_PAGE_SIZE = 100;

const logger = mainLogger.child(
  {
    connector: "zendesk",
  },
  { msgPrefix: "[Zendesk] " }
);

const ZENDESK_URL_REGEX = /^https?:\/\/(.*)\.zendesk\.com([^?]*).*/;
const ZENDESK_ENDPOINT_REGEX = /\/([a-zA-Z_]+)\/(\d+)/g;

export class ZendeskClient {
  constructor(
    private readonly accessToken: string,
    private readonly connectorId: ModelId,
    private readonly rateLimitTransactionsPerSecond: number | null
  ) {}

  private createRateLimitConfig(): RateLimit | null {
    if (this.rateLimitTransactionsPerSecond === null) {
      return null;
    }
    return {
      limit: this.rateLimitTransactionsPerSecond,
      windowInMs: 1000,
    };
  }

  private async handleZendeskRateLimit(
    response: Response,
    url: string
  ): Promise<boolean> {
    if (response.status === 429) {
      const { subdomain, endpoint } = extractMetadataFromZendeskUrl(url);
      let retryAfter = 1;

      const headerValue = response.headers.get("retry-after");
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

  private async fetchFromZendeskWithRetries<T extends z.Schema>(
    url: string,
    schema: T
  ): Promise<z.infer<T>> {
    const { subdomain, endpoint } = extractMetadataFromZendeskUrl(url);
    const rateLimitConfig = this.createRateLimitConfig();

    const runFetch = async () => {
      const tags = [`subdomain:${subdomain}`, `endpoint:${endpoint}`];
      let retryCount = 0;
      let rawResponse: Response;
      let isRateLimited: boolean;

      do {
        rawResponse = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        });
        statsDClient.increment("zendesk_api.requests.count", 1, tags);

        isRateLimited = await this.handleZendeskRateLimit(rawResponse, url);
        if (isRateLimited && retryCount >= RATE_LIMIT_MAX_RETRIES) {
          logger.info(
            { response: rawResponse },
            `Rate limit hit more than ${RATE_LIMIT_MAX_RETRIES}, aborting.`
          );
          throw new Error(
            `Zendesk rate limit hit more than ${RATE_LIMIT_MAX_RETRIES} times, aborting.`
          );
        }
        retryCount++;
      } while (isRateLimited);

      let jsonResponse;
      try {
        jsonResponse = await rawResponse.json();
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
          response: jsonResponse,
          rawResponse,
          ...extractMetadataFromZendeskUrl(url),
        });
      }

      // Validate response with schema
      const parseResult = schema.safeParse(jsonResponse);
      if (!parseResult.success) {
        logger.error(
          {
            subdomain,
            endpoint,
            error: parseResult.error.message,
          },
          "[Zendesk] Invalid API response format"
        );
        statsDClient.increment(
          "zendesk_api.requests.validation_error.count",
          1,
          tags
        );
        throw new ZendeskApiError(
          `Invalid Zendesk API response format: ${parseResult.error.message}`,
          500,
          { url, ...extractMetadataFromZendeskUrl(url) }
        );
      }
      return parseResult.data;
    };

    if (rateLimitConfig === null) {
      return runFetch();
    }

    // Use Redis-based throttling with graceful fallback
    try {
      return await throttleWithRedis(
        rateLimitConfig,
        `zendesk:${this.connectorId}`,
        { canBeIgnored: false },
        runFetch,
        { subdomain, endpoint }
      );
    } catch (error) {
      // If Redis is unavailable (e.g., in CLI/local dev), fall back to direct fetch
      logger.warn(
        { error, subdomain, endpoint, connectorId: this.connectorId },
        "Redis throttling failed, falling back to direct API call"
      );
      return runFetch();
    }
  }

  async fetchBrand({
    subdomain,
    brandId,
  }: {
    subdomain: string;
    brandId: number;
  }): Promise<ZendeskBrand | null> {
    const url = `https://${subdomain}.zendesk.com/api/v2/brands/${brandId}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskBrandResponseSchema
      );
      return response.brand;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  async getTicketFieldById({
    subdomain,
    fieldId,
  }: {
    subdomain: string;
    fieldId: number;
  }): Promise<ZendeskTicketField | null> {
    const url = `https://${subdomain}.zendesk.com/api/v2/ticket_fields/${fieldId}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskTicketFieldResponseSchema
      );
      return response.ticket_field ?? null;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  async getTicketCount({
    brandSubdomain,
    retentionPeriodDays,
    query,
  }: {
    brandSubdomain: string;
    retentionPeriodDays?: number;
    query?: string | null;
  }): Promise<number> {
    const finalQuery =
      query || `type:ticket status:solved updated>${retentionPeriodDays}days`;
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/search/count?query=${encodeURIComponent(finalQuery)}`;
    const response = await this.fetchFromZendeskWithRetries(
      url,
      ZendeskSearchCountResponseSchema
    );
    return parseInt(response.count, 10);
  }

  async fetchTicket({
    brandSubdomain,
    ticketId,
  }: {
    brandSubdomain: string;
    ticketId: number;
  }): Promise<ZendeskTicket | null> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/tickets/${ticketId}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskTicketResponseSchema
      );
      return response.ticket;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  async listTicketComments({
    brandSubdomain,
    ticketId,
  }: {
    brandSubdomain: string;
    ticketId: number;
  }): Promise<ZendeskTicketComment[]> {
    const comments: ZendeskTicketComment[] = [];
    let url = `https://${brandSubdomain}.zendesk.com/api/v2/tickets/${ticketId}/comments?page[size]=${COMMENT_PAGE_SIZE}`;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.fetchFromZendeskWithRetries(
          url,
          ZendeskTicketCommentsResponseSchema
        );
        comments.push(...response.comments);
        hasMore =
          (response.meta?.has_more ?? false) &&
          !!response.links?.next &&
          response.links?.next !== url;
        url = response.links?.next ?? "";
      } catch (e) {
        if (isZendeskNotFoundError(e)) {
          return [];
        }
        throw e;
      }
    }

    return comments;
  }

  async listUsers({
    brandSubdomain,
    userIds,
  }: {
    brandSubdomain: string;
    userIds: number[];
  }): Promise<ZendeskUser[]> {
    const users: ZendeskUser[] = [];
    for (const chunk of _.chunk(userIds, 100)) {
      const response = await this.fetchFromZendeskWithRetries(
        `https://${brandSubdomain}.zendesk.com/api/v2/users/show_many?ids=${chunk.join(",")}`,
        ZendeskUsersResponseSchema
      );
      users.push(...response.users);
    }
    return users;
  }

  async listOrganizations({
    brandSubdomain,
    organizationIds,
  }: {
    brandSubdomain: string;
    organizationIds: number[];
  }): Promise<ZendeskOrganization[]> {
    if (organizationIds.length === 0) {
      return [];
    }

    const results: ZendeskOrganization[] = [];
    const nonCachedOrganizationIds: number[] = [];

    for (const organizationId of organizationIds) {
      const cached = getOrganizationFromCache({
        brandSubdomain,
        organizationId,
      });
      if (cached) {
        results.push(cached);
      } else {
        nonCachedOrganizationIds.push(organizationId);
      }
    }

    const totalRequested = organizationIds.length;
    const cacheHits = totalRequested - nonCachedOrganizationIds.length;
    if (totalRequested > 0) {
      logger.info(
        {
          brandSubdomain,
          totalRequested,
          cacheHits,
          cacheMisses: nonCachedOrganizationIds.length,
          hitRate: ((cacheHits / totalRequested) * 100).toFixed(1),
        },
        "[Zendesk] Organization cache performance"
      );
    }

    // We can fetch at most 100 organizations at once: https://developer.zendesk.com/api-reference/ticketing/organizations/organizations/#show-many-organizations
    if (nonCachedOrganizationIds.length > 0) {
      for (const chunk of _.chunk(nonCachedOrganizationIds, 100)) {
        const parameter = `ids=${encodeURIComponent(chunk.join(","))}`;
        const response = await this.fetchFromZendeskWithRetries(
          `https://${brandSubdomain}.zendesk.com/api/v2/organizations/show_many?${parameter}`,
          ZendeskOrganizationsResponseSchema
        );

        for (const organization of response.organizations) {
          setOrganizationInCache(organization, {
            brandSubdomain,
            organizationId: organization.id,
          });
          results.push(organization);
        }
      }
    }

    return results;
  }

  async getOrganizationTagMapForTickets(
    tickets: ZendeskTicket[],
    {
      brandSubdomain,
    }: {
      brandSubdomain: string;
    }
  ): Promise<Map<number, string[]>> {
    const organizationIds = tickets
      .map((t) => t.organization_id)
      .filter((id) => id !== null) as number[];

    if (organizationIds.length === 0) {
      return new Map();
    }

    const organizations = await this.listOrganizations({
      brandSubdomain,
      organizationIds,
    });
    return new Map(organizations.map((t) => [t.id, t.tags]));
  }

  async fetchCategory({
    brandSubdomain,
    categoryId,
  }: {
    brandSubdomain: string;
    categoryId: number;
  }): Promise<ZendeskCategory | null> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories/${categoryId}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskCategoryResponseSchema
      );
      return response.category;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  async listCategoriesInBrand(
    params: { url: string } | { brandSubdomain: string; pageSize: number }
  ): Promise<{
    categories: ZendeskCategory[];
    hasMore: boolean;
    nextLink: string | null;
  }> {
    const apiUrl =
      "url" in params
        ? params.url
        : `https://${params.brandSubdomain}.zendesk.com/api/v2/help_center/categories?page[size]=${params.pageSize}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        apiUrl,
        ZendeskCategoriesResponseSchema
      );
      return {
        categories: response.categories,
        hasMore: response.meta?.has_more ?? false,
        nextLink: response.links?.next ?? null,
      };
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return { categories: [], hasMore: false, nextLink: null };
      }
      throw e;
    }
  }

  async listArticlesInCategory(
    params:
      | { url: string }
      | { brandSubdomain: string; categoryId: number; pageSize: number }
  ): Promise<{
    articles: ZendeskArticle[];
    hasMore: boolean;
    nextLink: string | null;
  }> {
    const apiUrl =
      "url" in params
        ? params.url
        : `https://${params.brandSubdomain}.zendesk.com/api/v2/help_center/categories/${params.categoryId}/articles?page[size]=${params.pageSize}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        apiUrl,
        ZendeskArticlesResponseSchema
      );
      return {
        articles: response.articles,
        hasMore: response.meta?.has_more ?? false,
        nextLink: response.links?.next ?? null,
      };
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return { articles: [], hasMore: false, nextLink: null };
      }
      throw e;
    }
  }

  async listSectionsByCategory({
    brandSubdomain,
    categoryId,
  }: {
    brandSubdomain: string;
    categoryId: number;
  }): Promise<ZendeskSection[]> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories/${categoryId}/sections`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskSectionsResponseSchema
      );
      return response.sections || [];
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return [];
      }
      throw e;
    }
  }

  async listTickets(
    params: { url: string } | { brandSubdomain: string; startTime: number }
  ): Promise<{
    tickets: ZendeskTicket[];
    hasMore: boolean;
    nextLink: string | null;
  }> {
    try {
      const apiUrl =
        "url" in params
          ? params.url
          : `https://${params.brandSubdomain}.zendesk.com/api/v2/incremental/tickets/cursor?per_page=${TICKET_PAGE_SIZE}&start_time=${params.startTime}`;

      const response = await this.fetchFromZendeskWithRetries(
        apiUrl,
        ZendeskTicketsResponseSchema
      );
      return {
        tickets: response.tickets,
        hasMore:
          !(response.end_of_stream ?? true) &&
          response.after_url !== null &&
          response.tickets.length !== 0,
        nextLink: response.after_url ?? null,
      };
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return { tickets: [], hasMore: false, nextLink: null };
      }
      throw e;
    }
  }

  async listRecentlyUpdatedArticles({
    brandSubdomain,
    startTime,
  }: {
    brandSubdomain: string;
    startTime: number;
  }): Promise<{
    articles: ZendeskArticle[];
    hasMore: boolean;
    endTime: number;
  }> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/incremental/articles.json?start_time=${startTime}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskArticlesResponseSchema
      );
      return {
        articles: response.articles,
        hasMore:
          (response.meta?.has_more ?? false) && response.articles.length !== 0,
        endTime: response.end_time ?? startTime,
      };
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return { articles: [], hasMore: false, endTime: startTime };
      }
      throw e;
    }
  }

  async fetchSection({
    brandSubdomain,
    sectionId,
  }: {
    brandSubdomain: string;
    sectionId: number;
  }): Promise<ZendeskSection | null> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/sections/${sectionId}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskSectionResponseSchema
      );
      return response.section;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  async fetchUser({
    brandSubdomain,
    userId,
  }: {
    brandSubdomain: string;
    userId: number;
  }): Promise<ZendeskUser | null> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/users/${userId}`;
    try {
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskUserResponseSchema
      );
      return response.user;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  async listBrands({
    subdomain,
  }: {
    subdomain: string;
  }): Promise<ZendeskBrand[]> {
    const url = `https://${subdomain}.zendesk.com/api/v2/brands`;
    const response = await this.fetchFromZendeskWithRetries(
      url,
      ZendeskBrandsResponseSchema
    );
    return response.brands;
  }

  async listCategories({
    brandSubdomain,
  }: {
    brandSubdomain: string;
  }): Promise<ZendeskCategory[]> {
    const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories`;
    const response = await this.fetchFromZendeskWithRetries(
      url,
      ZendeskCategoriesResponseSchema
    );
    return response.categories;
  }

  async fetchArticle({
    brandSubdomain,
    articleId,
  }: {
    brandSubdomain: string;
    articleId: number;
  }): Promise<ZendeskArticle | null> {
    try {
      const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/articles/${articleId}`;
      const response = await this.fetchFromZendeskWithRetries(
        url,
        ZendeskArticleResponseSchema
      );
      return response.article;
    } catch (e) {
      if (isZendeskNotFoundError(e)) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Retrieves a brand's subdomain from the database if it exists, fetches it from the Zendesk API otherwise.
   * Throws if the brand is not found neither in DB nor in Zendesk.
   */
  async getBrandSubdomain({
    brandId,
    subdomain,
  }: {
    brandId: number;
    subdomain: string;
  }): Promise<string> {
    const brandInDb = await ZendeskBrandResource.fetchByBrandId({
      connectorId: this.connectorId,
      brandId,
    });
    if (brandInDb) {
      return brandInDb.subdomain;
    }
    const brand = await this.fetchBrand({ subdomain, brandId });
    if (!brand) {
      throw new Error(`Brand ${brandId} not found in Zendesk.`);
    }
    return brand.subdomain;
  }
}

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

export function isUserAdmin(user: ZendeskUser): boolean {
  return user.active && user.role === "admin";
}

export async function fetchZendeskCurrentUser({
  subdomain,
  accessToken,
}: {
  subdomain: string;
  accessToken: string;
}): Promise<ZendeskUser> {
  const url = `https://${subdomain}.zendesk.com/api/v2/users/me`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch current user: ${response.statusText}`);
  }

  const jsonResponse = await response.json();
  return jsonResponse.user;
}
