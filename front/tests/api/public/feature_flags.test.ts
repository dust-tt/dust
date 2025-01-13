import type { GetWorkspaceFeatureFlagsResponseType } from "@dust-tt/client";
import type { WhitelistableFeature } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { getFeatureFlags } from "@app/lib/auth";
import handler from "@app/pages/api/v1/w/[wId]/feature_flags";

// jest.mock("@app/lib/auth", () => ({
//   getFeatureFlags: jest.fn(),
// }));

describe("/api/v1/w/[wId]/feature_flags", () => {
  const mockWorkspace = {
    id: "123",
    sId: "workspace-123",
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns 404 if not system key", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { wId: mockWorkspace.sId },
      headers: {
        authorization: "Bearer sk-aeklraermkal",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({
      error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  });

  /*
  it("returns feature flags for valid system key request", async () => {
    const mockFlags: WhitelistableFeature[] = [
      "usage_data_api",
      "labs_transcripts",
    ];
    (getFeatureFlags as jest.Mock).mockResolvedValue(mockFlags);

    const { req, res } = createMocks({
      method: "GET",
      query: { wId: mockWorkspace.sId },
    });

    const auth = {
      isSystemKey: () => true,
      getNonNullableWorkspace: () => mockWorkspace,
    };

    await handler(req, res, auth);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      feature_flags: mockFlags,
    });
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = createMocks({
      method: "POST",
      query: { wId: mockWorkspace.sId },
    });

    const auth = {
      isSystemKey: () => true,
      getNonNullableWorkspace: () => mockWorkspace,
    };

    await handler(req, res, auth);

    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
    */
});
