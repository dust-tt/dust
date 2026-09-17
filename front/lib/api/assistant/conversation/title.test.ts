import { ensureConversationTitleFromAgentLoop } from "@app/lib/api/assistant/conversation/title";
import type { AuthenticatorType } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getAgentLoopRuntimeData } from "@app/types/assistant/agent_run";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { Err } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/types/assistant/agent_run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/types/assistant/agent_run")>()),
  getAgentLoopRuntimeData: vi.fn(),
}));

function agentLoopArgs(userMessageOrigin: UserMessageOrigin): AgentLoopArgs {
  return {
    agentMessageId: "am123",
    agentMessageVersion: 0,
    conversationId: "c123",
    conversationTitle: null,
    userMessageId: "um123",
    userMessageOrigin,
    userMessageVersion: 0,
  };
}

describe("ensureConversationTitleFromAgentLoop", () => {
  let authType: AuthenticatorType;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticator } = await createResourceTest({});
    authType = authenticator.toJSON();
  });

  it("returns null without loading runtime data for an analytics panel opening message", async () => {
    const title = await ensureConversationTitleFromAgentLoop(
      authType,
      agentLoopArgs("analytics_panel")
    );

    expect(title).toBeNull();
    expect(getAgentLoopRuntimeData).not.toHaveBeenCalled();
  });

  it("loads runtime data for a message sent from the web app", async () => {
    vi.mocked(getAgentLoopRuntimeData).mockResolvedValue(
      new Err(new Error("runtime data unavailable"))
    );

    await expect(
      ensureConversationTitleFromAgentLoop(authType, agentLoopArgs("web"))
    ).rejects.toThrow("runtime data unavailable");

    expect(getAgentLoopRuntimeData).toHaveBeenCalledOnce();
  });
});
