import { CancelledFailure, heartbeat, sleep } from "@temporalio/activity";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AgentMessageContentParser } from "@app/lib/api/assistant/agent_message_content_parser";
import type { Authenticator } from "@app/lib/auth";
import type { LLM } from "@app/lib/llm/llm";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { GetOutputFromStreamResponse } from "@app/temporal/agent_loop/lib/types";
import type {
  AgentMessageType,
  ConversationType,
  ModelConversationTypeMultiActions,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

export async function getOutputFromLLMStream(
  auth: Authenticator,
  {
    llm,
    modelConversation,
    prompt,
    specifications,
    conversation,
    runAgentData,
    agentMessage,
    contentParser,
    flushParserTokens,
    step,
  }: {
    llm: LLM;
    modelConversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
    conversation: ConversationType;
    runAgentData: AgentLoopExecutionData;
    agentMessage: AgentMessageType;
    contentParser: AgentMessageContentParser;
    flushParserTokens: () => Promise<void>;
    step: number;
  }
): Promise<Result<GetOutputFromStreamResponse | null, Error>> {
  const { agentConfiguration, agentMessageRow } = runAgentData;

  const events = await llm.stream({
    conversation: modelConversation,
    prompt,
    specifications,
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
      return new Err(new Error(event.content.message));
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
        return new Ok(null);
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
    return new Err(new Error("Agent execution didn't complete."));
  }

  return new Ok({
    output: {
      actions: tempActions,
      generation,
      contents: tempContents,
    },
    nativeChainOfThought,
    dustRunId: Promise.resolve(""),
  });
}
