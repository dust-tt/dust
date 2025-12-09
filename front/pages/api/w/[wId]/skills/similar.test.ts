import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types";

import handler from "./similar";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";

async function setupTest(
  role: "builder" | "user" | "admin" = "builder",
  method: RequestMethod = "POST",
  withFeatureFlags = true
) {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role,
    method,
  });

  req.query.wId = workspace.sId;

  if (withFeatureFlags) {
    await FeatureFlagFactory.basic("skills", workspace);
    await FeatureFlagFactory.basic("skills_similar_display", workspace);
  }

  return { req, res, workspace };
}

describe("POST /api/w/[wId]/skills/similar", () => {
  it("returns 405 for non-POST methods", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res } = await setupTest("builder", method);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });

  it("returns 403 when user is not a builder", async () => {
    const { req, res } = await setupTest("user", "POST");

    req.body = { naturalDescription: "test description" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("returns similar skills when runMultiActionsAgent succeeds", async () => {
    const { req, res } = await setupTest("builder", "POST");

    req.body = { naturalDescription: "Create GitHub issues for support" };

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "set_similar_skills",
            arguments: { similar_skills_array: ["abc12", "20zer", "35xyz"] },
          },
        ],
        generation: "",
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      similar_skills: ["abc12", "20zer", "35xyz"],
    });
  });

  it("returns empty similar skills when runMultiActionsAgent succeeds with empty array", async () => {
    const { req, res } = await setupTest("builder", "POST");

    req.body = { naturalDescription: "Create GitHub issues for support" };

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "set_similar_skills",
            arguments: { similar_skills_array: [] },
          },
        ],
        generation: "",
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      similar_skills: [],
    });
  });

  it("returns 400 when naturalDescription is missing", async () => {
    const { req, res } = await setupTest("builder", "POST");

    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "naturalDescription is required and must be a string.",
      },
    });
  });
});
