import { LLM } from "@app/lib/api/llm/llm";
import type {
  LLMEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
} from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamMetadata,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import { isTextContent } from "@app/types/assistant/generation";
import { NOOP_MODEL_ID } from "@app/types/assistant/models/noop";

const metadata = {
  clientId: "noop" as const,
  inferenceProvider: "noop",
  inferenceRegion: "global" as const,
  modelId: "noop" as const,
};

interface NoopRequest {
  type: "noop_request";
  lastUserMessageContent: string;
  staticResponse?: string;
}

// NoopLLM is a dummy LLM that can respond to special commands.
export class NoopLLM extends LLM<NoopRequest> {
  private readonly metaData?: Record<string, unknown>;
  private simulatedRunUsages: RunUsageType[] | null = null;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: "noop" }
  ) {
    super(auth, "noop", llmParameters);
    this.metaData = llmParameters.metaData;
  }

  protected buildStreamRequestPayload({
    conversation,
  }: LLMStreamParameters): NoopRequest {
    const staticResponse = this.metaData?.staticResponse;
    if (typeof staticResponse === "string") {
      return {
        type: "noop_request",
        lastUserMessageContent: "",
        staticResponse,
      };
    }

    const lastUserMsg = conversation.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

    const lastUserMessageContent =
      lastUserMsg?.content
        .filter(isTextContent)
        .map((item) => item.text)
        .join("\n")
        .trim() ?? "";

    logger.info(
      { lastUserMessageContent, rawContent: lastUserMsg?.content },
      "[Noop] buildStreamRequestPayload"
    );
    return { type: "noop_request", lastUserMessageContent };
  }

  protected override getSimulatedRunUsages(): RunUsageType[] | null {
    // Consume to prevent double-recording if the base-class hook is active.
    const usages = this.simulatedRunUsages;
    this.simulatedRunUsages = null;
    logger.info({ usages }, "[Noop] getSimulatedRunUsages");
    return usages;
  }

  async *stream(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ): AsyncGenerator<LLMEvent> {
    try {
      yield* super.stream(streamParameters, metadata);
    } finally {
      if (this.simulatedRunUsages) {
        const run = await RunResource.fetchByDustRunId(this.authenticator, {
          dustRunId: this.traceId,
        });
        if (run) {
          await run.recordRunUsage(this.authenticator, this.simulatedRunUsages);
          logger.info(
            { costMicroUsd: this.simulatedRunUsages[0]?.costMicroUsd },
            "[Noop] run usage recorded"
          );
        } else {
          logger.warn({ dustRunId: this.traceId }, "[Noop] run not found");
        }
      }
    }
  }

  protected async *sendRequest(payload: NoopRequest): AsyncGenerator<LLMEvent> {
    const command = payload.lastUserMessageContent
      .replace(/<dust_system>[\s\S]*?<\/dust_system>/g, "")
      .trim();
    logger.info({ command }, "[Noop] sendRequest");

    const consumeMatch = command.match(/consume \$(\d+(?:\.\d+)?)/i);
    if (consumeMatch) {
      const costMicroUsd = Math.round(parseFloat(consumeMatch[1]) * 1_000_000);
      this.simulatedRunUsages = [
        {
          providerId: "noop",
          modelId: NOOP_MODEL_ID,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: null,
          costMicroUsd,
          isBatch: false,
        },
      ];
      logger.info({ costMicroUsd }, "[Noop] simulating run usage");
    }

    let responseText: string;

    // Determine response based on the message content.
    if (payload.staticResponse) {
      responseText = payload.staticResponse;
    } else if (command === "long message") {
      // Generate a very long message.
      responseText = "This is a very long message. ".repeat(100);
    } else if (command === "help") {
      // Display usage instructions.
      responseText =
        "Noop agent usage:\n" +
        "- Send 'long message' to receive a very long response\n" +
        "- Send 'consume $X' to simulate X dollars of credit cost\n" +
        "- Send 'help' to see this help message\n" +
        "- Send anything else to see 'Soupinou!' as a response\n";
    } else {
      responseText = "Soupinou!";
    }

    // Emit text deltas in chunks.
    const chunkSize = 50;
    for (let i = 0; i < responseText.length; i += chunkSize) {
      const delta = responseText.slice(i, i + chunkSize);
      const textDelta: TextDeltaEvent = {
        type: "text_delta",
        content: { delta },
        metadata,
      };
      yield textDelta;
    }

    // Emit the full text generated event.
    const textEvent: TextGeneratedEvent = {
      type: "text_generated",
      content: { text: responseText },
      metadata,
    };
    yield textEvent;

    // Emit success event.
    yield {
      type: "success",
      aggregated: [textEvent],
      textGenerated: textEvent,
      metadata,
    };
  }
}
