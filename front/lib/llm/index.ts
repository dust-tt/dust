import type { LLM } from "@app/lib/llm/llm";
import type { AgentReasoningEffort } from "@app/types";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function getLLM({
  model,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  temperature,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reasoningEffort,
}: {
  model: ModelConfigurationType;
  temperature: number;
  reasoningEffort: AgentReasoningEffort;
}): Result<LLM, Error> {
  let llm: LLM;

  switch (model.providerId) {
    default:
      return new Err(new Error(`Unsupported provider: ${model.providerId}`));
  }

  return new Ok(llm);
}
