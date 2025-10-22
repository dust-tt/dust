import { CancelledFailure, heartbeat, sleep } from "@temporalio/activity";

import type { LLM } from "@app/lib/api/llm/llm";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type {
  GetOutputInput,
  GetOutputResponse,
} from "@app/temporal/agent_loop/lib/types";
import { Err, Ok } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

export async function getOutputFromLLMStream(
  auth: Authenticator,
  {
    modelConversationRes,
    conversation,
    specifications,
    flushParserTokens,
    contentParser,
    agentMessageRow,
    step,
    agentConfiguration,
    agentMessage,
    prompt,
    llm,
  }: GetOutputInput & { llm: LLM }
): Promise<GetOutputResponse> {
  const events = await llm.stream({
    conversation: modelConversationRes.value.modelConversation,
    prompt,
    specifications,
    step,
  });

  const tempContents: Array<
    TextContentType | FunctionCallContentType | ReasoningContentType
  > = [];
  const tempActions: Array<{
    functionCallId: string;
    name: string | null;
    arguments: Record<string, string | boolean | number> | null;
  }> = [];
  let generation = "";
  let nativeChainOfThought = "";

  for await (const event of events) {
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

    switch (event.type) {
      case "text_delta": {
        for await (const tokenEvent of contentParser.emitTokens(
          event.content.delta
        )) {
          await updateResourceAndPublishEvent(auth, {
            event: tokenEvent,
            agentMessageRow,
            conversation,
            step,
          });
        }
        continue;
      }
      case "reasoning_delta": {
        await updateResourceAndPublishEvent(auth, {
          event: {
            type: "generation_tokens",
            classification: "chain_of_thought",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            text: event.content.delta,
          },
          agentMessageRow,
          conversation,
          step,
        });

        nativeChainOfThought += event.content.delta;
        continue;
      }
      case "reasoning_generated": {
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

        nativeChainOfThought += "\n\n";
        continue;
      }
      default:
        break;
    }

    if (event.type === "tool_call") {
      const args = JSON.parse(event.content.arguments);
      tempActions.push({
        name: event.content.name,
        functionCallId: event.content.id,
        arguments: args,
      });
      tempContents.push({
        type: "function_call",
        value: {
          // TODO require id
          id: event.content.id ?? "",
          name: event.content.name,
          arguments: event.content.arguments,
        },
      });
    }

    if (event.type === "text_generated") {
      tempContents.push({
        type: "text_content",
        value: event.content.text,
      });
      generation += event.content.text;
    }
  }

  await flushParserTokens();

  if (tempContents.length === 0 && tempActions.length === 0) {
    return new Err({
      type: "shouldRetryMessage",
      message: "Agent execution didn't complete.",
    });
  }

  return new Ok({
    output: {
      actions: tempActions,
      generation,
      contents: tempContents,
    },
    nativeChainOfThought,
    // Later we will send another id that will enable debugging
    dustRunId: "",
  });
}
