import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import {
  OPENAI_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/openai/types";
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
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import {
  toInput,
  toReasoning,
  toResponseFormat,
  toTool,
  toToolOption,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import {
  responseToLLMEvents,
  streamLLMEvents,
} from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { APIError, OpenAI, toFile } from "openai";
import type {
  Response,
  ResponseCreateParamsBase,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";
import { z } from "zod";

const openAIBatchOutputLineSchema = z.object({
  custom_id: z.string(),
  response: z
    .object({
      status_code: z.number(),
      body: z.unknown(),
    })
    .nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

function isOpenAIResponse(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    "output" in value &&
    Array.isArray((value as Record<string, unknown>).output)
  );
}

export class OpenAIResponsesLLM extends LLM<ResponseCreateParamsStreaming> {
  private client: OpenAI;
  protected modelId: OpenAIWhitelistedModelId;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: OpenAIWhitelistedModelId }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, OPENAI_PROVIDER_ID, params);
    this.modelId = llmParameters.modelId;

    const { OPENAI_API_KEY, OPENAI_BASE_URL } = dustManagedCredentials();
    if (!OPENAI_API_KEY) {
      throw new Error(
        "DUST_MANAGED_OPENAI_API_KEY environment variable is required"
      );
    }

    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      defaultHeaders: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
    });
  }

  private buildRequestPayload({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): ResponseCreateParamsBase {
    const promptText = systemPromptToText(prompt);
    const reasoning = toReasoning(this.modelId, this.reasoningEffort);

    return {
      model: this.modelId,
      input: toInput(promptText, conversation),
      temperature: this.temperature ?? undefined,
      reasoning,
      tools: specifications.map(toTool),
      text: {
        format: toResponseFormat(this.responseFormat, OPENAI_PROVIDER_ID),
      },
      // Only models supporting reasoning can do encrypted content for reasoning.
      include: reasoning !== null ? ["reasoning.encrypted_content"] : [],
      tool_choice: toToolOption(specifications, forceToolCall),
    };
  }

  protected buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): ResponseCreateParamsStreaming {
    return {
      ...this.buildRequestPayload(streamParameters),
      stream: true,
    };
  }

  protected async *sendRequest(
    payload: ResponseCreateParamsStreaming
  ): AsyncGenerator<LLMEvent> {
    try {
      const events = await this.client.responses.create(payload);
      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }

  /**
   * Sends a batch of conversations to be processed asynchronously.
   * OpenAi requires to upload a JSONL file with the conversations to run.
   */
  override async sendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const lines = Array.from(conversations.entries()).map(
      ([customId, streamParams]) => {
        const body = {
          ...this.buildRequestPayload(streamParams),
          stream: false,
        };
        return JSON.stringify({
          custom_id: customId,
          method: "POST",
          url: "/v1/responses",
          body,
        });
      }
    );

    const jsonlContent = lines.join("\n");
    const file = await toFile(Buffer.from(jsonlContent), "batch.jsonl", {
      type: "application/jsonl",
    });

    const uploadedFile = await this.client.files.create(
      { file, purpose: "batch" },
      // Override the default Content-Type so the SDK can set multipart/form-data for the upload.
      { headers: { "Content-Type": null } }
    );

    const batch = await this.client.batches.create({
      input_file_id: uploadedFile.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    return batch.id;
  }

  override async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.client.batches.retrieve(batchId);

    switch (batch.status) {
      case "completed":
        return "ready";
      case "validating":
      case "in_progress":
      case "finalizing":
        return "computing";
      case "failed":
      case "expired":
      case "cancelling":
      case "cancelled":
        return "aborted";
      default:
        assertNever(batch.status);
    }
  }

  override async getBatchResult(batchId: string): Promise<BatchResult> {
    const batch = await this.client.batches.retrieve(batchId);

    if (!batch.output_file_id) {
      throw new Error(`OpenAI batch ${batchId} has no output file`);
    }

    const fileContent = await this.client.files.content(batch.output_file_id);
    const text = await fileContent.text();

    const batchResult: BatchResult = new Map();

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = openAIBatchOutputLineSchema.safeParse(JSON.parse(trimmed));
      if (!parsed.success) {
        throw new Error(
          `Failed to parse OpenAI batch output line: ${parsed.error.message}`
        );
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

      if (!isOpenAIResponse(response.body)) {
        throw new Error(`Unexpected response body for custom_id ${custom_id}`);
      }

      batchResult.set(
        custom_id,
        responseToLLMEvents(response.body, this.metadata)
      );
    }

    return batchResult;
  }
}
