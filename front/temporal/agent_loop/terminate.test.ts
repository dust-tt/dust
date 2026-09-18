import {
  listOngoingAgentLoops,
  upsertOngoingAgentLoop,
} from "@app/lib/api/assistant/ongoing_agent_loops";
import { terminateAllAgentLoopWorkflowsForConversation } from "@app/temporal/agent_loop/terminate";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { terminate } = vi.hoisted(() => ({ terminate: vi.fn() }));

vi.mock("@app/lib/temporal", () => ({
  getTemporalClientForAgentNamespace: vi.fn().mockResolvedValue({
    workflow: {
      getHandle: vi.fn().mockReturnValue({ terminate }),
      list: vi.fn().mockImplementation(async function* () {
        yield {
          workflowId: "workflow_1",
          memo: {
            agentMessageId: "msg_1",
            userId: "u_1",
            workspaceId: "w_1",
          },
        };
      }),
    },
  }),
}));

describe("terminateAllAgentLoopWorkflowsForConversation", () => {
  beforeEach(() => {
    redisMock.reset();
    terminate.mockReset();
  });

  it("removes terminated workflows from the ongoing-loop registry", async () => {
    const identity = { workspaceId: "w_1", userId: "u_1" };
    await upsertOngoingAgentLoop({
      ...identity,
      conversationId: "conv_1",
      messageId: "msg_1",
    });

    await terminateAllAgentLoopWorkflowsForConversation("conv_1");

    expect(terminate).toHaveBeenCalledWith(
      "Conversation blocked via kill switch"
    );
    expect(await listOngoingAgentLoops(identity)).toEqual([]);
  });
});
