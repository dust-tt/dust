import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { isEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnableForAgent,
  mockGetFileAttachments,
  mockListForAgentLoop,
  mockLoadSkillFilesToConversation,
} = vi.hoisted(() => ({
  mockEnableForAgent: vi.fn(),
  mockGetFileAttachments: vi.fn(),
  mockListForAgentLoop: vi.fn(),
  mockLoadSkillFilesToConversation: vi.fn(),
}));

vi.mock("@app/lib/api/skills/conversation_files", () => ({
  loadSkillFilesToConversation: mockLoadSkillFilesToConversation,
}));

vi.mock("@app/lib/resources/skill/skill_resource", () => ({
  SkillResource: {
    listForAgentLoop: mockListForAgentLoop,
  },
}));

import { TOOLS } from "./index";

describe("skill_management enable_skill tool", () => {
  const auth = {};
  const agentConfiguration = { sId: "agent-id" };
  const agentMessage = { sId: "agent-message-id" };
  const conversation = { sId: "conversation-id" };
  const userMessage = { sId: "user-message-id" };
  const skill = {
    enableForAgent: mockEnableForAgent,
    getFileAttachments: mockGetFileAttachments,
    name: "commit",
    sId: "skill-id",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockListForAgentLoop.mockResolvedValue({
      enabledSkills: [],
      equippedSkills: [skill],
      systemSkills: [],
    });
    mockEnableForAgent.mockResolvedValue({ wasAlreadyEnabled: false });
    mockGetFileAttachments.mockReturnValue([{ fileName: "SKILL.md" }]);
    mockLoadSkillFilesToConversation.mockResolvedValue(
      new Ok({
        loadedPaths: ["conversation-conversation-id/skills/commit/SKILL.md"],
      })
    );
  });

  function makeExtra({
    withUserMessage = true,
  }: {
    withUserMessage?: boolean;
  } = {}) {
    return {
      auth,
      agentLoopContext: {
        runContext: {
          agentConfiguration,
          agentMessage,
          conversation,
          ...(withUserMessage ? { userMessage } : {}),
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

  it("does not fall back to a broader allow-list without user message context", async () => {
    const result = await getTool().handler(
      { skillName: "commit" },
      makeExtra({ withUserMessage: false })
    );

    expect(result.isErr()).toBe(true);
    expect(mockListForAgentLoop).not.toHaveBeenCalled();
    expect(mockEnableForAgent).not.toHaveBeenCalled();
    expect(mockLoadSkillFilesToConversation).not.toHaveBeenCalled();
  });
});
