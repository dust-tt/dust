import { isAuthorizedToApplyAgentSuggestions } from "@app/lib/api/assistant/agent_suggestion_authorization";
import type { ResolvedAgentChange } from "@app/lib/api/assistant/apply_agent_suggestions";
import {
  resolveAgentSuggestions,
  writeAgentChange,
} from "@app/lib/api/assistant/apply_agent_suggestions";
import type { BatchApplicationStep } from "@app/lib/api/assistant/batch_application_plan";
import { planBatchApplication } from "@app/lib/api/assistant/batch_application_plan";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

type ApplyBatchSuggestionsError = DustError<
  "unauthorized" | "invalid_request_error"
>;

type SkillStep = Extract<BatchApplicationStep, { type: "skill" }>;
type AgentStep = Extract<BatchApplicationStep, { type: "agent" }>;

// A step resolved against the current state of its target into the writes it applies.
type ResolvedAgentStep = AgentStep & { change: ResolvedAgentChange };
type ResolvedStep = SkillStep | ResolvedAgentStep;

function getStepTargetId(step: BatchApplicationStep): string {
  switch (step.type) {
    case "skill":
      return step.skillId;
    case "agent":
      return step.agentId;
    default:
      return assertNever(step);
  }
}

function checkOneStepPerTarget(
  steps: BatchApplicationStep[]
): Result<undefined, ApplyBatchSuggestionsError> {
  const targetIds = new Set<string>();
  for (const step of steps) {
    const targetId = getStepTargetId(step);
    if (targetIds.has(targetId)) {
      return new Err(
        new DustError(
          "invalid_request_error",
          `The batch must create, edit, or delete ${targetId}, not several of these.`
        )
      );
    }
    targetIds.add(targetId);
  }

  return new Ok(undefined);
}

async function checkSkillStepPermissions(
  auth: Authenticator,
  step: SkillStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  // TODO: check that the caller can apply the step's suggestions to its skill.
  return new Ok(undefined);
}

function checkAgentStepPermissions(
  auth: Authenticator,
  step: AgentStep,
  agentsById: Map<string, AgentResource>
): Result<undefined, ApplyBatchSuggestionsError> {
  const agent = agentsById.get(step.agentId);
  if (!agent) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets was not found."
      )
    );
  }

  if (!isAuthorizedToApplyAgentSuggestions(auth, agent, step.suggestions)) {
    return new Err(
      new DustError(
        "unauthorized",
        `You are not allowed to apply one or more of these suggestions to the agent ${agent.name}.`
      )
    );
  }

  return new Ok(undefined);
}

async function checkPermissions(
  auth: Authenticator,
  step: BatchApplicationStep,
  agentsById: Map<string, AgentResource>
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  switch (step.type) {
    case "skill":
      return checkSkillStepPermissions(auth, step);
    case "agent":
      return checkAgentStepPermissions(auth, step, agentsById);
    default:
      return assertNever(step);
  }
}

async function resolveSkillStep(
  auth: Authenticator,
  step: SkillStep
): Promise<Result<SkillStep, ApplyBatchSuggestionsError>> {
  // TODO: resolve the step's suggestions against the current state of its skill.
  return new Ok(step);
}

async function resolveAgentStep(
  auth: Authenticator,
  step: AgentStep,
  agentsById: Map<string, AgentResource>
): Promise<Result<ResolvedAgentStep, ApplyBatchSuggestionsError>> {
  const agent = agentsById.get(step.agentId);
  assert(agent, "The agent this suggestion targets disappeared.");

  const change = await resolveAgentSuggestions(auth, {
    agent,
    suggestions: step.suggestions,
  });
  if (change.isErr()) {
    return change;
  }

  return new Ok({ ...step, change: change.value });
}

async function resolveStep(
  auth: Authenticator,
  step: BatchApplicationStep,
  agentsById: Map<string, AgentResource>
): Promise<Result<ResolvedStep, ApplyBatchSuggestionsError>> {
  switch (step.type) {
    case "skill":
      return resolveSkillStep(auth, step);
    case "agent":
      return resolveAgentStep(auth, step, agentsById);
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

async function applyStep(
  auth: Authenticator,
  step: ResolvedStep
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  switch (step.type) {
    case "skill":
      return applySkillStep(auth, step);
    case "agent":
      return writeAgentChange(auth, step.change);
    default:
      return assertNever(step);
  }
}

/**
 * Applies every suggestion of a batch to the agents and skills they target.
 * The batch is divided and ordered into steps, where each step is a creation,
 * edition, or deletion of a single agent or skill.
 * For each step of the batch we check
 * - that the caller has the permissions to apply it,
 * - that the step's suggestions can be applied to the current state of its target,
 * - and then we apply the step.
 * If any of the checks fails, the batch application is aborted and no step is applied.
 */
export async function applyBatchSuggestions(
  auth: Authenticator,
  batch: BatchSuggestionResource
): Promise<Result<undefined, ApplyBatchSuggestionsError>> {
  const steps = planBatchApplication(batch);

  const oneStepPerTarget = checkOneStepPerTarget(steps);
  if (oneStepPerTarget.isErr()) {
    return oneStepPerTarget;
  }

  const agents = await AgentResource.fetchByIds(
    auth,
    steps.filter((step) => step.type === "agent").map((step) => step.agentId)
  );
  const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));

  for (const step of steps) {
    const res = await checkPermissions(auth, step, agentsById);
    if (res.isErr()) {
      return res;
    }
  }

  const resolvedSteps: ResolvedStep[] = [];
  for (const step of steps) {
    const res = await resolveStep(auth, step, agentsById);
    if (res.isErr()) {
      return res;
    }
    resolvedSteps.push(res.value);
  }

  for (const step of resolvedSteps) {
    const res = await applyStep(auth, step);
    if (res.isErr()) {
      return res;
    }
  }

  return new Ok(undefined);
}
