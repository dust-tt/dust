import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { Headers } from "undici";
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
    parentType: t.union([
      t.literal("page"),
      t.literal("folder"),
      t.null,
      t.undefined,
    ]),
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

const SearchBaseContentCodec = t.type({
  id: t.string,
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

  // Ancestors (parent chain).
  ancestors: t.array(
    t.type({
      id: t.string,
      type: t.string,
      title: t.union([t.undefined, t.string]),
    })
  ),
});

const SearchConfluencePageCodec = t.intersection([
  SearchBaseContentCodec,
  t.type({
    type: t.literal("page"),
    childTypes: t.type({
      folder: t.type({
        value: t.boolean,
      }),
      page: t.type({
        value: t.boolean,
      }),
    }),
  }),
]);

const SearchConfluenceFolderCodec = t.intersection([
  SearchBaseContentCodec,
  t.type({
    type: t.literal("folder"),
    childTypes: t.union([
      t.type({
        folder: t.boolean,
        page: t.boolean,
      }),
      t.type({
        folder: t.type({
          value: t.boolean,
        }),
        page: t.type({
          value: t.boolean,
        }),
      }),
    ]),
  }),
]);

const SearchConfluenceContentCodec = t.intersection([
  t.union([SearchConfluencePageCodec, SearchConfluenceFolderCodec]),
  CatchAllCodec,
]);

export type ConfluenceSearchContentType = t.TypeOf<
  typeof SearchConfluenceContentCodec
>;

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

const ConfluenceFolderCodec = t.intersection([
  t.type({
    // They sometimes return a number, sometimes a string.
    createdAt: t.union([t.string, t.number]),
    id: t.string,
    parentId: t.union([t.string, t.null]),
    parentType: t.union([
      t.literal("page"),
      t.literal("folder"),
      t.null,
      t.undefined,
    ]),
    title: t.string,
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

// Headers provided by Confluence API to provide information on the rate limiting.
// https://developer.atlassian.com/cloud/confluence/rate-limiting/
// The exact rate limit model is not detailed, but can be assumed to be a combination of multiple different systems.
const RATE_LIMIT_HEADERS = {
  // As per the doc: "maximum number of requests that a user can make within a specific (unspecified) time window".
  limit: "x-ratelimit-limit",
  // As per the doc: "number of requests remaining in the current rate limit window before the limit is reached".
  remaining: "x-ratelimit-remaining",
  // As per the doc: "When true, indicates that less than 20% of any budget remains."
  nearLimit: "x-ratelimit-nearlimit",
} as const;

// Ratio remaining / limit at which we start to slow down the requests.
// Note: we throttle either based on this ratio or when we get the nearLimit header, which is
// supposed to trigger at 20% (it seems to be a bit more than this since THROTTLE_TRIGGER_RATIO = 0.2
// is always superseded by the header and THROTTLE_TRIGGER_RATIO = 0.3 never is).
const THROTTLE_TRIGGER_RATIO = 0.2;
// If Confluence does not provide a retry-after header, we use this constant to signal no delay.
const NO_RETRY_AFTER_DELAY = -1;
// Number of times we retry when rate limited and Confluence does provide a retry-after header.
const MAX_RATE_LIMIT_RETRY_COUNT = 5;
// If Confluence returns a retry-after header with a delay greater than this value, we cap it.
const MAX_RETRY_AFTER_DELAY = 300_000; // 5 minutes
// If Confluence indicates that we are approaching the rate limit, we delay by this value.
const NEAR_RATE_LIMIT_DELAY = 60_000; // 1 minute

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

function getRetryAfterDuration(headers: Headers): number {
  const retryAfter = headers.get("retry-after"); // https://developer.atlassian.com/cloud/confluence/rate-limiting/
  if (retryAfter) {
    const delay = parseInt(retryAfter, 10);

    return !Number.isNaN(delay) ? delay * 1000 : NO_RETRY_AFTER_DELAY;
  }

  return NO_RETRY_AFTER_DELAY;
}

function checkNearRateLimit(headers: Headers): boolean {
  const nearLimitHeader = headers.get(RATE_LIMIT_HEADERS.nearLimit);
  const remainingHeader = headers.get(RATE_LIMIT_HEADERS.remaining);
  const limitHeader = headers.get(RATE_LIMIT_HEADERS.limit);

  const remaining = remainingHeader ? parseInt(remainingHeader, 10) : null;
  const limit = limitHeader ? parseInt(limitHeader, 10) : null;

  return (
    nearLimitHeader?.toLowerCase() === "true" ||
    (!!remaining &&
      !!limit &&
      // If we have no request remaining, we are already rate limited. This should be unreachable.
      remaining > 0 &&
      remaining / limit < THROTTLE_TRIGGER_RATIO)
  );
}

function getRateLimitHeaders(headers: Headers) {
  const rateLimitHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (
      key.toLowerCase().startsWith("x-ratelimit") ||
      key.toLowerCase() === "retry-after"
    ) {
      rateLimitHeaders[key] = value;
    }
  });

  if (Object.keys(rateLimitHeaders).length === 0) {
    return;
  }

  return rateLimitHeaders;
}

export class ConfluenceClient {
  private readonly apiUrl = "https://api.atlassian.com";
  private readonly restApiBaseUrl: string;
  private readonly legacyRestApiBaseUrl: string;
  private readonly proxyAgent?: ProxyAgent;

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
    if (useProxy) {
      this.proxyAgent = new ProxyAgent(
        `http://${EnvironmentConfig.getEnvVariable(
          "PROXY_USER_NAME"
        )}:${EnvironmentConfig.getEnvVariable(
          "PROXY_USER_PASSWORD"
        )}@${EnvironmentConfig.getEnvVariable(
          "PROXY_HOST"
        )}:${EnvironmentConfig.getEnvVariable("PROXY_PORT")}`
      );
    }
  }

  private async request<T>(
    endpoint: string,
    codec: t.Type<T>,
    {
      retryCount = 0,
      bypassThrottle = false,
    }: { retryCount?: number; bypassThrottle?: boolean } = {}
  ): Promise<T> {
    const response = await (async () => {
      try {
        return await undiciFetch(`${this.apiUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            "Content-Type": "application/json",
          },
          // Timeout after 30 seconds.
          signal: AbortSignal.timeout(30000),
          dispatcher: this.proxyAgent,
        });
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

    const rateLimitHeaders = getRateLimitHeaders(response.headers);

    const localLogger = logger.child({
      endpoint,
      retryCount,
      rateLimitHeaders,
    });

    if (!response.ok) {
      // If the token is invalid, the API will return a 403 Forbidden response.
      if (response.status === 403 && response.statusText === "Forbidden") {
        throw new ExternalOAuthTokenError();
      }

      // Handle rate limiting from Confluence API
      // https://developer.atlassian.com/cloud/confluence/rate-limiting/
      //
      // Current strategy:
      // 1. If Confluence provides a retry-after header smaller than MAX_RETRY_AFTER_DELAY,
      //    we honor it immediately by sleeping in the activity unless we have already retried
      //    MAX_RATE_LIMIT_RETRY_COUNT times.
      // 2. If Confluence provides a retry-after header greater than MAX_RETRY_AFTER_DELAY,
      //    we throw a transient error with the right retryAfterMs to let Temporal replay the
      //    current activity with the right delay.
      // 3. If Confluence does not provide a retry-after header, we throw a transient error and
      //    let Temporal retry in MAX_RETRY_AFTER_DELAY ms.
      if (response.status === 429) {
        const delayMs = getRetryAfterDuration(response.headers);
        const text = await response.text();
        const { statusText } = response;

        statsDClient.increment("external.api.calls", 1, [
          "provider:confluence",
          "status:rate_limited",
        ]);

        // Case 1: Attempt activity-side retry if conditions are met.
        if (retryCount < MAX_RATE_LIMIT_RETRY_COUNT) {
          if (
            delayMs !== NO_RETRY_AFTER_DELAY &&
            delayMs < MAX_RETRY_AFTER_DELAY
          ) {
            localLogger.warn(
              {
                delayMs,
                text,
                statusText,
              },
              "[Confluence] Rate limit hit. Performing activity-side retry."
            );
            await setTimeoutAsync(delayMs);
            return this.request(endpoint, codec, {
              retryCount: retryCount + 1,
              bypassThrottle,
            });
          }
        }

        // If activity-side retry was not performed, throw an error for Temporal to handle.
        // Determine the appropriate retryAfterMs and log the reason.
        let retryAfterMsForTemporal: number;
        let logReason: string;

        if (delayMs !== NO_RETRY_AFTER_DELAY) {
          // Server provided a delay (relevant for Case 2 or if retries exhausted).
          retryAfterMsForTemporal = delayMs;
          if (retryCount >= MAX_RATE_LIMIT_RETRY_COUNT) {
            logReason = `Activity retries exhausted. Server suggested delay ${delayMs}ms.`;
          } else {
            // delayMs >= MAX_RETRY_AFTER_DELAY, as activity-side retry wasn't done.
            logReason =
              `Server suggested delay ${delayMs}ms is >= MAX_RETRY_AFTER_DELAY ` +
              `(${MAX_RETRY_AFTER_DELAY}ms).`;
          }
        } else {
          // Server did not provide delay (Case 3 or retries exhausted without delay).
          retryAfterMsForTemporal = MAX_RETRY_AFTER_DELAY;
          if (retryCount >= MAX_RATE_LIMIT_RETRY_COUNT) {
            logReason = "Activity retries exhausted. No server delay provided.";
          } else {
            logReason = "No server delay provided.";
          }
        }

        localLogger.warn(
          {
            delayMs,
            retryAfterMsForTemporal,
            text,
            statusText,
          },
          `[Confluence] Rate limit hit. Throwing for Temporal. Reason: ${logReason}`
        );

        throw new ConfluenceClientError("Confluence API rate limit exceeded", {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}` },
          retryAfterMs: retryAfterMsForTemporal,
        });
      }

      statsDClient.increment("external.api.calls", 1, [
        "provider:confluence",
        "status:error",
      ]);

      const text = await response.text();

      throw new ConfluenceClientError(
        `Confluence API responded with status: ${response.status}: ${this.apiUrl}${endpoint}`,
        {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}`, text },
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
        data: {
          reason: reporter.formatValidationErrors(result.left),
        },
      });
    }

    // When approaching the rate limit (using adaptive throttle ratio based on limit size), we slow down
    // the query pace by waiting NEAR_RATE_LIMIT_DELAY ms.
    if (!bypassThrottle && checkNearRateLimit(response.headers)) {
      statsDClient.increment("external.api.calls", 1, [
        "provider:confluence",
        "status:near_rate_limit",
      ]);

      const delayMs = NEAR_RATE_LIMIT_DELAY;
      localLogger.warn(
        {
          delayMs,
        },
        "[Confluence] Rate limit nearly hit."
      );
      await setTimeoutAsync(delayMs);
    }

    return result.right;
  }

  private async postRequest<T>(
    endpoint: string,
    data: unknown,
    codec: t.Type<T>
  ): Promise<T | undefined> {
    const response = await (async () => {
      try {
        return await undiciFetch(`${this.apiUrl}${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
          // Timeout after 30 seconds.
          signal: AbortSignal.timeout(30000),
          dispatcher: this.proxyAgent,
        });
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

  async getChildContent({
    limit,
    pageCursor,
    parentContentId,
    spaceKey,
  }: {
    limit: number;
    pageCursor: string | null;
    parentContentId: string;
    spaceKey: string;
  }) {
    // Build CQL query to get pages with specific IDs.
    const cqlQuery = `type IN (page, folder) AND space="${spaceKey}" AND parent=${parentContentId}`;

    const params = new URLSearchParams({
      cql: cqlQuery,
      expand: [
        "version", // To check if page changed.
        "restrictions.read.restrictions.user", // To check user permissions.
        "restrictions.read.restrictions.group", // To check group permissions.
        "childTypes.page", // To know if it has page children.
        "childTypes.folder", // To know if it has folder children.
        "ancestors", // To get parent info.
      ].join(","),
      limit: limit.toString(),
    });

    if (pageCursor) {
      params.append("cursor", pageCursor);
    }

    try {
      const res = await this.request(
        `${this.legacyRestApiBaseUrl}/content/search?${params.toString()}`,
        ConfluencePaginatedResults(SearchConfluenceContentCodec)
      );

      return {
        nextPageCursor: extractCursorFromLinks(res._links),
        content: res.results,
      };
    } catch (err) {
      if (err instanceof ConfluenceClientError && err.status === 404) {
        return {
          nextPageCursor: null,
          content: [],
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
      ConfluencePaginatedResults(ConfluenceSpaceCodec),
      { bypassThrottle: true }
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
        "version", // To check if page changed.
        "restrictions.read.restrictions.user", // To check user permissions.
        "restrictions.read.restrictions.group", // To check group permissions.
        "childTypes.page", // To know if it has page children.
        "childTypes.folder", // To know if it has folder children.
        "ancestors", // To get parent info.
      ].join(","),
    });

    return this.request(
      `${this.legacyRestApiBaseUrl}/content/search?${params.toString()}`,
      ConfluencePaginatedResults(SearchConfluenceContentCodec)
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

  async getFolderById(folderId: string) {
    try {
      return await this.request(
        `${this.restApiBaseUrl}/folders/${folderId}`,
        ConfluenceFolderCodec
      );
    } catch (err) {
      // If the folder scope is not yet granted, throw an ExternalOAuthTokenError so users can
      // re-authorize to pick up the new scope.
      if (
        err instanceof ConfluenceClientError &&
        (err.status === 401 || err.status === 403)
      ) {
        logger.error(
          {
            err,
          },
          "Missing folder scope, re-authorizing is required"
        );
        throw new ExternalOAuthTokenError();
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
