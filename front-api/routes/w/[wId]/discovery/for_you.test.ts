import { listDiscoveryForYouItems } from "@app/lib/api/discovery";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
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
    const { getWorkOSSessionWithSetCookies } = await import(
      "@app/lib/api/workos/user"
    );
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

  it("rejects workspaces without the discovery homepage flag", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/discovery/for_you`
    );

    expect(response.status).toBe(403);
    expect(mockedListForYou).not.toHaveBeenCalled();
  });

  it("returns the viewer-filtered For You items", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(adminAuth, "discovery_homepage");
    const body: GetDiscoveryForYouResponseBody = {
      items: [
        {
          type: "skill",
          target: {
            sId: "skill-1",
            name: "Skill",
            description: "A skill",
            icon: null,
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
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(adminAuth, "discovery_homepage");
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
