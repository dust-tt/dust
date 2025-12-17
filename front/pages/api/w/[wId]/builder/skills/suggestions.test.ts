import type { RequestMethod } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types";

import handler from "./suggestions";

vi.mock("@app/lib/api/skill/suggestions", () => ({
  getSkillDescriptionSuggestion: vi.fn(),
}));

import { getSkillDescriptionSuggestion } from "@app/lib/api/skill/suggestions";

async function setupTest(options: { method?: RequestMethod } = {}) {
  const method = options.method ?? "POST";

  const { req, res, workspace } = await createPrivateApiMockRequest({
    role: "builder",
    method,
  });

  req.query = { wId: workspace.sId };

  return { req, res, workspace };
}

describe("POST /api/w/[wId]/builder/skills/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns suggestion with valid inputs", async () => {
    const { req, res } = await setupTest();

    req.body = {
      instructions: "Help users analyze data",
      agentFacingDescription: "Use when user wants data analysis",
      tools: [{ name: "query_db", description: "Query the database" }],
    };

    vi.mocked(getSkillDescriptionSuggestion).mockResolvedValue(
      new Ok("Analyzes and visualizes your data")
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      suggestion: "Analyzes and visualizes your data",
    });
  });

  it("returns suggestion with empty tools array", async () => {
    const { req, res } = await setupTest();

    req.body = {
      instructions: "Help users with writing",
      agentFacingDescription: "Use for writing tasks",
      tools: [],
    };

    vi.mocked(getSkillDescriptionSuggestion).mockResolvedValue(
      new Ok("Helps you write better content")
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      suggestion: "Helps you write better content",
    });
  });

  it("returns 500 when suggestion generation fails", async () => {
    const { req, res } = await setupTest();

    req.body = {
      instructions: "Help users",
      agentFacingDescription: "Use for help",
      tools: [],
    };

    vi.mocked(getSkillDescriptionSuggestion).mockResolvedValue(
      new Err(new Error("Model unavailable"))
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error.type).toBe("internal_server_error");
    expect(res._getJSONData().error.message).toBe("Model unavailable");
  });

  it("returns 400 for missing instructions", async () => {
    const { req, res } = await setupTest();

    req.body = {
      agentFacingDescription: "Use for analysis",
      tools: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing agentFacingDescription", async () => {
    const { req, res } = await setupTest();

    req.body = {
      instructions: "Help users",
      tools: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing tools", async () => {
    const { req, res } = await setupTest();

    req.body = {
      instructions: "Help users",
      agentFacingDescription: "Use for help",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid tools format", async () => {
    const { req, res } = await setupTest();

    req.body = {
      instructions: "Help users",
      agentFacingDescription: "Use for help",
      tools: [{ name: "tool1" }], // Missing description
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for unsupported methods", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res } = await setupTest({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    }
  });
});
