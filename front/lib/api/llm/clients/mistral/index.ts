import type { MistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import { MISTRAL_PROVIDER_ID } from "@app/lib/api/llm/clients/mistral/types";
import { toToolChoiceParam } from "@app/lib/api/llm/clients/mistral/utils";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import { handleError } from "@app/lib/api/llm/clients/mistral/utils/errors";
import {
  chatCompletionToLLMEvents,
  streamLLMEvents,
} from "@app/lib/api/llm/clients/mistral/utils/mistral_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import type { BatchResult, BatchStatus } from "@app/lib/api/llm/types/batch";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { Mistral } from "@mistralai/mistralai";
import type { ChatCompletionRequest } from "@mistralai/mistralai/models/components";
import {
  ApiEndpoint,
  BatchJobStatus,
  ChatCompletionRequest$outboundSchema,
  chatCompletionResponseFromJSON,
} from "@mistralai/mistralai/models/components";
import { MistralError } from "@mistralai/mistralai/models/errors/mistralerror";
import assert from "assert";
import { z } from "zod";

const mistralBatchOutputLineSchema = z.object({
  custom_id: z.string(),
  response: z
    .object({
      status_code: z.number(),
      body: z.unknown(),
    })
    .nullable()
    .optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string(),
    })
    .nullable()
    .optional(),
});

/**
 * Extract the request type from Mistral SDK's chat.stream method.
 * This infers the type directly from the SDK's actual method signature
 * rather than manually duplicating the interface.
 */
type MistralChatStreamRequest = Parameters<Mistral["chat"]["stream"]>[0];

export class MistralLLM extends LLM<MistralChatStreamRequest> {
  private client: Mistral;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: MistralWhitelistedModelId }
  ) {
    super(auth, MISTRAL_PROVIDER_ID, llmParameters);

    const { MISTRAL_API_KEY } = llmParameters.credentials;
    assert(MISTRAL_API_KEY, "MISTRAL_API_KEY credential is required");
    this.client = new Mistral({
      apiKey: MISTRAL_API_KEY,
    });
  }

  private buildChatCompletionRequest({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): ChatCompletionRequest {
    const messages = [
      {
        role: "system" as const,
        content: systemPromptToText(prompt),
      },
      ...conversation.messages.map(toMessage),
    ];

    return {
      model: this.modelId,
      messages,
      temperature: this.temperature ?? undefined,
      toolChoice: toToolChoiceParam(specifications, forceToolCall),
      tools: specifications.map(toTool),
    };
  }

  protected buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): MistralChatStreamRequest {
    return {
      ...this.buildChatCompletionRequest(streamParameters),
      stream: true,
    };
  }

  protected async *sendRequest(
    payload: MistralChatStreamRequest
  ): AsyncGenerator<LLMEvent> {
    try {
      const completionEvents = await this.client.chat.stream(payload);

      yield* streamLLMEvents({
        completionEvents,
        metadata: this.metadata,
      });
    } catch (err) {
      if (err instanceof MistralError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }

  protected override async internalSendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const requests = Array.from(conversations.entries()).map(
      ([customId, streamParams]) => ({
        customId,
        body: ChatCompletionRequest$outboundSchema.parse(
          this.buildChatCompletionRequest(streamParams)
        ),
      })
    );

    const job = await this.client.batch.jobs.create({
      model: this.modelId,
      endpoint: ApiEndpoint.RootV1ChatCompletions,
      requests,
    });

    return job.id;
  }

  override async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const job = await this.client.batch.jobs.get({ jobId: batchId });

    switch (job.status) {
      case BatchJobStatus.Success:
        return "ready";
      case BatchJobStatus.Failed:
      case BatchJobStatus.TimeoutExceeded:
      case BatchJobStatus.Cancelled:
        logger.warn(
          { batchId, status: job.status, provider: "mistral" },
          "LLM Batch has been aborted"
        );
        return "aborted";
      case BatchJobStatus.Queued:
      case BatchJobStatus.Running:
      case BatchJobStatus.CancellationRequested:
        return "computing";
      default:
        assertNever(job.status);
    }
  }

  protected override async internalGetBatchResult(
    batchId: string
  ): Promise<BatchResult> {
    const job = await this.client.batch.jobs.get({ jobId: batchId });

    if (!job.outputFile) {
      throw new Error(`Mistral batch ${batchId} has no output file`);
    }

    const stream = await this.client.files.download({
      fileId: job.outputFile,
    });
    const text = await new Response(stream).text();

    const batchResult: BatchResult = new Map();

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = mistralBatchOutputLineSchema.safeParse(
        JSON.parse(trimmed)
      );
      if (!parsed.success) {
        const message = `Failed to parse Mistral batch output line: ${parsed.error.message}`;
        logger.warn({ batchId, provider: "mistral" }, message);
        throw new Error(message);
      }

      const { custom_id, response, error } = parsed.data;

      if (error || !response) {
        const errorMessage =
          error?.message ?? `No response for custom_id ${custom_id}`;
        batchResult.set(custom_id, [
          new EventError(
            {
              type: "server_error",
              message: errorMessage,
              isRetryable: false,
            },
            this.metadata
          ),
        ]);
        continue;
      }

      const parsedResponse = chatCompletionResponseFromJSON(
        JSON.stringify(response.body)
      );
      if (!parsedResponse.ok) {
        throw new Error(
          `Failed to parse Mistral batch response for custom_id ${custom_id}: ${parsedResponse.error.message}`
        );
      }

      batchResult.set(
        custom_id,
        chatCompletionToLLMEvents(parsedResponse.value, this.metadata)
      );
    }

    return batchResult;
  }
}
