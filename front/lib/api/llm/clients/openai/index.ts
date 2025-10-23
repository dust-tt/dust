import { OpenAI } from "openai";

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
import { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { ReasoningEffort } from "openai/resources/shared.mjs";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";

export class OpenAILLM extends LLM {
  private client: OpenAI;
  protected metadata: ProviderMetadata;
  private reasoningEffort: ReasoningEffort;
  private temperature: number;

  constructor({
    options,
    model,
  }: {
    options?: LLMOptions;
    model: ModelConfigurationType;
  }) {
    super({ model, options });
    this.temperature =
      options?.temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced;
    this.reasoningEffort = toOpenAIReasoningEffort(
      options?.reasoningEffort ?? "none"
    );
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
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
    yield* streamLLMEvents({
      responseStreamEvents: events,
      metadata: this.metadata,
    });
  }
}
