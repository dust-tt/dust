import { createConversation, postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator, hasFeatureFlag, type AuthenticatorType } from "@app/lib/auth";
import { extractScore, formatJudgePrompt, SCALES } from "@app/lib/evals/grading";
import { getRun, runWhere, stepWhere } from "@app/lib/evals/store";
import { caseCoordinates, caseCount, type StepKey, type StepStatus } from "@app/lib/evals/types";
import { getEnabledModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { EvalRunModel, EvalStepModel } from "@app/lib/models/eval_run";
import { KeyResource } from "@app/lib/resources/key_resource";
import { Op } from "@app/lib/resources/storage/data_types";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { ApplicationFailure } from "@temporalio/common";

async function authForExecution(authType: AuthenticatorType) {
  const snapshot = await Authenticator.fromJSON(authType);
  if (!authType.key || authType.userId || authType.groupIds !== null) {
    throw ApplicationFailure.nonRetryable("Pilot requires an unscoped workspace admin API key");
  }
  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace: snapshot.getNonNullableWorkspace(), id: authType.key.id,
  });
  if (!key || key.status !== "active") {
    throw ApplicationFailure.nonRetryable("Eval API key was revoked", "EvalUnauthorized");
  }
  // Re-read role and grants too: fromJSON/refresh alone retain the serialized role.
  const auth = await Authenticator.fromKey(key, authType.workspaceId);
  if (!auth.isAdmin() || !(await hasFeatureFlag(auth, "durable_evals"))) {
    throw ApplicationFailure.nonRetryable("Eval execution is no longer authorized", "EvalUnauthorized");
  }
  return auth;
}

export async function prepareEvalRun(authType: AuthenticatorType, runId: string) {
  const auth = await authForExecution(authType);
  const run = await getRun(auth, runId);
  await EvalRunModel.update({ status: "running" }, {
    where: { ...runWhere(auth, runId), status: "queued" },
  });
  return {
    count: caseCount(run.config), concurrency: run.config.concurrency,
    judgeRuns: run.config.judgeRuns, timeoutSeconds: run.config.timeoutSeconds,
  };
}

// Creation is intentionally not automatically retried. A persisted claim prevents a
// second delivery from creating another paid conversation. An ambiguous launch is
// surfaced as failed for inspection, NOT silently relaunched.
export async function launchEvalStep(authType: AuthenticatorType, key: StepKey): Promise<StepStatus> {
  const auth = await authForExecution(authType);
  const run = await getRun(auth, key.runId);
  const where = stepWhere(auth, key);
  const step = await EvalStepModel.findOne({ where });
  if (!step) { throw ApplicationFailure.nonRetryable("Eval step not found"); }
  if (step.status !== "pending") {
    if (step.status === "launching") {
      throw ApplicationFailure.nonRetryable("Launch outcome unknown; inspect saved conversation before rerunning", "EvalLaunchUncertain");
    }
    return step.status;
  }
  if (run.cancelRequested) {
    await EvalStepModel.update({ status: "cancelled" }, { where: { ...where, status: "pending" } });
    return "cancelled";
  }
  const { rowIndex, variantIndex } = caseCoordinates(run.config, key.caseIndex);
  const row = run.config.rows[rowIndex];
  const variant = key.voteIndex === -1 ? run.config.variants[variantIndex] : run.config.judge;
  if (variant.modelSelection) {
    const models = await getEnabledModelsForAuth(auth);
    if (!models.some((m) => m.isSelectable && m.modelId === variant.modelSelection?.modelId && m.providerId === variant.modelSelection?.providerId)) {
      throw ApplicationFailure.nonRetryable("Selected model is not enabled", "EvalModelDisabled");
    }
  }
  let prompt = row.prompt;
  if (key.voteIndex >= 0) {
    const agentStep = await EvalStepModel.findOne({ where: stepWhere(auth, { ...key, voteIndex: -1 }) });
    if (agentStep?.status !== "completed" || !agentStep.output) {
      throw ApplicationFailure.nonRetryable("Agent output is not available for judging");
    }
    prompt = formatJudgePrompt(row.prompt, agentStep.output.response, row.judgePrompt, SCALES[run.config.scale], run.config.globalJudgePrompt);
  }
  const [claimed] = await EvalStepModel.update({ status: "launching" }, { where: { ...where, status: "pending" } });
  if (claimed !== 1) {
    throw ApplicationFailure.nonRetryable("Eval launch already claimed", "EvalLaunchUncertain");
  }
  try {
    const conversation = await createConversation(auth, {
      title: `Eval ${key.runId} / ${key.caseIndex} / ${key.voteIndex}`,
      visibility: "unlisted", spaceId: null,
    });
    // Persist before posting: if posting is ambiguous, operators still have a link.
    const [saved] = await EvalStepModel.update({ conversationId: conversation.sId }, {
      where: { ...where, status: "launching" },
    });
    if (saved !== 1) {
      throw new Error("Launch was already marked failed; message was not posted");
    }
    const result = await postUserMessage(auth, {
      conversationResource: conversation, content: prompt,
      mentions: [{ configurationId: variant.agentId }],
      context: {
        username: "eval-system", fullName: null, email: null,
        profilePictureUrl: null, timezone: "UTC", origin: "api",
      },
      skipToolsValidation: false,
      ...(variant.modelSelection ? { modelSelection: variant.modelSelection } : {}),
    });
    if (result.isErr()) { throw new Error(result.error.api_error.message); }
    await EvalStepModel.update({ status: "running", userMessageId: result.value.userMessage.sId }, {
      where: { ...where, status: "launching" },
    });
    return "running";
  } catch (error) {
    // Error text may include model/provider details, but never auth payloads.
    await failEvalStep(authType, key, `Launch failed or uncertain: ${error instanceof Error ? error.message : "unknown error"}`);
    throw ApplicationFailure.nonRetryable("Eval launch failed or uncertain; inspect saved conversation", "EvalLaunchUncertain");
  }
}

// Retried reads never create new conversations. Polling sleeps live in the workflow,
// not a worker process, so a restart resumes observing the same persisted IDs.
export async function pollEvalStep(authType: AuthenticatorType, key: StepKey): Promise<StepStatus> {
  const auth = await authForExecution(authType);
  const where = stepWhere(auth, key);
  const step = await EvalStepModel.findOne({ where });
  if (!step) { throw ApplicationFailure.nonRetryable("Eval step not found"); }
  if (step.status !== "running") { return step.status; }
  if (!step.conversationId || !step.userMessageId) {
    throw ApplicationFailure.nonRetryable("Running eval step is missing conversation IDs");
  }
  const fetched = await getConversation(auth, step.conversationId, false, 0);
  if (fetched.isErr()) { throw new Error("Unable to fetch eval conversation"); }
  const replies = fetched.value.content.flat().filter(isAgentMessageType)
    .filter((m) => m.parentMessageId === step.userMessageId);
  const message = replies.at(-1);
  if (!message || message.status === "created") { return "running"; }
  if (message.status !== "succeeded") {
    await failEvalStep(authType, key, `Agent ${message.status}: ${message.error?.message ?? "No answer"}`);
    return "failed";
  }
  // Never include chainOfThought, tool outputs, or reasoning in judge input.
  const response = message.content ?? "";
  if (!response.trim() || response.length > 100000) {
    await failEvalStep(authType, key, "Empty answer or answer exceeds pilot limit (100000 characters)");
    return "failed";
  }
  const run = await getRun(auth, key.runId);
  let score: number | null = null;
  if (key.voteIndex >= 0) {
    const parsed = extractScore(response, SCALES[run.config.scale]);
    if (!parsed.isOk) {
      await failEvalStep(authType, key, parsed.error.message);
      return "failed";
    }
    score = parsed.value;
  }
  await EvalStepModel.update({
    status: "completed",
    output: {
      response, score, durationMs: message.completionDurationMs ?? 0,
      // Deliberately label this own cost: conversation fetches omit sub-agent cost.
      // Null means not yet available, not zero. A cost backfill is a follow-up.
      ownCostCredits: message.costCredits, resolvedModel: message.resolvedModel,
    },
  }, { where: { ...where, status: "running" } });
  return "completed";
}

// Cleanup uses the original workspace identity so it can record terminal state even
// when the requester's permissions or the rollout flag have since been revoked.
export async function failEvalStep(authType: AuthenticatorType, key: StepKey, error: string): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  await EvalStepModel.update({ status: "failed", error: error.slice(0, 1024) }, {
    where: { ...stepWhere(auth, key), status: { [Op.in]: ["pending", "launching", "running"] } },
  });
}

export async function skipPendingEvalSteps(authType: AuthenticatorType, runId: string, caseIndex: number): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  await EvalStepModel.update({ status: "cancelled", error: "Run cancelled or preceding stage failed" }, {
    where: { workspaceId: auth.getNonNullableWorkspace().id, runId, caseIndex, status: "pending" },
  });
}

export async function finishEvalRun(authType: AuthenticatorType, runId: string, fatal: boolean): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const run = await getRun(auth, runId);
  const failures = await EvalStepModel.count({
    where: { workspaceId: run.workspaceId, runId, status: "failed" },
  });
  await EvalRunModel.update({
    status: fatal ? "failed" : run.cancelRequested ? "cancelled" : failures > 0 ? "completed_with_errors" : "completed",
  }, { where: { ...runWhere(auth, runId), status: { [Op.in]: ["queued", "running"] } } });
}
