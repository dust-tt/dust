import { fetchFeedbackExportRows } from "@app/lib/api/analytics/feedback_export";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ModelId } from "@app/types/shared/model_id";
import moment from "moment-timezone";
import { describe, expect, it, vi } from "vitest";

// fetchAgentMetadata reads from the read replica; in tests there is no
// replica so point it at the primary test connection.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

describe("fetchFeedbackExportRows", () => {
  it("reads feedback from Postgres, resolving agent name, user sId/email, and the conversation URL", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv.id as ModelId,
      rank: 0,
      agentConfigurationId: agent.sId,
    });

    const feedback = await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      conversationId: conv.id as ModelId,
      agentMessageId: messageRow.agentMessageId!,
      userId: user.id,
      thumbDirection: "up",
      content: "Great answer",
      isConversationShared: true,
      dismissed: false,
    });

    const today = moment.utc();
    const result = await fetchFeedbackExportRows({
      owner: workspace,
      startDate: today.clone().subtract(1, "day").format("YYYY-MM-DD"),
      endDate: today.clone().add(1, "day").format("YYYY-MM-DD"),
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toEqual({
      feedbackId: feedback.sId,
      createdAt: moment(feedback.createdAt).utc().format("YYYY-MM-DD HH:mm:ss"),
      assistantId: agent.sId,
      assistantName: "Test Agent",
      conversationUrl: expect.stringContaining(conv.sId),
      userId: user.sId,
      userEmail: user.email ?? "",
      thumb: "up",
      content: "Great answer",
      dismissed: "false",
    });
  });

  it("returns an empty array when there is no feedback in the requested window", async () => {
    const { workspace } = await createResourceTest({ role: "builder" });

    const result = await fetchFeedbackExportRows({
      owner: workspace,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([]);
  });
});
