import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("canonical Frames v2 route namespace", () => {
  it("is feature-gated", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/fil_frame/functions/run/invocations`,
      { method: "POST" }
    );

    expect(response.status).toBe(403);
  });

  it("falls through unmatched canonical routes when enabled", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/fil_frame/functions/run/invocations`,
      { method: "POST" }
    );

    expect(response.status).toBe(404);
  });
});
