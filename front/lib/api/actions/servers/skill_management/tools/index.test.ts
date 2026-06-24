import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { isEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnableForAgent,
  mockBatchFetchUsedBySkills,
  mockFetchActiveByIdsForAgentLoop,
  mockGetFileAttachments,
  mockListActiveByNameForAgentLoop,
  mockListForAgentLoop,
  mockLoadSkillFilesToConversation,
} = vi.hoisted(() => ({
  mockEnableForAgent: vi.fn(),
  mockBatchFetchUsedBySkills: vi.fn(),
  mockFetchActiveByIdsForAgentLoop: vi.fn(),
  mockGetFileAttachments: vi.fn(),
  mockListActiveByNameForAgentLoop: vi.fn(),
  mockListForAgentLoop: vi.fn(),
  mockLoadSkillFilesToConversation: vi.fn(),
}));

vi.mock("@app/lib/api/skills/conversation_files", () => ({
  loadSkillFilesToConversation: mockLoadSkillFilesToConversation,
}));

vi.mock("@app/lib/resources/skill/skill_resource", () => ({
  SkillResource: {
    batchFetchUsedBySkills: mockBatchFetchUsedBySkills,
    fetchActiveByIdsForAgentLoop: mockFetchActiveByIdsForAgentLoop,
    listActiveByNameForAgentLoop: mockListActiveByNameForAgentLoop,
    listForAgentLoop: mockListForAgentLoop,
  },
}));

import { TOOLS } from "./index";

describe("skill_management enable_skill tool", () => {
  const auth = {};
  const agentConfiguration = { sId: "agent-id" };
  const agentMessage = { sId: "agent-message-id" };
  const conversation = { sId: "conversation-id" };
  const userMessage = { content: "", sId: "user-message-id" };
  const skill = {
    enableForAgent: mockEnableForAgent,
    getFileAttachments: mockGetFileAttachments,
    name: "commit",
    sId: "skill-id",
  };
  const parentSkill = {
    instructions: '<skill id="skill-id" name="commit" />',
    name: "parent",
    sId: "parent-skill-id",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [skill],
      systemSkills: [],
    });
    mockBatchFetchUsedBySkills.mockResolvedValue(new Map());
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([]);
    mockListActiveByNameForAgentLoop.mockResolvedValue([]);
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: false });
    mockGetFileAttachments.mockReturnValue([{ fileName: "SKILL.md" }]);
    mockLoadSkillFilesToConversation.mockResolvedValue(
      new Ok({
        loadedPaths: ["conversation-conversation-id/skills/commit/SKILL.md"],
      })
    );
  });

  function makeExtra({
    userMessageOverride = userMessage,
  }: {
    userMessageOverride?: typeof userMessage;
  } = {}) {
    return {
      auth,
      agentLoopContext: {
        runContext: {
          agentConfiguration,
          agentMessage,
          conversation,
          userMessage: userMessageOverride,
        },
      },
      signal: new AbortController().signal,
    } as never;
  }

  function getTool() {
    const tool = TOOLS.find((tool) => tool.name === ENABLE_SKILL_TOOL_NAME);
    if (!tool) {
      throw new Error("enable_skill tool not found");
    }
    return tool;
  }

  it("loads skill files into the conversation and surfaces their paths", async () => {
    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockListForAgentLoop).toHaveBeenCalledWith(auth, {
      agentConfiguration,
      agentMessage,
      conversation,
      userMessage,
    });
    expect(mockLoadSkillFilesToConversation).toHaveBeenCalledWith(auth, {
      skill,
      conversation,
    });
    if (result.isOk()) {
      const [output] = result.value;
      if (!isEnableSkillResultOutput(output)) {
        throw new Error("Expected an enable_skill resource output");
      }
      expect(output.resource.text).toContain(
        "conversation-conversation-id/skills/commit/SKILL.md"
      );
    }
  });

  it("skips file loading when the skill has no attachments", async () => {
    mockGetFileAttachments.mockReturnValue([]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockLoadSkillFilesToConversation).not.toHaveBeenCalled();
  });

  it("reports file load failures without failing the tool", async () => {
    mockLoadSkillFilesToConversation.mockResolvedValue(
      new Err(new Error("GCS copy failed"))
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [output] = result.value;
      if (!isEnableSkillResultOutput(output)) {
        throw new Error("Expected an enable_skill resource output");
      }
      expect(output.resource.text).toContain("Failed to load skill files");
    }
  });

  it("does not load files when the skill was already enabled", async () => {
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: true });
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [skill],
      equippedSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockLoadSkillFilesToConversation).not.toHaveBeenCalled();
  });

  it("does not enable skills outside the agent loop allow-list", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnableForAgent).not.toHaveBeenCalled();
    expect(mockLoadSkillFilesToConversation).not.toHaveBeenCalled();
  });

  it("enables skills referenced by current root skills", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [parentSkill],
      systemSkills: [],
    });
    mockListActiveByNameForAgentLoop.mockResolvedValue([skill]);
    mockBatchFetchUsedBySkills.mockResolvedValue(
      new Map([
        [
          skill.sId,
          [{ icon: null, name: parentSkill.name, sId: parentSkill.sId }],
        ],
      ])
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockListActiveByNameForAgentLoop).toHaveBeenCalledWith(
      auth,
      "commit",
      {
        agentConfiguration,
        agentMessage,
        conversation,
        userMessage,
      }
    );
    expect(mockBatchFetchUsedBySkills).toHaveBeenCalledWith(auth, [skill]);
    expect(mockEnableForAgent).toHaveBeenCalledWith(auth, {
      agentConfiguration,
      conversation,
    });
  });

  it("enables skills referenced by enabled skills one hop at a time", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [parentSkill],
      equippedSkills: [],
      systemSkills: [],
    });
    mockListActiveByNameForAgentLoop.mockResolvedValue([skill]);
    mockBatchFetchUsedBySkills.mockResolvedValue(
      new Map([
        [
          skill.sId,
          [{ icon: null, name: parentSkill.name, sId: parentSkill.sId }],
        ],
      ])
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockEnableForAgent).toHaveBeenCalled();
  });

  it("does not enable unavailable skill references", async () => {
    const unavailableParentSkill = {
      ...parentSkill,
      instructions: '<unavailable_skill id="skill-id" />',
    };
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [unavailableParentSkill],
      systemSkills: [],
    });
    mockListActiveByNameForAgentLoop.mockResolvedValue([skill]);
    mockBatchFetchUsedBySkills.mockResolvedValue(
      new Map([
        [
          skill.sId,
          [
            {
              icon: null,
              name: unavailableParentSkill.name,
              sId: unavailableParentSkill.sId,
            },
          ],
        ],
      ])
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnableForAgent).not.toHaveBeenCalled();
  });

  it("does not use current user message skills as referenced-skill roots", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([parentSkill]);
    mockListActiveByNameForAgentLoop.mockResolvedValue([skill]);
    mockBatchFetchUsedBySkills.mockResolvedValue(
      new Map([
        [
          skill.sId,
          [{ icon: null, name: parentSkill.name, sId: parentSkill.sId }],
        ],
      ])
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        userMessageOverride: {
          content: '<skill id="parent-skill-id" name="parent" />',
          sId: "user-message-id",
        },
      })
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnableForAgent).not.toHaveBeenCalled();
  });

  it("enables skills explicitly referenced by the current user message", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        userMessageOverride: {
          content: '<skill id="skill-id" name="commit" />',
          sId: "user-message-id",
        },
      })
    );

    expect(result.isOk()).toBe(true);
    expect(mockFetchActiveByIdsForAgentLoop).toHaveBeenCalledWith(
      auth,
      ["skill-id"],
      {
        agentConfiguration,
        agentMessage,
        conversation,
        userMessage: {
          content: '<skill id="skill-id" name="commit" />',
          sId: "user-message-id",
        },
      }
    );
    expect(mockEnableForAgent).toHaveBeenCalled();
  });
});
