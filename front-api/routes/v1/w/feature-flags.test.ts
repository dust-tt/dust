import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

import { honoApp } from "../../../app";

describe("GET /api/v1/w/:wId/feature_flags", () => {
  it("returns 404 if not a system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/feature_flags`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  });

  it("returns 200 and the workspace feature flags", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest({
      systemKey: true,
    });

    await FeatureFlagFactory.basic(auth, "deepseek_feature");
    await FeatureFlagFactory.basic(auth, "xai_feature");

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/feature_flags`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      feature_flags: expect.arrayContaining([
        "deepseek_feature",
        "xai_feature",
      ]),
    });
  });

  it("returns 200 and an empty array when no feature flags exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/feature_flags`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feature_flags: [] });
  });

  it("returns feature flags only for the requested workspace", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const otherWorkspace = await WorkspaceFactory.basic();
    await FeatureFlagFactory.basic(auth, "xai_feature");
    await FeatureFlagFactory.basic(
      await Authenticator.internalAdminForWorkspace(otherWorkspace.sId),
      "labs_transcripts"
    );

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/feature_flags`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );

    expect(response.status).toBe(200);
    const { feature_flags } = await response.json();
    expect(feature_flags).toEqual(expect.arrayContaining(["xai_feature"]));
    expect(feature_flags).not.toContain("labs_transcripts");
  });
});
