import { OpenAI } from "openai";
import type { ReasoningEffort } from "openai/resources/shared.mjs";

import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  toInput,
  toOpenAIReasoningEffort,
  toTool,
} from "@app/lib/api/llm/clients/openai/utils/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/clients/openai/utils/openai_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";
import { dustManagedCredentials } from "@app/types";
import { OpenAIPayload } from "./utils";

export class OpenAILLM extends LLM {
  private client: OpenAI;
  protected metadata: ProviderMetadata;
  private reasoningEffort: ReasoningEffort;
  private temperature: number;

  constructor({ options, model }: OpenAIPayload) {
    super({ model, options });
    this.temperature =
      options?.temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced;
    this.reasoningEffort = toOpenAIReasoningEffort(
      options?.reasoningEffort ?? "none"
    );
    const { OPENAI_API_KEY } = dustManagedCredentials();
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    this.metadata = {
      providerId: "openai",
      modelId: model.modelId,
    };
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
      model: this.model.modelId,
      input: toInput(prompt, conversation),
      stream: true,
      temperature: this.temperature,
      reasoning: {
        effort: this.reasoningEffort,
      },
      tools: specifications.map(toTool),
    });
    yield* streamLLMEvents(events, this.metadata);
  }
}
