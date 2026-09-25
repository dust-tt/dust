import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { hasFeatureFlag } from "@app/lib/auth";
import { calculateMajorityVote, SCALES } from "@app/lib/evals/grading";
import { createRun, EvalRunConflictError, runWhere } from "@app/lib/evals/store";
import { caseCoordinates, caseCount, EvalConfigSchema } from "@app/lib/evals/types";
import { EvalRunModel, EvalStepModel } from "@app/lib/models/eval_run";
import { literal, Op } from "@app/lib/resources/storage/data_types";
import { launchEvalRun } from "@app/temporal/evals/client";
import { evalWorkflowId } from "@app/temporal/evals/config";
import { validatePublicModelSelection } from "@front-api/lib/api/assistant/conversation/model_selection";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

// Internal pilot: every read and write uses the same admin + workspace rollout gate.
// Authenticated via the parent publicApiAuth; caller identity is never taken from JSON.
const app = publicApiApp();
app.use("*", async (ctx, next) => {
  const auth = ctx.get("auth");
  if (!auth.isAdmin() || !(await hasFeatureFlag(auth, "durable_evals"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: { type: "workspace_auth_error", message: "Durable evals require an admin in an enabled workspace." },
    });
  }
  return next();
});
app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

app.get("/runs", async (ctx) => {
  const runs = await EvalRunModel.findAll({
    where: { workspaceId: ctx.get("auth").getNonNullableWorkspace().id },
    attributes: ["sId", "createdAt", "updatedAt", "status", "cancelRequested", "requestedBy", "configHash"],
    order: [["createdAt", "DESC"]], limit: 50,
  });
  return ctx.json({ runs: runs.map((run) => run.get()) });
});

app.post("/runs", validate("json", z.object({
  runId: z.string().uuid(), config: EvalConfigSchema,
}).strict()), async (ctx) => {
  const auth = ctx.get("auth");
  const { runId, config } = ctx.req.valid("json");
  if (!auth.key() || auth.user() || auth.toJSON().groupIds !== null) {
    return apiError(ctx, { status_code: 403, api_error: {
      type: "workspace_auth_error", message: "Launching the pilot requires an unscoped workspace admin API key, stored server-side.",
    } });
  }
  for (const variant of [...config.variants, config.judge]) {
    const agent = await getAgentConfiguration(auth, { agentId: variant.agentId, variant: "extra_light" });
    if (!agent || agent.status !== "active") {
      return apiError(ctx, { status_code: 400, api_error: { type: "invalid_request_error", message: "An eval agent is unavailable." } });
    }
    const model = await validatePublicModelSelection(auth, variant.modelSelection);
    if (model.isErr()) { return apiError(ctx, model.error); }
  }
  let run;
  try {
    run = await createRun(auth, runId, config);
  } catch (error) {
    if (error instanceof EvalRunConflictError) {
      return apiError(ctx, { status_code: 409, api_error: { type: "invalid_request_error", message: error.message } });
    }
    throw error;
  }
  // If Temporal is unavailable, leave the row queued. Retrying the SAME request
  // safely starts it. Never launch a new ID to recover an ambiguous HTTP response.
  if (run.status === "queued") { await launchEvalRun(auth, run.sId); }
  return ctx.json({ runId: run.sId, status: run.status,
    workflowId: evalWorkflowId(auth.getNonNullableWorkspace().sId, run.sId),
  }, 202);
});

app.get("/runs/:runId", validate("param", z.object({ runId: z.string().uuid() })), async (ctx) => {
  const auth = ctx.get("auth");
  const { runId } = ctx.req.valid("param");
  const run = await EvalRunModel.findOne({ where: runWhere(auth, runId) });
  if (!run) { return ctx.json({ error: "Run not found" }, 404); }
  const steps = await EvalStepModel.findAll({
    where: { workspaceId: run.workspaceId, runId },
    // Fixed SQL expression: never load large answer bodies for progress polling.
    attributes: ["caseIndex", "voteIndex", "status", "conversationId", "userMessageId", "error", [literal(`"output" - 'response'`), "output"]],
    order: [["caseIndex", "ASC"], ["voteIndex", "ASC"]],
  });
  const cases = Array.from({ length: caseCount(run.config) }, (_, caseIndex) => {
    const stages = steps.filter((step) => step.caseIndex === caseIndex);
    const judgeStages = stages.filter((step) => step.voteIndex >= 0);
    const complete = judgeStages.length === run.config.judgeRuns && judgeStages.every((step) => step.status === "completed");
    const votes = judgeStages.flatMap((step) => step.output?.score !== null && step.output?.score !== undefined ? [{
      score: step.output.score, reasoning: "", conversationId: step.conversationId ?? "", durationMs: step.output.durationMs,
    }] : []);
    const grade = complete ? calculateMajorityVote(votes, SCALES[run.config.scale]) : null;
    return {
      caseIndex, ...caseCoordinates(run.config, caseIndex),
      score: grade?.finalScore ?? null, agreement: grade?.agreement ?? null,
      stages: stages.map((step) => ({
        voteIndex: step.voteIndex, status: step.status, conversationId: step.conversationId,
        userMessageId: step.userMessageId, error: step.error,
        durationMs: step.output?.durationMs ?? null,
        ownCostCredits: step.output?.ownCostCredits ?? null,
      })),
    };
  });
  return ctx.json({ run: run.get(), cases, workflowId: evalWorkflowId(auth.getNonNullableWorkspace().sId, runId) });
});

app.get("/runs/:runId/steps", validate("param", z.object({ runId: z.string().uuid() })), validate("query", z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(5).default(5),
})), async (ctx) => {
  const auth = ctx.get("auth");
  const { runId } = ctx.req.valid("param");
  const { limit, offset } = ctx.req.valid("query");
  const run = await EvalRunModel.findOne({ where: runWhere(auth, runId) });
  if (!run) { return ctx.json({ error: "Run not found" }, 404); }
  const steps = await EvalStepModel.findAll({
    where: { workspaceId: run.workspaceId, runId },
    order: [["caseIndex", "ASC"], ["voteIndex", "ASC"]], limit, offset,
  });
  return ctx.json({ steps: steps.map((step) => step.get()), offset, limit });
});

app.post("/runs/:runId/cancel", validate("param", z.object({ runId: z.string().uuid() })), async (ctx) => {
  const auth = ctx.get("auth");
  const { runId } = ctx.req.valid("param");
  const run = await EvalRunModel.findOne({ where: runWhere(auth, runId) });
  if (!run) { return ctx.json({ error: "Run not found" }, 404); }
  // Soft stop: in-flight conversations are observed to completion/deadline; pending
  // stages are skipped. Do not imply a cancellation of already-running Dust agents.
  await EvalRunModel.update({ cancelRequested: true }, {
    where: { ...runWhere(auth, runId), status: { [Op.in]: ["queued", "running"] } },
  });
  return ctx.json({ runId, cancellation: "stop_new_stages" }, 202);
});

export default app;
