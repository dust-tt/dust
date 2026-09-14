import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { isEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnableForAgent,
  mockBatchFetchUsedBySkills,
  mockFetchByName,
  mockFetchByIds,
  mockHasFiles,
  mockListForAgentLoop,
  mockUpsertSkillFilesToConversation,
} = vi.hoisted(() => ({
  mockEnableForAgent: vi.fn(),
  mockBatchFetchUsedBySkills: vi.fn(),
  mockFetchByName: vi.fn(),
  mockFetchByIds: vi.fn(),
  mockHasFiles: vi.fn(),
  mockListForAgentLoop: vi.fn(),
  mockUpsertSkillFilesToConversation: vi.fn(),
}));

vi.mock("@app/lib/api/skills/conversation_files", () => ({
  upsertSkillFilesToConversation: mockUpsertSkillFilesToConversation,
}));

vi.mock("@app/lib/resources/skill/skill_resource", () => ({
  SkillResource: {
    batchFetchUsedBySkills: mockBatchFetchUsedBySkills,
    fetchByName: mockFetchByName,
    fetchByIds: mockFetchByIds,
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
    hasFiles: mockHasFiles,
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockBatchFetchUsedBySkills.mockResolvedValue(new Map());
    mockFetchByName.mockResolvedValue(null);
    mockFetchByIds.mockResolvedValue([]);
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: false });
    mockHasFiles.mockReturnValue(true);
    mockUpsertSkillFilesToConversation.mockResolvedValue(
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
      runContext: {
        contextType: "agent_loop",
        agentConfiguration,
        agentMessage,
        conversation: conversationOverride,
        userMessage: userMessageOverride,
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
    expect(mockUpsertSkillFilesToConversation).toHaveBeenCalledWith(auth, {
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
    mockHasFiles.mockReturnValue(false);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockUpsertSkillFilesToConversation).not.toHaveBeenCalled();
  });

  it("enables a favorite-only skill", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      favoriteSkills: [skill],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockEnableForAgent).toHaveBeenCalled();
  });

  it("returns a distinct mount-failure error when a newly enabled skill's file copy fails, without leaving it reported as ready", async () => {
    mockUpsertSkillFilesToConversation.mockResolvedValue(
      new Err(
        new Error(
          "Failed to write skill file(s): conversation-conversation-id/skills/commit/sf_query.py (socket hang up)"
        )
      )
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        'Failed to mount files for skill "commit"'
      );
      expect(result.error.message).toContain(
        "conversation-conversation-id/skills/commit/sf_query.py"
      );
    }
    // The skill must not be persisted as enabled until the mount is confirmed.
    expect(mockEnableForAgent).not.toHaveBeenCalled();
  });

  it("retries the file mount when the skill was already enabled but still has files to load", async () => {
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: true });
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [skill],
      equippedSkills: [],
      favoriteSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockUpsertSkillFilesToConversation).toHaveBeenCalledWith(auth, {
      skill,
      conversation,
    });
    if (result.isOk()) {
      const [output] = result.value;
      if (!isEnableSkillResultOutput(output)) {
        throw new Error("Expected an enable_skill resource output");
      }
      expect(output.resource.text).toContain("was already enabled");
      expect(output.resource.text).toContain(
        "conversation-conversation-id/skills/commit/SKILL.md"
      );
    }
  });

  it("returns a mount-failure error on retry when an already-enabled skill's files are still missing", async () => {
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: true });
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [skill],
      equippedSkills: [],
      favoriteSkills: [],
      systemSkills: [],
    });
    mockUpsertSkillFilesToConversation.mockResolvedValue(
      new Err(
        new Error(
          "Failed to write skill file(s): conversation-conversation-id/skills/commit/config/queries.json (ENOENT)"
        )
      )
    );

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        'Failed to mount files for skill "commit"'
      );
      expect(result.error.message).toContain("config/queries.json");
    }
  });

  it("does not retry the file mount when the already-enabled skill has no files", async () => {
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: true });
    mockHasFiles.mockReturnValue(false);
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [skill],
      equippedSkills: [],
      favoriteSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(mockUpsertSkillFilesToConversation).not.toHaveBeenCalled();
  });

  it("does not enable skills outside the agent loop allow-list and reports a not-found error", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [],
      favoriteSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not found");
    }
    expect(mockEnableForAgent).not.toHaveBeenCalled();
    expect(mockUpsertSkillFilesToConversation).not.toHaveBeenCalled();
  });

  it("enables skills referenced by current root skills", async () => {
    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [parentSkill],
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByName.mockResolvedValue(skill);
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
    expect(mockFetchByName).toHaveBeenCalledWith(auth, "commit", {
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByName.mockResolvedValue(skill);
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByName.mockResolvedValue(skill);
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByIds.mockResolvedValue([parentSkill]);
    mockFetchByName.mockResolvedValue(skill);
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByIds.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        userMessageOverride: currentUserMessage,
      })
    );

    expect(result.isOk()).toBe(true);
    expect(mockFetchByIds).toHaveBeenCalledWith(auth, ["skill-id"], {
      agentLoopData: {
        agentConfiguration,
        agentMessage,
        conversation,
        userMessage: currentUserMessage,
      },
      onlyActive: true,
    });
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByIds.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        conversationOverride: conversationWithEarlierSkill,
      })
    );

    expect(result.isOk()).toBe(true);
    expect(mockFetchByIds).toHaveBeenCalledWith(auth, ["skill-id"], {
      agentLoopData: {
        agentConfiguration,
        agentMessage,
        conversation: conversationWithEarlierSkill,
        userMessage,
      },
      onlyActive: true,
    });
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
      favoriteSkills: [],
      systemSkills: [],
    });
    mockFetchByIds.mockResolvedValue([skill]);

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        conversationOverride: conversationWithCompaction,
      })
    );

    expect(result.isOk()).toBe(true);
    expect(mockFetchByIds).toHaveBeenCalledWith(auth, ["skill-id"], {
      agentLoopData: {
        agentConfiguration,
        agentMessage,
        conversation: conversationWithCompaction,
        userMessage,
      },
      onlyActive: true,
    });
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
      favoriteSkills: [],
      systemSkills: [],
    });

    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({
        conversationOverride: conversationWithLaterSkill,
      })
    );

    expect(result.isErr()).toBe(true);
    expect(mockFetchByIds).toHaveBeenCalledWith(auth, [], {
      agentLoopData: {
        agentConfiguration,
        agentMessage,
        conversation: conversationWithLaterSkill,
        userMessage,
      },
      onlyActive: true,
    });
    expect(mockEnableForAgent).not.toHaveBeenCalled();
  });
});
