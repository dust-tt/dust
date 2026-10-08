import { listDiscoveryTrendingItems } from "@app/lib/api/discovery";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetDiscoveryTrendingResponseBody } from "@app/types/api/discovery";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/discovery"), async (importOriginal) => ({
  ...(await importOriginal()),
  listDiscoveryTrendingItems: vi.fn(),
}));

const mockedListTrending = vi.mocked(listDiscoveryTrendingItems);

describe("GET /api/w/:wId/discovery/trending", () => {
  beforeEach(async () => {
    mockedListTrending.mockReset();
    const { getWorkOSSessionWithSetCookies } =
      await import("@app/lib/api/workos/user");
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: undefined,
      setCookies: [],
    });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await honoApp.request(
      "/api/w/w_unauthenticated/discovery/trending"
    );

    expect(response.status).toBe(401);
  });

  it("returns the viewer-filtered trending items", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const body: GetDiscoveryTrendingResponseBody = {
      items: [
        {
          type: "agent",
          target: {
            sId: "agent-1",
            name: "Agent",
            description: "An agent",
            pictureUrl: "https://example.com/agent.png",
            scope: "visible",
            lastAuthors: ["Alice"],
          },
        },
      ],
    };
    mockedListTrending.mockResolvedValue(new Ok(body.items));

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/discovery/trending`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });

  it("returns an internal error when trending candidates cannot be loaded", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    mockedListTrending.mockResolvedValue(
      new Err(
        new ElasticsearchError("query_error", "Failed to query trending usage")
      )
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/discovery/trending`
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to load trending discovery items.",
      },
    });
  });
});
