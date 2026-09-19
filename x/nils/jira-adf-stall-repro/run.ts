import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { TASK_QUEUE } from "./config";

const ts = () => new Date().toISOString();

async function main() {
  const client = await getTemporalClientForFrontNamespace();
  const runId = Date.now();

  console.log(`[run] ${ts()} starting canary workflow`);
  const canary = await client.workflow.start("canaryWorkflow", {
    args: [180],
    taskQueue: TASK_QUEUE,
    workflowId: `adf-canary-${runId}`,
  });

  await new Promise((r) => setTimeout(r, 4000));

  console.log(`[run] ${ts()} starting stall workflow`);
  const stall = await client.workflow.start("stallWorkflow", {
    args: [],
    taskQueue: TASK_QUEUE,
    workflowId: `adf-stall-${runId}`,
  });

  const stallResult = await stall.result().then(
    (v) => `RESOLVED: ${v}`,
    (e) => `FAILED: ${String(e)}`
  );
  console.log(`[run] ${ts()} stall workflow -> ${stallResult}`);

  const canaryResult = await canary.result().then(
    (v) => `RESOLVED: ${v}`,
    (e) => `FAILED: ${String(e)}`
  );
  console.log(`[run] ${ts()} canary workflow -> ${canaryResult}`);

  console.log(`\n[run] stall workflowId = adf-stall-${runId}`);
  console.log(`[run] canary workflowId = adf-canary-${runId}`);
  process.exit(0);
}

void main();
