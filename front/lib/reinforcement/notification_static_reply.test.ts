import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createSkillSuggestionsConversation } from "@app/lib/reinforcement/aggregate_suggestions";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { NOOP_MODEL_ID } from "@app/types/assistant/models/noop";
import { describe, expect, it } from "vitest";

describe("reinforced skill notification static reply", () => {
  it("pins the noop model with the static response for the dust echo", async () => {
    const { authenticator: auth, user } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(auth, {
      name: "Test Skill",
    });

    await SkillSuggestionFactory.create(auth, skill, {
      source: "reinforcement",
      state: "pending",
    });

    await createSkillSuggestionsConversation(auth, skill, [user.toJSON()]);

    const conversations = await ConversationResource.listAll(auth);
    expect(conversations.length).toBeGreaterThan(0);
    const conversation = conversations[conversations.length - 1];

    const convRes = await getConversation(auth, conversation.sId);
    if (convRes.isErr()) {
      throw convRes.error;
    }

    const messages = convRes.value.content.flat();
    const userMessage = messages.find(isUserMessageType);
    const agentMessage = messages.find(isAgentMessageType);
    expect(userMessage?.context.origin).toBe("reinforced_skill_notification");
    expect(agentMessage).toBeDefined();

    const loopData = await getAgentLoopDataWithAuth(auth, {
      agentMessageId: agentMessage!.sId,
      agentMessageVersion: agentMessage!.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      conversationBranchId: null,
      userMessageId: userMessage!.sId,
      userMessageVersion: userMessage!.version,
    });
    if (loopData.isErr()) {
      throw loopData.error;
    }

    // The dust agent must echo the canned user message as a static reply: the
    // run must be pinned on the noop model (never the creation-time resolved
    // model) and carry the canned text as `staticResponse`.
    const { modelInfo } = loopData.value;
    expect(modelInfo.endpoint.model).toBe(NOOP_MODEL_ID);
    expect(modelInfo.metaData?.staticResponse).toBe(userMessage!.content);
  });
});
