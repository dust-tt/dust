import {
  deleteOngoingAgentLoop,
  listOngoingAgentLoops,
  upsertOngoingAgentLoop,
} from "@app/lib/api/assistant/ongoing_agent_loops";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ongoing agent loop registry", () => {
  beforeEach(() => {
    redisMock.reset();
    vi.mocked(getRedisStreamClient).mockClear();
  });

  it("upserts and deletes loops within a workspace-user registry", async () => {
    const identity = { workspaceId: "w_1", userId: "u_1" };
    await upsertOngoingAgentLoop({
      ...identity,
      conversationId: "conv_2",
      messageId: "msg_2",
    });
    await upsertOngoingAgentLoop({
      ...identity,
      conversationId: "conv_1",
      messageId: "msg_1",
    });
    await upsertOngoingAgentLoop({
      ...identity,
      conversationId: "conv_updated",
      messageId: "msg_1",
    });
    await upsertOngoingAgentLoop({
      workspaceId: "w_1",
      userId: "u_2",
      conversationId: "conv_other",
      messageId: "msg_other",
    });

    expect(await listOngoingAgentLoops(identity)).toEqual([
      { conversationId: "conv_updated", messageId: "msg_1" },
      { conversationId: "conv_2", messageId: "msg_2" },
    ]);

    await deleteOngoingAgentLoop({ ...identity, messageId: "msg_1" });
    await deleteOngoingAgentLoop({ ...identity, messageId: "msg_1" });

    expect(await listOngoingAgentLoops(identity)).toEqual([
      { conversationId: "conv_2", messageId: "msg_2" },
    ]);
    expect(getRedisStreamClient).toHaveBeenCalledWith({
      origin: "agent_loop_registry",
    });
  });
});
