import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("POST /api/poke/workspaces/:wId/skills/suggestions", () => {
  it("stores instructions in the Skill Builder HTML format", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
      role: "admin",
    });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/skills/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Source verification",
          userFacingDescription: "Verifies sources before answering.",
          agentFacingDescription: "Use when an answer needs verified sources.",
          instructions: "Verify every source before answering.",
          icon: "MagnifyingGlassIcon",
          mcpServerViewIds: [],
        }),
      }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.skill.instructions).toBe(
      "Verify every source before answering."
    );
    expect(data.skill.instructionsHtml).toContain(
      "Verify every source before answering."
    );
  });
});
