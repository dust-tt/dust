import { getLLM } from "@app/lib/api/llm";
import type { LlmConversationOptions } from "@app/lib/api/llm/batch_llm";
import {
  downloadBatchResultFromLlm,
  sendBatchCallToLlm,
  storeLlmResult,
  writeBatchUserMessages,
} from "@app/lib/api/llm/batch_llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it, vi } from "vitest";

// Mock the tokenizer to avoid CoreAPI dependency in tests.
vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(async (texts: string[]) => {
    return new Ok(texts.map((t) => t.length));
  }),
}));

const POLL_INTERVAL_MS = 5000;
const TEST_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour — batches can take a while

function makeUserMessage(
  text: string
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "user",
    name: "User",
    content: [{ type: "text", text }],
  };
}

function makeConversationOptions(
  question: string,
  overrides?: Partial<LlmConversationOptions>
): LlmConversationOptions {
  return {
    newMessages: [makeUserMessage(question)],
    prompt: "You are a helpful assistant. Be concise.",
    userContextOrigin: "api",
    specifications: [],
    ...overrides,
  };
}

async function setupTest(): Promise<{
  authenticator: Authenticator;
  workspace: LightWorkspaceType;
  llm: LLM;
  agentConfigurationId: string;
}> {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });

  const credentials = await getLlmCredentials(authenticator, {
    skipEmbeddingApiKeyRequirement: true,
  });

  const llm = await getLLM(authenticator, {
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    bypassFeatureFlag: true,
    credentials,
  });
  if (!llm) {
    throw new Error("Failed to create LLM");
  }

  const agentConfig =
    await AgentConfigurationFactory.createTestAgent(authenticator);

  return {
    authenticator,
    workspace,
    llm,
    agentConfigurationId: agentConfig.sId,
  };
}

async function awaitBatch(llm: LLM, batchId: string): Promise<void> {
  let status = await llm.getBatchStatus(batchId);
  while (status === "computing") {
    await setTimeoutAsync(POLL_INTERVAL_MS);
    status = await llm.getBatchStatus(batchId);
  }
  expect(status).toBe("ready");
}

/**
 * Batch LLM Storage Integration Tests
 *
 * These tests verify that sendBatchCallToLlm and downloadBatchResultFromLlm
 * correctly store conversations, messages, and step contents in the database.
 *
 * To run from the front directory:
 *
 *   NODE_ENV=test FRONT_DATABASE_URI="$FRONT_DATABASE_URI"_test \
 *     RUN_LLM_TEST=true RUN_LLM_TEST_WITH_DB=true \
 *     npx vitest --config lib/api/llm/tests/vite.config.js --run lib/api/llm/tests/batch_llm_store.test.ts
 */
describe.skipIf(process.env.RUN_LLM_TEST !== "true")(
  "Batch LLM Storage Integration Tests",
  () => {
    it(
      "sendBatchCallToLlm + downloadBatchResultFromLlm stores conversations, messages, and step contents",
      async () => {
        const { authenticator, workspace, llm, agentConfigurationId } =
          await setupTest();

        // --- Step 1: Send a batch with a single conversation ---
        const sendBatchResult = await sendBatchCallToLlm(authenticator, llm, [
          makeConversationOptions("What is 1+1? Reply with just the number.", {
            title: "Batch Store Test",
          }),
        ]);
        if (sendBatchResult.isErr()) {
          throw sendBatchResult.error;
        }
        const { batchId, conversationIds } = sendBatchResult.value;

        expect(batchId).toBeTruthy();
        expect(conversationIds).toHaveLength(1);
        const conversationId = conversationIds[0];

        // Verify conversation was created.
        const conversation = await ConversationResource.fetchById(
          authenticator,
          conversationId
        );
        expect(conversation).not.toBeNull();
        if (!conversation) {
          return;
        }
        expect(conversation.title).toBe("Batch Store Test");

        // Verify user message was stored.
        const userMessages = await MessageModel.findAll({
          where: {
            conversationId: conversation.id,
            workspaceId: workspace.id,
          },
          include: [
            {
              model: UserMessageModel,
              as: "userMessage",
              required: true,
            },
          ],
        });
        expect(userMessages).toHaveLength(1);
        expect(userMessages[0].userMessage?.content).toContain("1+1");
        expect(userMessages[0].rank).toBe(0);

        // --- Step 2: Poll until batch completes ---
        await awaitBatch(llm, batchId);

        // --- Step 3: Download results and store them ---
        const results = await downloadBatchResultFromLlm(
          authenticator,
          llm,
          batchId,
          conversationIds,
          agentConfigurationId
        );

        expect(results.events.size).toBe(1);
        const events = results.events.get(conversationId);
        expect(events).toBeDefined();

        // Verify the response contains "2".
        const textEvent = events?.find((e) => e.type === "text_generated");
        expect(textEvent).toBeDefined();
        if (textEvent?.type === "text_generated") {
          expect(textEvent.content.text.toLowerCase()).toContain("2");
        }

        // --- Step 4: Verify agent message was stored in DB ---
        const agentMessages = await MessageModel.findAll({
          where: {
            conversationId: conversation.id,
            workspaceId: workspace.id,
          },
          include: [
            {
              model: AgentMessageModel,
              as: "agentMessage",
              required: true,
            },
          ],
        });
        expect(agentMessages).toHaveLength(1);
        const agentMessageRow = agentMessages[0].agentMessage;
        expect(agentMessageRow).not.toBeNull();
        expect(agentMessageRow?.status).toBe("succeeded");
        expect(agentMessageRow?.agentConfigurationId).toBe(
          agentConfigurationId
        );
        // Agent message rank should be after the user message.
        expect(agentMessages[0].rank).toBe(1);
        // Parent should be the user message.
        expect(agentMessages[0].parentId).toBe(userMessages[0].id);

        // --- Step 5: Verify step contents were stored ---
        const stepContents =
          await AgentStepContentResource.fetchByAgentMessages(authenticator, {
            agentMessageIds: agentMessageRow ? [agentMessageRow.id] : [],
          });

        // Should have at least one text_content entry.
        const textContent = stepContents.find(
          (sc) => sc.type === "text_content"
        );
        expect(textContent).toBeDefined();
        expect(textContent?.step).toBe(0);
        expect(textContent?.version).toBe(0);
      },
      TEST_TIMEOUT_MS
    );

    it(
      "writeBatchUserMessages + storeLlmResult stores data for a streamed call",
      async () => {
        const { authenticator, workspace, llm, agentConfigurationId } =
          await setupTest();

        // Create conversation and user message.
        const writeResult = await writeBatchUserMessages(
          authenticator,
          makeConversationOptions("What is 2+2? Reply with just the number.", {
            title: "Stream Store Test",
          })
        );
        if (writeResult.isErr()) {
          throw writeResult.error;
        }
        const conversation = writeResult.value;

        // Build LLMStreamParameters for the streaming call.
        const streamParams: LLMStreamParameters = {
          conversation: {
            messages: [
              makeUserMessage("What is 2+2? Reply with just the number."),
            ],
          },
          prompt: "You are a helpful assistant. Be concise.",
          specifications: [],
        };

        // Stream the LLM call and collect events.
        const events = [];
        for await (const event of llm.stream(streamParams)) {
          events.push(event);
        }

        // Store the result.
        await storeLlmResult(
          authenticator,
          conversation,
          events,
          agentConfigurationId
        );

        // Verify conversation.
        expect(conversation.title).toBe("Stream Store Test");

        // Verify all messages in the conversation (1 user + 1 agent).
        const allMessages = await MessageModel.findAll({
          where: {
            conversationId: conversation.id,
            workspaceId: workspace.id,
          },
          order: [["rank", "ASC"]],
        });
        expect(allMessages).toHaveLength(2);
        expect(allMessages[0].userMessageId).not.toBeNull();
        expect(allMessages[1].agentMessageId).not.toBeNull();

        // Verify agent message status.
        const agentMessage = await AgentMessageModel.findOne({
          where: {
            id: allMessages[1].agentMessageId!,
            workspaceId: workspace.id,
          },
        });
        expect(agentMessage?.status).toBe("succeeded");

        // Verify step contents exist.
        const stepContents =
          await AgentStepContentResource.fetchByAgentMessages(authenticator, {
            agentMessageIds: agentMessage ? [agentMessage.id] : [],
          });

        expect(stepContents.length).toBeGreaterThan(0);

        const textContent = stepContents.find(
          (sc) => sc.type === "text_content"
        );
        expect(textContent).toBeDefined();
      },
      TEST_TIMEOUT_MS
    );

    it(
      "multi-turn: sendBatchCallToLlm reuses an existing conversation",
      async () => {
        const { authenticator, llm, agentConfigurationId } = await setupTest();

        // --- Turn 1: Send a first batch ---
        const sendBatchCallResult1 = await sendBatchCallToLlm(
          authenticator,
          llm,
          [
            makeConversationOptions(
              "Remember this number: 42. Just confirm you noted it.",
              { title: "Multi-turn Test" }
            ),
          ]
        );
        if (sendBatchCallResult1.isErr()) {
          throw sendBatchCallResult1.error;
        }
        const { batchId: batchId1, conversationIds: conversationIds1 } =
          sendBatchCallResult1.value;

        const conversationId = conversationIds1[0];

        await awaitBatch(llm, batchId1);

        // Download and store turn 1 results.
        await downloadBatchResultFromLlm(
          authenticator,
          llm,
          batchId1,
          conversationIds1,
          agentConfigurationId
        );

        // --- Turn 2: Send a follow-up on the same conversation ---
        const sendBatchCallResult2 = await sendBatchCallToLlm(
          authenticator,
          llm,
          [
            makeConversationOptions(
              "What was the number I told you to remember? Reply with just the number.",
              { existingConversationId: conversationId }
            ),
          ]
        );
        if (sendBatchCallResult2.isErr()) {
          throw sendBatchCallResult2.error;
        }
        const { batchId: batchId2, conversationIds: conversationIds2 } =
          sendBatchCallResult2.value;

        // The returned conversationId should be the same.
        expect(conversationIds2[0]).toBe(conversationId);

        await awaitBatch(llm, batchId2);

        // Download and store turn 2 results.
        const results2 = await downloadBatchResultFromLlm(
          authenticator,
          llm,
          batchId2,
          conversationIds2,
          agentConfigurationId
        );

        // The model should recall "42" from the previous turn.
        const events2 = results2.events.get(conversationId);
        expect(events2).toBeDefined();
        const textEvent2 = events2?.find((e) => e.type === "text_generated");
        expect(textEvent2).toBeDefined();
        if (textEvent2?.type === "text_generated") {
          expect(textEvent2.content.text).toContain("42");
        }
      },
      TEST_TIMEOUT_MS
    );
  }
);
