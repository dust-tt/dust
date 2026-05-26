import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnableForAgent,
  mockEnsureSandboxReady,
  mockFetchActiveByName,
  mockGetFeatureFlags,
  mockLoadSkillFiles,
} = vi.hoisted(() => ({
  mockEnableForAgent: vi.fn(),
  mockEnsureSandboxReady: vi.fn(),
  mockFetchActiveByName: vi.fn(),
  mockGetFeatureFlags: vi.fn(),
  mockLoadSkillFiles: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  getFeatureFlags: mockGetFeatureFlags,
}));

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensureSandboxReady: mockEnsureSandboxReady,
}));

vi.mock("@app/lib/resources/skill/skill_resource", () => ({
  SkillResource: {
    fetchActiveByName: mockFetchActiveByName,
  },
}));

import { TOOLS } from "./index";

describe("skill_management enable_skill tool", () => {
  const auth = {};
  const agentConfiguration = { sId: "agent-id" };
  const conversation = { sId: "conversation-id" };
  const skill = {
    enableForAgent: mockEnableForAgent,
    getFileAttachments: () => [{ fileId: "file-id" }],
    name: "commit",
    sId: "skill-id",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetchActiveByName.mockResolvedValue(skill);
    mockEnableForAgent.mockResolvedValue(new Ok({ alreadyEnabled: false }));
    mockGetFeatureFlags.mockResolvedValue(["sandbox_tools"]);
    mockEnsureSandboxReady.mockResolvedValue(
      new Ok({
        sandbox: {
          loadSkillFiles: mockLoadSkillFiles,
        },
        freshlyCreated: false,
      })
    );
    mockLoadSkillFiles.mockResolvedValue(
      new Ok({ loadedPaths: ["/home/agent/.skills/commit/SKILL.md"] })
    );
  });

  function makeExtra() {
    return {
      auth,
      agentLoopContext: {
        runContext: {
          agentConfiguration,
          conversation,
        },
      },
      signal: new AbortController().signal,
    } as never;
  }

  it("ensures the sandbox lifecycle has run before loading skill files", async () => {
    const tool = TOOLS.find((tool) => tool.name === ENABLE_SKILL_TOOL_NAME);
    if (!tool) {
      throw new Error("enable_skill tool not found");
    }

    const result = await tool.handler({ skillName: "commit" }, makeExtra());

    expect(result.isOk()).toBe(true);
    expect(mockEnsureSandboxReady).toHaveBeenCalledWith(auth, conversation);
    expect(mockLoadSkillFiles).toHaveBeenCalledWith(auth, skill);
    expect(mockEnsureSandboxReady.mock.invocationCallOrder[0]).toBeLessThan(
      mockLoadSkillFiles.mock.invocationCallOrder[0]
    );
  });

  it("surfaces sandbox lifecycle errors", async () => {
    mockEnsureSandboxReady.mockResolvedValue(
      new Err(new Error("sandbox setup failed"))
    );

    const tool = TOOLS.find((tool) => tool.name === ENABLE_SKILL_TOOL_NAME);
    if (!tool) {
      throw new Error("enable_skill tool not found");
    }

    const result = await tool.handler({ skillName: "commit" }, makeExtra());

    expect(result.isErr()).toBe(true);
    expect(mockLoadSkillFiles).not.toHaveBeenCalled();
  });
});
