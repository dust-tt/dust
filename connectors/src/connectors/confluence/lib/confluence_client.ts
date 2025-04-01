import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { Response as undiciResponse } from "undici";
import { fetch as undiciFetch, ProxyAgent } from "undici";

import { setTimeoutAsync } from "@connectors/lib/async_utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { ConfluenceClientError, EnvironmentConfig } from "@connectors/types";

const CatchAllCodec = t.record(t.string, t.unknown); // Catch-all for unknown properties.

const ConfluenceAccessibleResourcesCodec = t.array(
  t.intersection([
    t.type({
      id: t.string,
      url: t.string,
    }),
    CatchAllCodec,
  ])
);

const ConfluenceSpaceCodec = t.intersection([
  t.type({
    id: t.string,
    key: t.string,
    name: t.string,
    _links: t.type({
      webui: t.string,
    }),
  }),
  CatchAllCodec,
]);
export type ConfluenceSpaceType = t.TypeOf<typeof ConfluenceSpaceCodec>;

const ConfluencePaginatedResults = <C extends t.Mixed>(codec: C) =>
  t.type({
    results: t.array(codec),
    _links: t.partial({
      next: t.string,
    }),
  });

const ConfluencePageCodec = t.intersection([
  t.type({
    createdAt: t.string,
    parentId: t.union([t.string, t.null]),
    id: t.string,
    title: t.string,
    spaceId: t.string,
    version: t.type({
      number: t.number,
      createdAt: t.string,
    }),
    _links: t.type({
      tinyui: t.string,
    }),
  }),
  CatchAllCodec,
]);

const SearchConfluencePageCodec = t.intersection([
  t.type({
    id: t.string,
    type: t.string,
    status: t.string,
    title: t.string,

    // Version info.
    version: t.type({
      number: t.number,
    }),

    // Restrictions.
    restrictions: t.type({
      read: t.type({
        restrictions: t.type({
          user: t.type({
            results: t.array(t.unknown),
          }),
          group: t.type({
            results: t.array(t.unknown),
          }),
        }),
      }),
    }),

    // Children info
    childTypes: t.type({
      page: t.type({
        value: t.boolean,
      }),
    }),

    // Ancestors (parent chain)
    ancestors: t.array(
      t.type({
        id: t.string,
      })
    ),
  }),
  CatchAllCodec,
]);

const ConfluencePageWithBodyCodec = t.intersection([
  ConfluencePageCodec,
  t.type({
    body: t.type({
      storage: t.type({
        value: t.string,
      }),
    }),
    labels: t.type({
      results: t.array(
        t.type({
          id: t.string,
          name: t.string,
          prefix: t.string,
        })
      ),
    }),
  }),
]);
export type ConfluencePageWithBodyType = t.TypeOf<
  typeof ConfluencePageWithBodyCodec
>;

const ConfluenceChildPagesCodec = t.intersection([
  t.type({
    id: t.string,
    status: t.string,
    title: t.string,
    spaceId: t.string,
  }),
  t.partial({
    childPosition: t.number,
  }),
]);

const ConfluenceUserProfileCodec = t.intersection([
  t.type({
    account_id: t.string,
  }),
  CatchAllCodec,
]);

const ConfluenceReportAccounts = t.type({
  accounts: t.array(
    t.type({
      accountId: t.string,
      status: t.union([t.literal("closed"), t.literal("updated")]),
    })
  ),
});

const ConfluenceRestrictionsPaginatedResultsCodec = <C extends t.Mixed>(
  codec: C
) =>
  t.type({
    results: t.array(codec),
    start: t.number,
    limit: t.number,
    size: t.number,
  });

const ConfluenceUserRestrictionCodec = t.type({
  type: t.union([
    t.literal("known"),
    t.literal("unknown"),
    t.literal("anonymous"),
    t.literal("user"),
  ]),
});
const ConfluenceGroupRestrictionCodec = t.type({
  type: t.literal("group"),
});

const RestrictionsCodec = t.type({
  user: ConfluenceRestrictionsPaginatedResultsCodec(
    ConfluenceUserRestrictionCodec
  ),
  group: ConfluenceRestrictionsPaginatedResultsCodec(
    ConfluenceGroupRestrictionCodec
  ),
});

const ConfluenceReadOperationRestrictionsCodec = t.type({
  operation: t.literal("read"),
  restrictions: RestrictionsCodec,
});

// If Confluence does not provide a retry-after header, we use this constant to signal no delay.
const NO_RETRY_AFTER_DELAY = -1;
// Number of times we retry when rate limited and Confluence does provide a retry-after header.
const MAX_RATE_LIMIT_RETRY_COUNT = 5;
// If Confluence returns a retry-after header with a delay greater than this value, we cap it.
const MAX_RETRY_AFTER_DELAY = 300_000; // 5 minutes

// Space types that we support indexing in Dust.
export const CONFLUENCE_SUPPORTED_SPACE_TYPES = [
  "global",
  "collaboration",
  "knowledge_base",
];
type ConfluenceSupportedSpaceType =
  (typeof CONFLUENCE_SUPPORTED_SPACE_TYPES)[number];

function extractCursorFromLinks(links: { next?: string }): string | null {
  if (!links.next) {
    return null;
  }

  const url = new URL(links.next, "https://dummy-base.com"); // Base URL is required for the URL constructor but not used.
  return url.searchParams.get("cursor");
}

function getRetryAfterDuration(response: Response | undiciResponse): number {
  const retryAfter = response.headers.get("retry-after"); // https://developer.atlassian.com/cloud/confluence/rate-limiting/
  if (retryAfter) {
    const delay = parseInt(retryAfter, 10);

    return !Number.isNaN(delay) ? delay * 1000 : NO_RETRY_AFTER_DELAY;
  }

  return NO_RETRY_AFTER_DELAY;
}

export class ConfluenceClient {
  private readonly apiUrl = "https://api.atlassian.com";
  private readonly restApiBaseUrl: string;
  private readonly legacyRestApiBaseUrl: string;
  private readonly proxyAgent: ProxyAgent | null;

  constructor(
    private readonly authToken: string,
    {
      cloudId,
      useProxy = false,
    }: {
      cloudId?: string;
      useProxy?: boolean;
    } = {}
  ) {
    this.restApiBaseUrl = `/ex/confluence/${cloudId}/wiki/api/v2`;
    this.legacyRestApiBaseUrl = `/ex/confluence/${cloudId}/wiki/rest/api`;
    this.proxyAgent = useProxy
      ? new ProxyAgent(
          `http://${EnvironmentConfig.getEnvVariable(
            "PROXY_USER_NAME"
          )}:${EnvironmentConfig.getEnvVariable(
            "PROXY_USER_PASSWORD"
          )}@${EnvironmentConfig.getEnvVariable(
            "PROXY_HOST"
          )}:${EnvironmentConfig.getEnvVariable("PROXY_PORT")}`
        )
      : null;
  }

  private async request<T>(
    endpoint: string,
    codec: t.Type<T>,
    retryCount: number = 0
  ): Promise<T> {
    const response = await (async () => {
      const url = `${this.apiUrl}${endpoint}`;
      const options = {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          "Content-Type": "application/json",
        },
        // Timeout after 30 seconds.
        signal: AbortSignal.timeout(30000),
      };
      try {
        if (this.proxyAgent) {
          return await undiciFetch(url, {
            ...options,
            dispatcher: this.proxyAgent,
          });
        } else {
          return await fetch(url, options);
        }
      } catch (e) {
        statsDClient.increment("external.api.calls", 1, [
          "provider:confluence",
          "status:error",
        ]);

        if (
          e instanceof DOMException &&
          (e.name === "TimeoutError" || e.name === "AbortError")
        ) {
          throw new ConfluenceClientError("Request timed out", {
            type: "http_response_error",
            status: 504,
            data: {
              url: `${this.apiUrl}${endpoint}`,
              message: e.message,
              error: e,
            },
          });
        }
        if (e instanceof TypeError && e.message.includes("fetch failed")) {
          throw new ConfluenceClientError("Confluence client unreachable", {
            type: "http_response_error",
            status: 504,
            data: {
              url: `${this.apiUrl}${endpoint}`,
              message: e.message,
              error: e,
            },
          });
        }
        throw e;
      }
    })();

    if (!response.ok) {
      // If the token is invalid, the API will return a 403 Forbidden response.
      if (response.status === 403 && response.statusText === "Forbidden") {
        throw new ExternalOAuthTokenError();
      }

      // Handle rate limiting from Confluence API
      // https://developer.atlassian.com/cloud/confluence/rate-limiting/
      //
      // Current strategy:
      // 1. If Confluence provides a retry-after header, we honor it immediately
      //    by sleeping in the client. This is not ideal but provides the most
      //    accurate rate limit handling until we can use Temporal's nextRetryDelay.
      // 2. If no retry-after header is provided, we throw a transient error and
      //    let Temporal handle the retry with exponential backoff.
      //
      // Once we upgrade to Temporal SDK >= X.Y.Z, we should:
      // - Remove the client-side sleep
      // - Use ApplicationFailure.create() with nextRetryDelay
      // - See: https://docs.temporal.io/develop/typescript/failure-detection#activity-next-retry-delay
      if (response.status === 429) {
        statsDClient.increment("external.api.calls", 1, [
          "provider:confluence",
          "status:rate_limited",
        ]);

        if (retryCount < MAX_RATE_LIMIT_RETRY_COUNT) {
          const delayMs = getRetryAfterDuration(response);
          logger.warn(
            {
              endpoint,
              delayMs,
            },
            "[Confluence] Rate limit hit"
          );

          // Only retry rate-limited requests when the server provides a Retry-After delay.
          if (
            delayMs !== NO_RETRY_AFTER_DELAY &&
            delayMs < MAX_RETRY_AFTER_DELAY
          ) {
            await setTimeoutAsync(delayMs);
            return this.request(endpoint, codec, retryCount + 1);
          }
        }

        // Otherwise throw regular error to let downstream handle retries (e.g: Temporal).
        throw new ConfluenceClientError("Confluence API rate limit exceeded", {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}`, response },
        });
      }

      statsDClient.increment("external.api.calls", 1, [
        "provider:confluence",
        "status:error",
      ]);

      throw new ConfluenceClientError(
        `Confluence API responded with status: ${response.status}: ${this.apiUrl}${endpoint}`,
        {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}`, response },
        }
      );
    }

    statsDClient.increment("external.api.calls", 1, [
      "provider:confluence",
      "status:success",
    ]);

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      throw new ConfluenceClientError("Response validation failed", {
        type: "validation_error",
      });
    }

    return result.right;
  }

  private async postRequest<T>(
    endpoint: string,
    data: unknown,
    codec: t.Type<T>
  ): Promise<T | undefined> {
    const response = await (async () => {
      const url = `${this.apiUrl}${endpoint}`;
      const options = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        // Timeout after 30 seconds.
        signal: AbortSignal.timeout(30000),
      };
      try {
        if (this.proxyAgent) {
          return await undiciFetch(url, {
            ...options,
            dispatcher: this.proxyAgent,
          });
        } else {
          return await fetch(url, options);
        }
      } catch (e) {
        statsDClient.increment("external.api.calls", 1, [
          "provider:confluence",
          "status:error",
        ]);

        if (
          e instanceof DOMException &&
          (e.name === "TimeoutError" || e.name === "AbortError")
        ) {
          throw new ConfluenceClientError("Request timed out", {
            type: "http_response_error",
            status: 504,
            data: {
              url: `${this.apiUrl}${endpoint}`,
              message: e.message,
              error: e,
            },
          });
        }
        if (e instanceof TypeError && e.message.includes("fetch failed")) {
          throw new ConfluenceClientError("Confluence client unreachable", {
            type: "http_response_error",
            status: 504,
            data: {
              url: `${this.apiUrl}${endpoint}`,
              message: e.message,
              error: e,
            },
          });
        }
        throw e;
      }
    })();

    if (!response.ok) {
      statsDClient.increment("external.api.calls", 1, [
        "provider:confluence",
        "status:error",
      ]);

      throw new ConfluenceClientError(
        `Confluence API responded with status: ${response.status}: ${this.apiUrl}${endpoint}`,
        {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}`, response },
        }
      );
    }

    statsDClient.increment("external.api.calls", 1, [
      "provider:confluence",
      "status:success",
    ]);

    if (response.status === 204) {
      return undefined; // Return undefined for 204 No Content.
    }

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      throw new ConfluenceClientError("Response validation failed", {
        type: "validation_error",
      });
    }

    return result.right;
  }

  async getCloudInformation() {
    const accessibleResources = await this.request(
      "/oauth/token/accessible-resources",
      ConfluenceAccessibleResourcesCodec
    );

    // Currently, the Confluence Auth token may grant access to multiple cloud instances.
    // This implementation restricts usage to the primary (first-listed) cloud instance only.
    const [firstAccessibleResource] = accessibleResources;
    if (!firstAccessibleResource) {
      return null;
    }

    return {
      id: firstAccessibleResource.id,
      url: firstAccessibleResource.url,
    };
  }

  async getChildPages({
    parentPageId,
    pageCursor,
    limit,
  }: {
    parentPageId: string;
    pageCursor: string | null;
    limit?: number;
  }) {
    const params = new URLSearchParams({
      sort: "id",
      limit: limit?.toString() ?? "100",
    });

    if (pageCursor) {
      params.append("cursor", pageCursor);
    }

    try {
      const pages = await this.request(
        `${
          this.restApiBaseUrl
        }/pages/${parentPageId}/children?${params.toString()}`,
        ConfluencePaginatedResults(ConfluenceChildPagesCodec)
      );
      const nextPageCursor = extractCursorFromLinks(pages._links);

      return {
        pages: pages.results,
        nextPageCursor,
      };
    } catch (err) {
      if (err instanceof ConfluenceClientError && err.status === 404) {
        // If the child page is not found, return empty array.
        return {
          pages: [],
          nextPageCursor: null,
        };
      }

      throw err;
    }
  }

  async getSpaces(
    spaceType: ConfluenceSupportedSpaceType,
    { pageCursor }: { pageCursor: string | null }
  ) {
    const params = new URLSearchParams({
      limit: "250",
      type: spaceType,
      sort: "name",
      status: "current",
    });

    if (pageCursor) {
      params.append("cursor", pageCursor);
    }

    const spaces = await this.request(
      `${this.restApiBaseUrl}/spaces?${params.toString()}`,
      ConfluencePaginatedResults(ConfluenceSpaceCodec)
    );

    const nextPageCursor = extractCursorFromLinks(spaces._links);

    return {
      spaces: spaces.results,
      nextPageCursor,
    };
  }

  async getSpaceById(spaceId: string) {
    return this.request(
      `${this.restApiBaseUrl}/spaces/${spaceId}`,
      ConfluenceSpaceCodec
    );
  }

  async getPagesInSpace(
    spaceId: string,
    depth: "all" | "root" = "all",
    sort: "id" | "-modified-date" = "id",
    pageCursor?: string | null
  ) {
    const params = new URLSearchParams({
      depth,
      sort,
      limit: "25",
      status: "current",
    });

    if (pageCursor) {
      params.append("cursor", pageCursor);
    }

    const pages = await this.request(
      `${this.restApiBaseUrl}/spaces/${spaceId}/pages?${params.toString()}`,
      ConfluencePaginatedResults(ConfluencePageCodec)
    );
    const nextPageCursor = extractCursorFromLinks(pages._links);

    return {
      pages: pages.results,
      nextPageCursor,
    };
  }

  async getPagesByIdsInSpace({
    spaceKey,
    pageIds,
    limit,
  }: {
    spaceKey: string;
    pageIds: string[];
    limit?: number;
  }) {
    // Build CQL query to get pages with specific IDs.
    const idClause = pageIds?.length ? ` AND id in (${pageIds.join(",")})` : "";
    const cqlQuery = `type=page AND space="${spaceKey}"${idClause}`;

    const params = new URLSearchParams({
      cql: cqlQuery,
      limit: limit?.toString() ?? "25",
      expand: [
        "version", // to check if page changed.
        "restrictions.read.restrictions.user", // to check user permissions.
        "restrictions.read.restrictions.group", // to check group permissions.
        "childTypes.page", // to know if it has children.
        "ancestors", // to get parent info.
      ].join(","),
    });

    return this.request(
      `${this.legacyRestApiBaseUrl}/content/search?${params.toString()}`,
      ConfluencePaginatedResults(SearchConfluencePageCodec)
    );
  }

  async getPageById(pageId: string) {
    const params = new URLSearchParams({
      "body-format": "storage", // Returns HTML.
      "include-labels": "true", // Include labels.
    });

    try {
      return await this.request(
        `${this.restApiBaseUrl}/pages/${pageId}?${params.toString()}`,
        ConfluencePageWithBodyCodec
      );
    } catch (err) {
      if (err instanceof ConfluenceClientError && err.status === 404) {
        // If the page is not found, return null.
        return null;
      }

      throw err;
    }
  }

  async getPageReadRestrictions(pageId: string) {
    try {
      return await this.request(
        `${this.legacyRestApiBaseUrl}/content/${pageId}/restriction/byOperation/read`,
        ConfluenceReadOperationRestrictionsCodec
      );
    } catch (err) {
      if (err instanceof ConfluenceClientError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getUserAccount() {
    return this.request("/me", ConfluenceUserProfileCodec);
  }

  async reportAccount({
    accountId,
    updatedAt,
  }: {
    accountId: string;
    updatedAt: Date;
  }) {
    const results = await this.postRequest(
      "/app/report-accounts",
      { accounts: [{ accountId, updatedAt: updatedAt.toISOString() }] },
      ConfluenceReportAccounts
    );

    const [firstAccount] = results?.accounts ?? [];
    return firstAccount;
  }
}
