import { CancelledFailure, heartbeat, sleep } from "@temporalio/activity";

import {
  isDustAppChatBlockType,
  runActionStreamed,
} from "@app/lib/actions/server";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type {
  GetOutputInput,
  GetOutputResponse,
  Output,
} from "@app/temporal/agent_loop/lib/types";
import { Err, Ok } from "@app/types";
import type { ReasoningContentType } from "@app/types/assistant/agent_message_content";

export async function getOutputFromAction(
  auth: Authenticator,
  {
    modelConversationRes,
    conversation,
    userMessage,
    runConfig,
    specifications,
    flushParserTokens,
    contentParser,
    agentMessageRow,
    step,
    agentConfiguration,
    agentMessage,
    model,
    publishAgentError,
    prompt,
  }: GetOutputInput
): Promise<GetOutputResponse> {
  let blockExecutionOutput: Output | null = null;
  let blockExecutionNativeChainOfThought = "";

  const res = await runActionStreamed(
    auth,
    "assistant-v2-multi-actions-agent",
    runConfig,
    [
      {
        conversation: modelConversationRes.value.modelConversation,
        specifications,
        prompt,
      },
    ],
    {
      conversationId: conversation.sId,
      workspaceId: conversation.owner.sId,
      userMessageId: userMessage.sId,
    }
  );

  if (res.isErr()) {
    return new Err({ type: "shouldRetryMessage", message: res.error.message });
  }

  const { eventStream, dustRunId: blockExecutionDustRunId } = res.value;

  let isGeneration = true;

  for await (const event of eventStream) {
    if (event.type === "function_call") {
      isGeneration = false;
    }

    if (event.type === "error") {
      await flushParserTokens();
      return new Err({
        type: "shouldRetryMessage",
        message: event.content.message,
      });
    }

    // Heartbeat & sleep allow the activity to be cancelled, e.g. on a "Stop
    // agent" request. Upon experimentation, both are needed to ensure the
    // activity receives the cancellation signal. The delay until which is the
    // signal is received is governed by heartbeat
    // [throttling](https://docs.temporal.io/encyclopedia/detecting-activity-failures#throttling).
    heartbeat();
    try {
      await sleep(1);
    } catch (err) {
      if (err instanceof CancelledFailure) {
        logger.info("Activity cancelled, stopping");
        return new Err({ type: "shouldReturnNull" });
      }
      throw err;
    }

    if (event.type === "tokens" && isGeneration) {
      for await (const tokenEvent of contentParser.emitTokens(
        event.content.tokens.text
      )) {
        await updateResourceAndPublishEvent(auth, {
          event: tokenEvent,
          agentMessageRow,
          conversation,
          step,
        });
      }
    }

    if (event.type === "reasoning_tokens") {
      await updateResourceAndPublishEvent(auth, {
        event: {
          type: "generation_tokens",
          classification: "chain_of_thought",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          text: event.content.tokens.text,
        },
        agentMessageRow,
        conversation,
        step,
      });

      blockExecutionNativeChainOfThought += event.content.tokens.text;
    }

    if (event.type === "reasoning_item") {
      await updateResourceAndPublishEvent(auth, {
        event: {
          type: "generation_tokens",
          classification: "chain_of_thought",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          text: "\n\n",
        },
        agentMessageRow,
        conversation,
        step,
      });

      blockExecutionNativeChainOfThought += "\n\n";
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        await flushParserTokens();
        return new Err({ type: "shouldRetryMessage", message: e.error });
      }

      if (event.content.block_name === "MODEL" && e.value) {
        // Flush early as we know the generation is terminated here.
        await flushParserTokens();

        const block = e.value;
        if (!isDustAppChatBlockType(block)) {
          return new Err({
            type: "shouldRetryMessage",
            message: "Received unparsable MODEL block.",
          });
        }

        // Extract token usage from block execution metadata
        const meta = e.meta as {
          token_usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            reasoning_tokens?: number;
            cached_tokens?: number;
          };
        } | null;
        const reasoningTokens = meta?.token_usage?.reasoning_tokens ?? 0;

        // Pass the current region, which helps decide whether encrypted blocks are usable
        const currentRegion = regionsConfig.getCurrentRegion();
        let region: "us" | "eu";
        switch (currentRegion) {
          case "europe-west1":
            region = "eu";
            break;
          case "us-central1":
            region = "us";
            break;
          default:
            throw new Error(`Unexpected region: ${currentRegion}`);
        }

        const contents = (block.message.contents ?? []).map((content) => {
          if (content.type === "reasoning") {
            return {
              ...content,
              value: {
                ...content.value,
                tokens: 0, // Will be updated for the last reasoning item
                provider: model.providerId,
                region,
              },
            } satisfies ReasoningContentType;
          }
          return content;
        });

        // We unfortunately don't currently have a proper breakdown of reasoning tokens per item,
        // so we set the reasoning token count on the last reasoning item.
        for (let i = contents.length - 1; i >= 0; i--) {
          const content = contents[i];
          if (content.type === "reasoning") {
            content.value.tokens = reasoningTokens;
            contents[i] = content;
            break;
          }
        }

        blockExecutionOutput = {
          actions: [],
          generation: null,
          contents,
        };

        if (block.message.function_calls?.length) {
          for (const fc of block.message.function_calls) {
            try {
              const args = JSON.parse(fc.arguments);
              blockExecutionOutput.actions.push({
                name: fc.name,
                functionCallId: fc.id,
                arguments: args,
              });
            } catch (error) {
              await publishAgentError({
                code: "function_call_error",
                message: `Error parsing function call arguments: ${error}`,
                metadata: null,
              });
              return new Err({ type: "shouldReturnNull" });
            }
          }
        } else {
          blockExecutionOutput.generation = block.message.content ?? null;
        }
      }
    }
  }

  await flushParserTokens();

  if (!blockExecutionOutput) {
    return new Err({
      type: "shouldRetryMessage",
      message: "Agent execution didn't complete.",
    });
  }

  return new Ok({
    output: blockExecutionOutput,
    dustRunId: await blockExecutionDustRunId,
    nativeChainOfThought: blockExecutionNativeChainOfThought,
  });
}
