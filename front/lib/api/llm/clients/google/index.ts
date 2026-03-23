import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import {
  GOOGLE_AI_STUDIO_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/google/types";
import {
  toContent,
  toTool,
} from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import {
  responseToLLMEvents,
  streamLLMEvents,
} from "@app/lib/api/llm/clients/google/utils/google_to_events";
import {
  toResponseSchemaParam,
  toThinkingConfig,
  toToolConfigParam,
} from "@app/lib/api/llm/clients/google/utils/to_thinking";
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
import { ApiError, GoogleGenAI, JobState } from "@google/genai";
import assert from "assert";
import { z } from "zod";
import { handleError } from "./utils/errors";

interface GoogleGenerateContentRequestParams {
  conversation: LLMStreamParameters["conversation"];
  prompt: LLMStreamParameters["prompt"];
  specifications: LLMStreamParameters["specifications"];
  forceToolCall: LLMStreamParameters["forceToolCall"];
}

export class GoogleLLM extends LLM<GoogleGenerateContentRequestParams> {
  private client: GoogleGenAI;
  protected modelId: GoogleAIStudioWhitelistedModelId;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, GOOGLE_AI_STUDIO_PROVIDER_ID, params);
    this.modelId = llmParameters.modelId;

    const { GOOGLE_AI_STUDIO_API_KEY } = llmParameters.credentials;
    assert(
      GOOGLE_AI_STUDIO_API_KEY,
      "GOOGLE_AI_STUDIO_API_KEY credential is required"
    );

    this.client = new GoogleGenAI({
      apiKey: GOOGLE_AI_STUDIO_API_KEY,
    });
  }

  private buildGenerateContentConfig(
    specifications: LLMStreamParameters["specifications"],
    prompt: LLMStreamParameters["prompt"],
    forceToolCall: LLMStreamParameters["forceToolCall"]
  ) {
    return {
      temperature: this.temperature ?? undefined,
      tools: specifications.map(toTool),
      systemInstruction: { text: systemPromptToText(prompt) },
      // We only need one
      candidateCount: 1,
      thinkingConfig: toThinkingConfig({
        modelId: this.modelId,
        reasoningEffort: this.reasoningEffort,
        useNativeLightReasoning: this.modelConfig.useNativeLightReasoning,
      }),
      toolConfig: toToolConfigParam(specifications, forceToolCall),
      // Structured response format
      responseMimeType: this.responseFormat ? "application/json" : undefined,
      responseSchema: toResponseSchemaParam(this.responseFormat),
    };
  }

  protected buildStreamRequestPayload({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): GoogleGenerateContentRequestParams {
    // Just capture the parameters; content conversion happens in sendRequest
    return {
      conversation,
      prompt,
      specifications,
      forceToolCall,
    };
  }

  protected async *sendRequest(
    payload: GoogleGenerateContentRequestParams
  ): AsyncGenerator<LLMEvent> {
    try {
      const contents = await Promise.all(
        payload.conversation.messages.map((message) =>
          toContent(message, this.modelId)
        )
      );

      const generateContentResponses =
        await this.client.models.generateContentStream({
          model: this.modelId,
          contents,
          config: this.buildGenerateContentConfig(
            payload.specifications,
            payload.prompt,
            payload.forceToolCall
          ),
        });

      yield* streamLLMEvents({
        generateContentResponses,
        metadata: this.metadata,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }

  // Encodes the Google batch name and ordered custom IDs into a single opaque string,
  // since Google's inline batch API returns responses in order without custom_id echo.
  private static encodeBatchId(batchName: string, customIds: string[]): string {
    return JSON.stringify({ batchName, customIds });
  }

  private static readonly batchIdSchema = z.object({
    batchName: z.string(),
    customIds: z.array(z.string()),
  });

  private static decodeBatchId(batchId: string): {
    batchName: string;
    customIds: string[];
  } {
    const result = GoogleLLM.batchIdSchema.safeParse(JSON.parse(batchId));
    if (!result.success) {
      throw new Error(`Invalid Google batch ID format: ${batchId}`);
    }
    return result.data;
  }

  /**
   * Sends a batch to goolge to process.
   *
   * Note that Google does not use any custom IDs but preserve the order.
   * To keep the ids of the processed conversations we store them stringified in the batchId string.
   */
  protected override async internalSendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const customIds = Array.from(conversations.keys());
    const params = Array.from(conversations.values());

    const inlinedRequests = [];
    for (const {
      conversation,
      prompt,
      specifications,
      forceToolCall,
    } of params) {
      const contents = [];
      for (const message of conversation.messages) {
        contents.push(await toContent(message, this.modelId));
      }
      inlinedRequests.push({
        contents,
        config: this.buildGenerateContentConfig(
          specifications,
          prompt,
          forceToolCall
        ),
      });
    }

    const batch = await this.client.batches.create({
      model: this.modelId,
      src: inlinedRequests,
    });

    if (!batch.name) {
      throw new Error("Google batch job was created without a name");
    }

    return GoogleLLM.encodeBatchId(batch.name, customIds);
  }

  override async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const { batchName } = GoogleLLM.decodeBatchId(batchId);
    const batch = await this.client.batches.get({ name: batchName });

    switch (batch.state) {
      case JobState.JOB_STATE_SUCCEEDED:
      case JobState.JOB_STATE_PARTIALLY_SUCCEEDED:
        return "ready";
      case JobState.JOB_STATE_QUEUED:
      case JobState.JOB_STATE_PENDING:
      case JobState.JOB_STATE_RUNNING:
      case JobState.JOB_STATE_UPDATING:
      case JobState.JOB_STATE_CANCELLING:
        return "computing";
      case JobState.JOB_STATE_FAILED:
      case JobState.JOB_STATE_CANCELLED:
      case JobState.JOB_STATE_PAUSED:
      case JobState.JOB_STATE_EXPIRED:
      case JobState.JOB_STATE_UNSPECIFIED:
        logger.warn(
          { batchId, status: batch.state, provider: "google" },
          "LLM Batch has been aborted"
        );
        return "aborted";
      case undefined:
        return "computing";
      default:
        assertNever(batch.state);
    }
  }

  protected override async internalGetBatchResult(
    batchId: string
  ): Promise<BatchResult> {
    const { batchName, customIds } = GoogleLLM.decodeBatchId(batchId);
    const batch = await this.client.batches.get({ name: batchName });
    const inlinedResponses = batch.dest?.inlinedResponses ?? [];
    const batchResult: BatchResult = new Map();

    for (const [i, inlinedResponse] of inlinedResponses.entries()) {
      const customId = customIds[i] ?? String(i);

      if (inlinedResponse.error || !inlinedResponse.response) {
        const errorMessage =
          inlinedResponse.error?.message ??
          `No response for index ${i} (custom_id ${customId})`;
        batchResult.set(customId, [
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

      batchResult.set(
        customId,
        await responseToLLMEvents({
          response: inlinedResponse.response,
          metadata: this.metadata,
        })
      );
    }

    return batchResult;
  }
}
