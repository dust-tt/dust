import type { Authenticator } from "@app/lib/auth";
import { caseCount, type EvalConfig, type StepKey } from "@app/lib/evals/types";
import { EvalRunModel, EvalStepModel } from "@app/lib/models/eval_run";
import { frontSequelize } from "@app/lib/resources/storage";
import { createHash } from "crypto";

export class EvalRunConflictError extends Error {}

export function configHash(config: EvalConfig): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function runWhere(auth: Authenticator, runId: string) {
  return { workspaceId: auth.getNonNullableWorkspace().id, sId: runId };
}

export function stepWhere(auth: Authenticator, key: StepKey) {
  return { workspaceId: auth.getNonNullableWorkspace().id, ...key };
}

export async function getRun(auth: Authenticator, runId: string) {
  const run = await EvalRunModel.findOne({ where: runWhere(auth, runId) });
  if (!run) { throw new Error("Eval run not found"); }
  return run;
}

// Idempotent HTTP retries converge on both the DB row and the Temporal workflow ID.
// Auth is derived from the request, never accepted as part of the input config.
export async function createRun(auth: Authenticator, runId: string, config: EvalConfig) {
  return frontSequelize.transaction(async (transaction) => {
    const [run] = await EvalRunModel.findOrCreate({
      where: runWhere(auth, runId),
      defaults: {
        ...runWhere(auth, runId), config, configHash: configHash(config),
        status: "queued", cancelRequested: false, requestedBy: auth.user()?.sId ?? (auth.key() ? `key:${auth.key()?.id}` : null),
      },
      transaction,
    });
    if (run.configHash !== configHash(config)) {
      throw new EvalRunConflictError("runId already exists with a different config");
    }
    // A duplicate request must not recreate deleted/finished stages.
    if (!(await EvalStepModel.count({ where: { workspaceId: run.workspaceId, runId }, transaction }))) {
      const steps = Array.from({ length: caseCount(config) }, (_, caseIndex) =>
        Array.from({ length: config.judgeRuns + 1 }, (_, index) => ({
          workspaceId: run.workspaceId, runId, caseIndex, voteIndex: index - 1,
          status: "pending" as const, conversationId: null, userMessageId: null,
          output: null, error: null,
        }))
      ).flat();
      await EvalStepModel.bulkCreate(steps, { transaction });
    }
    return run;
  });
}
