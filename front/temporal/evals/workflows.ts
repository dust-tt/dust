import type { AuthenticatorType } from "@app/lib/auth";
import type { StepKey, StepStatus } from "@app/lib/evals/types";
import {
  CancellationScope, executeChild, ParentClosePolicy, proxyActivities, sleep, workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";

const { prepareEvalRun, pollEvalStep, failEvalStep, skipPendingEvalSteps, finishEvalRun } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5, initialInterval: "1 second", maximumInterval: "10 seconds" },
});
const { launchEvalStep } = proxyActivities<typeof activities>({
  startToCloseTimeout: "90 seconds",
  scheduleToCloseTimeout: "3 minutes",
  // Conversation creation/posting is not idempotent. Never retry ambiguous writes.
  retry: { maximumAttempts: 1 },
});

export async function evalCaseWorkflow(authType: AuthenticatorType, input: {
  runId: string; caseIndex: number; judgeRuns: number; timeoutSeconds: number;
}): Promise<void> {
  for (let voteIndex = -1; voteIndex < input.judgeRuns; voteIndex++) {
    const key: StepKey = { runId: input.runId, caseIndex: input.caseIndex, voteIndex };
    let status: StepStatus;
    try {
      const deadline = Date.now() + input.timeoutSeconds * 1000;
      status = await launchEvalStep(authType, key);
      while (status === "running" && Date.now() < deadline) {
        await sleep("10 seconds");
        status = await pollEvalStep(authType, key);
      }
      if (status === "running" || status === "launching") {
        await failEvalStep(authType, key, "Stage deadline exceeded. The Dust conversation may still be running; inspect it before rerunning.");
        status = "failed";
      }
    } catch {
      await CancellationScope.nonCancellable(async () => {
        await failEvalStep(authType, key, "Stage activity failed or launch outcome unknown; inspect saved conversation before rerunning.");
      });
      status = "failed";
    }
    if (status !== "completed") {
      await skipPendingEvalSteps(authType, input.runId, input.caseIndex);
      return;
    }
  }
}

export async function evalRunWorkflow(authType: AuthenticatorType, runId: string): Promise<void> {
  try {
    const config = await prepareEvalRun(authType, runId);
    let nextCase = 0;
    // Fixed pool bounds active cases. Each child keeps its own bounded event history.
    await Promise.all(Array.from({ length: Math.min(config.concurrency, config.count) }, async () => {
      while (nextCase < config.count) {
        const caseIndex = nextCase++;
        await executeChild(evalCaseWorkflow, {
          workflowId: `${workflowInfo().workflowId}-case-${caseIndex}`,
          parentClosePolicy: ParentClosePolicy.TERMINATE,
          args: [authType, { runId, caseIndex, judgeRuns: config.judgeRuns, timeoutSeconds: config.timeoutSeconds }],
        });
      }
    }));
    await finishEvalRun(authType, runId, false);
  } catch (error) {
    await CancellationScope.nonCancellable(() => finishEvalRun(authType, runId, true));
    throw error;
  }
}
