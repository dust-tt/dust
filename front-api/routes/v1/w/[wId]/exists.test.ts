import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/w/:wId/exists", () => {
  it("returns exists for a workspace key", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/exists`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exists: true });
  });

  it("returns 401 without credentials", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const response = await honoApp.request(`/api/v1/w/${workspace.sId}/exists`);

    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown workspace", async () => {
    const { key } = await createPublicApiMockRequest();

    const response = await honoApp.request(`/api/v1/w/unknown-wid/exists`, {
      headers: { authorization: `Bearer ${key.secret}` },
    });

    expect(response.status).toBe(404);
  });
});
