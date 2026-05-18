import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";

vi.mock("@app/lib/api/skills/description_suggestion", () => ({
  getSkillDescriptionSuggestion: vi.fn(),
}));

import { getSkillDescriptionSuggestion } from "@app/lib/api/skills/description_suggestion";

import { honoApp } from "@front-api/app";

async function setup() {
  const { workspace } = await createPrivateApiMockRequest({
    role: "builder",
    method: "POST",
  });
  return { workspace };
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/builder/skills/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/builder/skills/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns suggestion with valid inputs", async () => {
    const { workspace } = await setup();
    vi.mocked(getSkillDescriptionSuggestion).mockResolvedValue(
      new Ok("Analyzes and visualizes your data")
    );

    const response = await post(workspace, {
      instructions: "Help users analyze data",
      agentFacingDescription: "Use when user wants data analysis",
      tools: [{ name: "query_db", description: "Query the database" }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestion: "Analyzes and visualizes your data",
    });
  });

  it("returns suggestion with empty tools array", async () => {
    const { workspace } = await setup();
    vi.mocked(getSkillDescriptionSuggestion).mockResolvedValue(
      new Ok("Helps you write better content")
    );

    const response = await post(workspace, {
      instructions: "Help users with writing",
      agentFacingDescription: "Use for writing tasks",
      tools: [],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestion: "Helps you write better content",
    });
  });

  it("returns 500 when suggestion generation fails", async () => {
    const { workspace } = await setup();
    vi.mocked(getSkillDescriptionSuggestion).mockResolvedValue(
      new Err(new Error("Model unavailable"))
    );

    const response = await post(workspace, {
      instructions: "Help users",
      agentFacingDescription: "Use for help",
      tools: [],
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.type).toBe("internal_server_error");
    expect(body.error.message).toBe("Model unavailable");
  });

  it("returns 400 for missing instructions", async () => {
    const { workspace } = await setup();
    const response = await post(workspace, {
      agentFacingDescription: "Use for analysis",
      tools: [],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing agentFacingDescription", async () => {
    const { workspace } = await setup();
    const response = await post(workspace, {
      instructions: "Help users",
      tools: [],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing tools", async () => {
    const { workspace } = await setup();
    const response = await post(workspace, {
      instructions: "Help users",
      agentFacingDescription: "Use for help",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid tools format", async () => {
    const { workspace } = await setup();
    const response = await post(workspace, {
      instructions: "Help users",
      agentFacingDescription: "Use for help",
      tools: [{ name: "tool1" }], // Missing description
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});
