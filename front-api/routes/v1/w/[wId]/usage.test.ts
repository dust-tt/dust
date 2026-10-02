import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

async function getUsage(role: "user" | "admin") {
  const { workspace, key, auth } = await createPublicApiMockRequest({ role });
  await FeatureFlagFactory.basic(auth, "usage_data_api");

  return honoApp.request(
    `/api/v1/w/${workspace.sId}/usage?start_date=2024-06-01`,
    { headers: { authorization: `Bearer ${key.secret}` } }
  );
}

describe("GET /api/v1/w/:wId/usage", () => {
  it("returns 403 for a non-admin API key", async () => {
    const response = await getUsage("user");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
      },
    });
  });

  it("returns 200 with CSV for an admin API key", async () => {
    const response = await getUsage("admin");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
  });
});
