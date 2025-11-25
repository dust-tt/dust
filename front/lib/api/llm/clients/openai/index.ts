import { APIError, OpenAI } from "openai";
import type { Reasoning } from "openai/resources/shared";

import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { DEFAULT_REASONING_EFFORT_MAPPING } from "@app/lib/api/llm/clients/openai/types";
import {
  getModelConfig,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/openai/utils";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import {
  toInput,
  toResponseFormat,
  toTool,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import type { ReasoningEffort } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class OpenAIResponsesLLM extends LLM {
  private client: OpenAI;
  protected metadata: LLMClientMetadata = {
    clientId: "openai_responses",
    modelId: this.modelId,
  };

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: OpenAIWhitelistedModelId }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));

    const { OPENAI_API_KEY, OPENAI_BASE_URL } = dustManagedCredentials();
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    });
  }

  toResponsesReasoning(
    reasoningEffort: ReasoningEffort | null,
    useNativeLightReasoning?: boolean
  ): Reasoning | null {
    if (!reasoningEffort) {
      // This is for non-reasoning models
      // For reasoning, setting to null defaults to medium
      // So we enforce a default value for each reasoning model
      return null;
    }

    const { reasoningEffortMappingOverwrites } = getModelConfig(this.modelId);

    const reasoningEffortMapping = {
      ...DEFAULT_REASONING_EFFORT_MAPPING,
      // Specific to gpt-5 which is the only model supporting "minimal"
      ...reasoningEffortMappingOverwrites,
    };

    if (reasoningEffort !== "light" || useNativeLightReasoning) {
      return {
        effort: reasoningEffortMapping[reasoningEffort],
        summary: "auto",
      };
    }

    // In this case, use CoT meta prompt
    return {
      effort: "none",
      summary: "auto",
    };
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const reasoning = this.toResponsesReasoning(
        this.reasoningEffort,
        this.modelConfig.useNativeLightReasoning
      );

      const events = await this.client.responses.create({
        ...getModelConfig(this.modelId).inputDefaults,
        model: this.modelId,
        input: toInput(prompt, conversation),
        stream: true,
        temperature: this.temperature ?? undefined,
        reasoning,
        tools: specifications.map(toTool),
        text: { format: toResponseFormat(this.responseFormat) },
      });

      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
