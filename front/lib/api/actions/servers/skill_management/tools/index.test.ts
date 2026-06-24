import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { isEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnableForAgent,
  mockBatchFetchUsedBySkills,
  mockFetchActiveByName,
  mockFetchActiveByIdsForAgentLoop,
  mockGetFileAttachments,
  mockListForAgentLoop,
  mockLoadSkillFilesToConversation,
} = vi.hoisted(() => ({
  mockEnableForAgent: vi.fn(),
  mockBatchFetchUsedBySkills: vi.fn(),
  mockFetchActiveByName: vi.fn(),
  mockFetchActiveByIdsForAgentLoop: vi.fn(),
  mockGetFileAttachments: vi.fn(),
  mockListForAgentLoop: vi.fn(),
  mockLoadSkillFilesToConversation: vi.fn(),
}));

vi.mock("@app/lib/api/skills/conversation_files", () => ({
  loadSkillFilesToConversation: mockLoadSkillFilesToConversation,
}));

vi.mock("@app/lib/resources/skill/skill_resource", () => ({
  SkillResource: {
    batchFetchUsedBySkills: mockBatchFetchUsedBySkills,
    fetchActiveByName: mockFetchActiveByName,
    fetchActiveByIdsForAgentLoop: mockFetchActiveByIdsForAgentLoop,
    listForAgentLoop: mockListForAgentLoop,
  },
}));

import { TOOLS } from "./index";

describe("skill_management enable_skill tool", () => {
  type TestUserMessage = {
    content: string;
    rank: number;
    sId: string;
    type: "user_message";
    visibility: "visible";
  };
  type TestCompactionMessage = {
    content: string | null;
    sId: string;
    status: "succeeded";
    type: "compaction_message";
    visibility: "visible";
  };
  type TestMessage = TestUserMessage | TestCompactionMessage;

  const auth = {};
  const agentConfiguration = { sId: "agent-id" };
  const agentMessage = { sId: "agent-message-id" };
  const userMessage: TestUserMessage = {
    content: "",
    rank: 2,
    sId: "user-message-id",
    type: "user_message",
    visibility: "visible",
  };
  const conversation: {
    content: TestMessage[][];
    sId: string;
  } = { content: [], sId: "conversation-id" };
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
    mockFetchActiveByName.mockResolvedValue(null);
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([]);
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: false });
    mockGetFileAttachments.mockReturnValue([{ fileName: "SKILL.md" }]);
    mockLoadSkillFilesToConversation.mockResolvedValue(
      new Ok({
        loadedPaths: ["conversation-conversation-id/skills/commit/SKILL.md"],
      })
    );
  });

  function makeExtra({
    conversationOverride = conversation,
    userMessageOverride = userMessage,
  }: {
    conversationOverride?: typeof conversation;
    userMessageOverride?: typeof userMessage;
  } = {}) {
    return {
      auth,
      agentLoopContext: {
        runContext: {
          agentConfiguration,
          agentMessage,
          conversation: conversationOverride,
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
    mockFetchActiveByName.mockResolvedValue(skill);
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
    expect(mockFetchActiveByName).toHaveBeenCalledWith(auth, "commit", {
      agentLoopData: {
        agentConfiguration,
        agentMessage,
        conversation,
        userMessage,
      },
    });
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
    mockFetchActiveByName.mockResolvedValue(skill);
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
    mockFetchActiveByName.mockResolvedValue(skill);
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
    mockFetchActiveByName.mockResolvedValue(skill);
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
          ...userMessage,
          content: '<skill id="parent-skill-id" name="parent" />',
        },
      })
    );

    expect(result.isErr()).toBe(true);
    expect(mockEnableForAgent).not.toHaveBeenCalled();
  });

  it("enables skills explicitly referenced by the current user message", async () => {
    const currentUserMessage = {
      ...userMessage,
      content: '<skill id="skill-id" name="commit" />',
    };
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        userMessageOverride: currentUserMessage,
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
        userMessage: currentUserMessage,
      }
    );
    expect(mockEnableForAgent).toHaveBeenCalled();
  });

  it("enables skills explicitly referenced by earlier user messages", async () => {
    const earlierUserMessage = {
      ...userMessage,
      content: '<skill id="skill-id" name="commit" />',
      rank: 1,
      sId: "earlier-user-message-id",
    };
    const conversationWithEarlierSkill = {
      ...conversation,
      content: [[earlierUserMessage], [userMessage]],
    };
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        conversationOverride: conversationWithEarlierSkill,
      })
    );

    expect(result.isOk()).toBe(true);
    expect(mockFetchActiveByIdsForAgentLoop).toHaveBeenCalledWith(
      auth,
      ["skill-id"],
      {
        agentConfiguration,
        agentMessage,
        conversation: conversationWithEarlierSkill,
        userMessage,
      }
    );
    expect(mockEnableForAgent).toHaveBeenCalled();
  });

  it("enables skills explicitly referenced before the latest compaction", async () => {
    const earlierUserMessage = {
      ...userMessage,
      content: '<skill id="skill-id" name="commit" />',
      rank: 1,
      sId: "earlier-user-message-id",
    };
    const compactionMessage: TestCompactionMessage = {
      content: "Earlier messages summarized.",
      sId: "compaction-message-id",
      status: "succeeded",
      type: "compaction_message",
      visibility: "visible",
    };
    const conversationWithCompaction = {
      ...conversation,
      content: [[earlierUserMessage], [compactionMessage], [userMessage]],
    };
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });
    mockFetchActiveByIdsForAgentLoop.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        conversationOverride: conversationWithCompaction,
      })
    );

    expect(result.isOk()).toBe(true);
    expect(mockFetchActiveByIdsForAgentLoop).toHaveBeenCalledWith(
      auth,
      ["skill-id"],
      {
        agentConfiguration,
        agentMessage,
        conversation: conversationWithCompaction,
        userMessage,
      }
    );
    expect(mockEnableForAgent).toHaveBeenCalled();
  });

  it("does not enable skills referenced by later user messages", async () => {
    const laterUserMessage = {
      ...userMessage,
      content: '<skill id="skill-id" name="commit" />',
      rank: 3,
      sId: "later-user-message-id",
    };
    const conversationWithLaterSkill = {
      ...conversation,
      content: [[userMessage], [laterUserMessage]],
    };
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        conversationOverride: conversationWithLaterSkill,
      })
    );

    expect(result.isErr()).toBe(true);
    expect(mockFetchActiveByIdsForAgentLoop).toHaveBeenCalledWith(auth, [], {
      agentConfiguration,
      agentMessage,
      conversation: conversationWithLaterSkill,
      userMessage,
    });
    expect(mockEnableForAgent).not.toHaveBeenCalled();
  });
});
