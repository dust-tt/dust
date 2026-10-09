import { Authenticator } from "@app/lib/auth";
import { FileModel } from "@app/lib/resources/storage/models/files";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

describe("POST /api/v1/w/[wId]/assistant/conversations/[cId]/content_fragments", () => {
  it("returns 409 without storing a file when another user owns an active wake-up", async () => {
    vi.spyOn(
      wakeUpClient,
      "launchOrScheduleWakeUpTemporalWorkflow"
    ).mockResolvedValue(new Ok(undefined));

    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const owner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, owner, { role: "user" });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      owner.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(ownerAuth);
    const conversation = await ConversationFactory.create(ownerAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    await WakeUpFactory.cron(ownerAuth, conversation, agent);

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/conversations/${conversation.sId}/content_fragments`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key.secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Inline content",
          content: "Some text",
          contentType: "text/plain",
          url: null,
        }),
      }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.type).toBe("conversation_locked");
    expect(
      await FileModel.count({ where: { workspaceId: workspace.id } })
    ).toBe(0);
  });
});
