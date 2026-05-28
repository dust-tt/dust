import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import { clientFetch } from "@app/lib/egress/client";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: vi.fn(),
}));

const owner: WorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  metadata: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const formData: SkillBuilderFormData = {
  name: "Test Skill",
  agentFacingDescription: "Use this skill for tests",
  userFacingDescription: "A test skill",
  instructions: "Follow the test instructions",
  instructionsHtml: "",
  editors: [],
  tools: [],
  icon: null,
  extendedSkillId: null,
  isDefault: false,
  reinforcement: "off",
  fileAttachments: [],
  attachedKnowledge: [],
  additionalSpaces: [],
};

describe("submitSkillBuilderForm", () => {
  beforeEach(() => {
    vi.mocked(clientFetch).mockReset();
  });

  it("sends the reinforcement setting when creating a skill", async () => {
    vi.mocked(clientFetch).mockResolvedValue(
      new Response(JSON.stringify({ skill: { sId: "skill_test" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await submitSkillBuilderForm({
      formData,
      owner,
    });

    expect(result.isOk()).toBe(true);
    expect(clientFetch).toHaveBeenCalledWith(
      "/api/w/w_test/skills",
      expect.objectContaining({
        method: "POST",
      })
    );

    const init = vi.mocked(clientFetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      reinforcement: "off",
    });
  });
});
