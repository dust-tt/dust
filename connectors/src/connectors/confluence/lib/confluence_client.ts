import { ConfluenceClientError } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

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

function extractCursorFromLinks(links: { next?: string }): string | null {
  if (!links.next) {
    return null;
  }

  const url = new URL(links.next, "https://dummy-base.com"); // Base URL is required for the URL constructor but not used.
  return url.searchParams.get("cursor");
}

export class ConfluenceClient {
  private readonly apiUrl = "https://api.atlassian.com";
  private readonly restApiBaseUrl: string;
  private readonly legacyRestApiBaseUrl: string;

  constructor(
    private readonly authToken: string,
    { cloudId }: { cloudId?: string } = {}
  ) {
    this.restApiBaseUrl = `/ex/confluence/${cloudId}/wiki/api/v2`;
    this.legacyRestApiBaseUrl = `/ex/confluence/${cloudId}/wiki/rest/api`;
  }

  private async request<T>(endpoint: string, codec: t.Type<T>): Promise<T> {
    const response = await (async () => {
      try {
        return await fetch(`${this.apiUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            "Content-Type": "application/json",
          },
          // Timeout after 30 seconds.
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
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

      throw new ConfluenceClientError(
        `Confluence API responded with status: ${response.status}: ${this.apiUrl}${endpoint}`,
        {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}`, response },
        }
      );
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

  private async postRequest<T>(
    endpoint: string,
    data: unknown,
    codec: t.Type<T>
  ): Promise<T | undefined> {
    const response = await (async () => {
      try {
        return await fetch(`${this.apiUrl}${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
          // Timeout after 30 seconds.
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
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
      throw new ConfluenceClientError(
        `Confluence API responded with status: ${response.status}: ${this.apiUrl}${endpoint}`,
        {
          type: "http_response_error",
          status: response.status,
          data: { url: `${this.apiUrl}${endpoint}`, response },
        }
      );
    }

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

  async getChildPages(parentPageId: string, pageCursor: string | null) {
    const params = new URLSearchParams({
      sort: "id",
      limit: "100",
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

  async getGlobalSpaces(pageCursor: string | null) {
    const params = new URLSearchParams({
      limit: "250",
      type: "global",
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
    pageCursor?: string
  ) {
    const params = new URLSearchParams({
      depth,
      limit: "25",
      sort: "id",
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
    return this.request(
      `${this.legacyRestApiBaseUrl}/content/${pageId}/restriction/byOperation/read`,
      ConfluenceReadOperationRestrictionsCodec
    );
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
