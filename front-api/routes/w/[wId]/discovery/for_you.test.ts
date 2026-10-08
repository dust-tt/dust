import { listDiscoveryForYouItems } from "@app/lib/api/discovery";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetDiscoveryForYouResponseBody } from "@app/types/api/discovery";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/discovery"), async (importOriginal) => ({
  ...(await importOriginal()),
  listDiscoveryForYouItems: vi.fn(),
}));

const mockedListForYou = vi.mocked(listDiscoveryForYouItems);

describe("GET /api/w/:wId/discovery/for_you", () => {
  beforeEach(async () => {
    mockedListForYou.mockReset();
    const { getWorkOSSessionWithSetCookies } =
      await import("@app/lib/api/workos/user");
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: undefined,
      setCookies: [],
    });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await honoApp.request(
      "/api/w/w_unauthenticated/discovery/for_you"
    );

    expect(response.status).toBe(401);
  });

  it("returns the viewer-filtered For You items", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest();
    const body: GetDiscoveryForYouResponseBody = {
      items: [
        {
          type: "skill",
          target: {
            sId: "skill-1",
            name: "Skill",
            description: "A skill",
            icon: null,
            editors: [auth.getNonNullableUser().fullName()],
            editedBy: auth.getNonNullableUser().id,
          },
        },
      ],
    };
    mockedListForYou.mockResolvedValue(new Ok(body.items));

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/discovery/for_you`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });

  it("returns an internal error when For You candidates cannot be loaded", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    mockedListForYou.mockResolvedValue(
      new Err(
        new ElasticsearchError("query_error", "Failed to query for-you usage")
      )
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/discovery/for_you`
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to load For You discovery items.",
      },
    });
  });
});
