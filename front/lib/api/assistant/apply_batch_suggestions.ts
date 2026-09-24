import type { BatchApplicationStep } from "@app/lib/api/assistant/batch_application_plan";
import { planBatchApplication } from "@app/lib/api/assistant/batch_application_plan";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

type ApplyBatchSuggestionsError = DustError<"invalid_request_error">;

type SkillStep = Extract<BatchApplicationStep, { type: "skill" }>;
type AgentStep = Extract<BatchApplicationStep, { type: "agent" }>;

async function validateSkillStep(
  auth: Authenticator,
  step: SkillStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  // TODO: validate the step's suggestions against the current state of its skill.
  return new Ok(undefined);
}

async function validateAgentStep(
  auth: Authenticator,
  step: AgentStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  // TODO: validate the step's suggestions against the current state of its agent.
  return new Ok(undefined);
}

async function validateStep(
  auth: Authenticator,
  step: BatchApplicationStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  switch (step.type) {
    case "skill":
      return validateSkillStep(auth, step);
    case "agent":
      return validateAgentStep(auth, step);
    default:
      return assertNever(step);
  }
}

async function applySkillStep(
  auth: Authenticator,
  step: SkillStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  // TODO: apply the step's suggestions to its skill.
  return new Ok(undefined);
}

async function applyAgentStep(
  auth: Authenticator,
  step: AgentStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  // TODO: apply the step's suggestions to its agent.
  return new Ok(undefined);
}

async function applyStep(
  auth: Authenticator,
  step: BatchApplicationStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  switch (step.type) {
    case "skill":
      return applySkillStep(auth, step);
    case "agent":
      return applyAgentStep(auth, step);
    default:
      return assertNever(step);
  }
}

/**
 * Applies every suggestion of a batch to the agents and skills they target. Every step is
 * validated before any is applied, then steps are applied in the order of `planBatchApplication`.
 */
export async function applyBatchSuggestions(
  auth: Authenticator,
  batch: BatchSuggestionResource
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  const steps = planBatchApplication(batch);

  for (const step of steps) {
    const res = await validateStep(auth, step);
    if (res.isErr()) {
      return res;
    }
  }

  for (const step of steps) {
    const res = await applyStep(auth, step);
    if (res.isErr()) {
      return res;
    }
  }

  return new Ok(undefined);
}
