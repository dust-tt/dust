import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: () => false,
  checkProgrammaticUsageLimits: vi.fn(),
}));

import handler from "./index";

describe("POST /api/v1/w/[wId]/assistant/conversations/[cId]/messages", () => {
  it("returns 401 when an API key (no user) sends selectedMCPServerViewIds", async () => {
    const { req, res, workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations/${conversation.sId}/messages`;
    req.query = { wId: workspace.sId, cId: conversation.sId };
    req.headers.authorization = `Bearer ${key.secret}`;
    req.body = {
      content: "Hello",
      mentions: [],
      context: {
        username: "tester",
        timezone: "Europe/Paris",
        origin: "api",
        selectedMCPServerViewIds: ["msv_abcdef123456"],
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Selecting MCP server views is only available to authenticated users.",
      },
    });
  });

  it("returns 400 when the request body fails schema validation", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations/${conversation.sId}/messages`;
    req.query = { wId: workspace.sId, cId: conversation.sId };
    req.body = { content: "missing mentions and context" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});
