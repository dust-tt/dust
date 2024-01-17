import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import { PathReporter } from "io-ts/PathReporter";

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

const ConfluenceListSpacesCodec = t.type({
  results: t.array(ConfluenceSpaceCodec),
});

const ConfluencePageCodec = t.intersection([
  t.type({
    body: t.type({
      storage: t.type({
        value: t.string,
      }),
    }),
    createdAt: t.string,
    parentId: t.union([t.string, t.null]),
    id: t.string,
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
export type ConfluencePageType = t.TypeOf<typeof ConfluencePageCodec>;

const ConfluenceListPagesCodec = t.type({
  results: t.array(ConfluencePageCodec),
  _links: t.partial({
    next: t.string,
  }),
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

  constructor(
    private readonly authToken: string,
    { cloudId }: { cloudId?: string } = {}
  ) {
    this.restApiBaseUrl = `/ex/confluence/${cloudId}/wiki/api/v2`;
  }

  private async request<T>(endpoint: string, codec: t.Type<T>): Promise<T> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Confluence API responded with status: ${response.status}: ${this.apiUrl}${endpoint}`
      );
    }

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      console.error(PathReporter.report(result));
      throw new Error("Response validation failed");
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

  async getGlobalSpaces() {
    return (
      await this.request(
        `${this.restApiBaseUrl}/spaces?status=current&type=global&sort=name`,
        ConfluenceListSpacesCodec
      )
    ).results;
  }

  async getPagesInSpace(spaceId: string, pageCursor?: string) {
    const params = new URLSearchParams({
      "body-format": "storage", // Returns HTML.
      sort: "id",
      status: "current",
      limit: "25",
    });

    if (pageCursor) {
      params.append("cursor", pageCursor);
    }

    const pages = await this.request(
      `${this.restApiBaseUrl}/spaces/${spaceId}/pages?${params.toString()}`,
      ConfluenceListPagesCodec
    );
    const nextPageCursor = extractCursorFromLinks(pages._links);

    return {
      pages: pages.results,
      nextPageCursor,
    };
  }
}
