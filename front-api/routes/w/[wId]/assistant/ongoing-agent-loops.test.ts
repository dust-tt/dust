import { upsertOngoingAgentLoop } from "@app/lib/api/assistant/ongoing_agent_loops";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/w/[wId]/assistant/ongoing-agent-loops", () => {
  beforeEach(async () => {
    redisMock.reset();
    const { getWorkOSSessionWithSetCookies } = await import(
      "@app/lib/api/workos/user"
    );
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: undefined,
      setCookies: [],
    });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await honoApp.request(
      "/api/w/w_unauthenticated/assistant/ongoing-agent-loops"
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { type: "not_authenticated" },
    });
  });

  it("returns only loops registered for the authenticated user", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const otherUser = await UserFactory.basic();
    await upsertOngoingAgentLoop({
      workspaceId: workspace.sId,
      userId: user.sId,
      conversationId: "conv_1",
      messageId: "msg_1",
    });
    await upsertOngoingAgentLoop({
      workspaceId: workspace.sId,
      userId: otherUser.sId,
      conversationId: "conv_2",
      messageId: "msg_2",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/ongoing-agent-loops`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      agentLoops: [{ conversationId: "conv_1", messageId: "msg_1" }],
    });
  });
});
