import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { honoApp } from "@front-api/app";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  setupSkillInstructionsMarkdownPipeline();
});

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "user",
  });
  const skill = await SkillFactory.create(auth, {
    instructions: "Original instructions",
    instructionsHtml: convertMarkdownToBlockHtml("Original instructions"),
  });
  await auth.refresh();

  return { workspace, auth, skill };
}

function getPreview(
  workspace: { sId: string },
  sId: string,
  suggestionIds: string[]
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/skills/${sId}/preview?suggestionIds=${suggestionIds.join(",")}`
  );
}

describe("GET /api/w/:wId/assistant/skills/:sId/preview", () => {
  it("returns the fields of every pending suggestion applied, without saving them", async () => {
    const { workspace, auth, skill } = await setup();
    const descriptionSuggestion = await SkillSuggestionFactory.create(
      auth,
      skill,
      {
        kind: "user_facing_description",
        suggestion: { userFacingDescription: "A clearer description" },
        state: "pending",
      }
    );
    const editSuggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: {
        agentFacingDescriptionEdit: { content: "Use it for reports" },
        instructionEdits: [
          {
            targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
            content: "<p>Rewritten instructions</p>",
            type: "replace",
          },
        ],
      },
    });

    const response = await getPreview(workspace, skill.sId, [
      descriptionSuggestion.sId,
      editSuggestion.sId,
    ]);

    expect(response.status).toBe(200);
    const { preview } = await response.json();
    expect(preview.userFacingDescription).toBe("A clearer description");
    expect(preview.agentFacingDescription).toBe("Use it for reports");
    expect(preview.instructionsHtml).toContain("Rewritten instructions");

    const storedSkill = await SkillResource.fetchById(auth, skill.sId);
    expect(storedSkill?.userFacingDescription).toBe(
      skill.userFacingDescription
    );
    expect(storedSkill?.instructions).toBe("Original instructions");
  });

  it("ignores suggestions that are no longer pending", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      kind: "user_facing_description",
      suggestion: { userFacingDescription: "Already applied" },
      state: "approved",
    });

    const response = await getPreview(workspace, skill.sId, [suggestion.sId]);

    expect(response.status).toBe(200);
    expect((await response.json()).preview).toEqual({});
  });

  it("returns 404 for a non-existent suggestion", async () => {
    const { workspace, skill } = await setup();

    const response = await getPreview(workspace, skill.sId, ["ssu_unknown"]);

    expect(response.status).toBe(404);
  });

  it("returns 400 without suggestion ids", async () => {
    const { workspace, skill } = await setup();

    const response = await getPreview(workspace, skill.sId, []);

    expect(response.status).toBe(400);
  });
});
