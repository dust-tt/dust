import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/assistant";

import type { StreamEvent } from "./types";

export abstract class LLM {
  protected temperature: number;
  protected model: ModelIdType;
  protected provider: ModelProviderIdType;

  constructor({
    temperature,
    model,
    provider,
  }: {
    temperature: number;
    model: ModelIdType;
    provider: ModelProviderIdType;
  }) {
    this.temperature = temperature;
    this.model = model;
    this.provider = provider;
  }

  // Responsible for model input / output conversion
  abstract streamResponse({
    conversation,
    prompt,
    step,
    specifications,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
    step: number;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<StreamEvent, void, unknown>;
}
