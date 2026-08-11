import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { listAgentMessageRefs } from "@app/scripts/backfill_agent_message_consumption_analytics";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it, vi } from "vitest";

// Import the script's query without executing its CLI entrypoint.
vi.mock("@app/scripts/helpers", () => ({ makeScript: vi.fn() }));

describe("listAgentMessageRefs", () => {
  it("includes messages from deleted conversations", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const completedAt = new Date("2026-08-05T12:00:00.000Z");
    const activeConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [completedAt],
      visibility: "unlisted",
    });
    const deletedConversation = await ConversationFactory.create(
      authenticator,
      {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [completedAt],
        visibility: "deleted",
      }
    );
    await AgentMessageModel.update(
      {
        completedAt,
        costCredits: 5,
        runIds: ["run-0"],
        status: "succeeded",
      },
      {
        where: {
          conversationId: [activeConversation.id, deletedConversation.id],
          workspaceId: workspace.id,
        },
      }
    );

    const candidates = await listAgentMessageRefs({
      afterAgentMessageModelId: 0,
      batchSize: 10,
      fromDate: new Date("2026-08-05T00:00:00.000Z"),
      toDate: new Date("2026-08-06T00:00:00.000Z"),
      workspace,
    });

    expect(
      candidates.map((candidate) => candidate.message.conversationId)
    ).toEqual([activeConversation.sId, deletedConversation.sId]);
  });
});
