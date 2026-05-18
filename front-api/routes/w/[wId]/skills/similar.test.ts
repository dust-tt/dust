import { describe, expect, it, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";

import { honoApp } from "@front-api/app";

async function setup(role: "builder" | "user" | "admin" = "builder") {
  const { workspace } = await createPrivateApiMockRequest({ role });
  return { workspace };
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/similar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/skills/similar", () => {
  it("returns similar skills when runMultiActionsAgent succeeds", async () => {
    const { workspace } = await setup();

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

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      similar_skills: ["abc12", "20zer", "35xyz"],
    });
  });

  it("returns empty similar skills when runMultiActionsAgent succeeds with empty array", async () => {
    const { workspace } = await setup();

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

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_skills: [] });
  });

  it("returns 400 when naturalDescription is missing", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "naturalDescription is required and must be a string.",
      },
    });
  });
});
