import { OpenAI } from "openai";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { OpenAIResponsesWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { REASONING_EFFORT_TO_OPENAI_REASONING } from "@app/lib/api/llm/clients/openai/types";
import {
  toInput,
  toTool,
} from "@app/lib/api/llm/clients/openai/utils/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/clients/openai/utils/openai_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import type { ModelConversationTypeMultiActions } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class OpenAIResponsesLLM extends LLM {
  private client: OpenAI;
  private metadata: LLMClientMetadata = {
    clientId: "openai_responses",
    modelId: this.modelId,
  };

  constructor({
    modelId,
    temperature,
    reasoningEffort,
    bypassFeatureFlag,
  }: LLMParameters & { modelId: OpenAIResponsesWhitelistedModelId }) {
    super({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
    const { OPENAI_API_KEY } = dustManagedCredentials();
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  async *stream({
    conversation,
    prompt,
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent> {
    const events = await this.client.responses.create({
      model: this.modelId,
      input: toInput(prompt, conversation),
      stream: true,
      temperature: this.temperature,
      reasoning: {
        effort: REASONING_EFFORT_TO_OPENAI_REASONING[this.reasoningEffort],
      },
      tools: specifications.map(toTool),
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
