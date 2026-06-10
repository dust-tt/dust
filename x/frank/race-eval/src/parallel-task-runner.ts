// Direct Parallel Task Group API runner — mirrors the approach from the
// Parallel-provided eval harness (race-eval-harness/engines/parallel.py).
// Bypasses the Dust agent layer entirely: submits all tasks as a single batch,
// polls until all complete, then fetches results.

import { writeJson } from "./io";
import type { CostBreakdown, EvalRow, RunResultEntry, RunResults } from "./types";

const PARALLEL_BASE_URL = "https://api.parallel.ai";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 720; // 60 min max

// Cost per task run by processor tier (from Parallel docs / harness).
const COST_PER_RUN_USD: Record<string, number> = {
  lite: 0.005,
  "lite-fast": 0.005,
  base: 0.01,
  "base-fast": 0.01,
  core: 0.025,
  "core-fast": 0.025,
  pro: 0.10,
  "pro-fast": 0.10,
  ultra: 0.30,
  "ultra-fast": 0.30,
};

export interface ParallelTaskRunnerConfig {
  apiKey: string;
  processor?: string;
  partialOutputPath?: string;
}

export async function runParallelTaskOnTasks(
  rows: EvalRow[],
  config: ParallelTaskRunnerConfig
): Promise<RunResults> {
  const processor = config.processor ?? "pro";
  const costPerRun = COST_PER_RUN_USD[processor] ?? 0.10;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    "x-shapley-client-id": "race-eval-harness",
  };
  const startedAtMs = Date.now();

  console.error(
    `[parallel-task] processor=${processor} tasks=${rows.length} cost_per_run=$${costPerRun}`
  );

  // Step 1: Create a task group.
  const groupRes = await fetch(`${PARALLEL_BASE_URL}/v1/tasks/groups`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (!groupRes.ok) {
    throw new Error(
      `Failed to create task group: HTTP ${groupRes.status} ${await safeBody(groupRes)}`
    );
  }
  const groupData: { taskgroup_id?: string } = await groupRes.json() as { taskgroup_id?: string };
  const groupId = groupData.taskgroup_id;
  if (!groupId) {
    throw new Error(`Task group creation returned no taskgroup_id: ${JSON.stringify(groupData)}`);
  }
  console.error(`[parallel-task] created task group ${groupId}`);

  // Step 2: Submit all tasks as a batch run.
  const inputs = rows.map((row) => buildInput(row, processor));
  const submitRes = await fetch(`${PARALLEL_BASE_URL}/v1/tasks/groups/${groupId}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs }),
  });
  if (!submitRes.ok) {
    throw new Error(
      `Failed to submit runs: HTTP ${submitRes.status} ${await safeBody(submitRes)}`
    );
  }
  const submitData: { run_ids?: string[] } = await submitRes.json() as { run_ids?: string[] };
  console.error(
    `[parallel-task] submitted ${rows.length} tasks → ${submitData.run_ids?.length ?? 0} run_ids`
  );

  // Step 3: Poll until all tasks complete.
  let completed = 0;
  let total = rows.length;
  const pollUrl = `${PARALLEL_BASE_URL}/v1/tasks/groups/${groupId}`;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(pollUrl, { headers });
    if (!pollRes.ok) {
      console.error(`[parallel-task] poll attempt=${attempt} HTTP ${pollRes.status} — retrying`);
      continue;
    }
    const data: unknown = await pollRes.json();
    if (!isRecord(data)) continue;
    const statusObj = isRecord(data["status"]) ? data["status"] : {};
    const counts = isRecord(statusObj["task_run_status_counts"])
      ? statusObj["task_run_status_counts"]
      : {};
    completed = (Number(counts["completed"]) || 0) + (Number(counts["failed"]) || 0);
    total = Number(statusObj["num_task_runs"]) || rows.length;
    const isActive = statusObj["is_active"] !== false;

    if (attempt % 6 === 0 || !isActive || completed >= total) {
      console.error(
        `[parallel-task] poll attempt=${attempt} completed=${completed}/${total} is_active=${isActive}`
      );
    }

    if (!isActive) {
      if (completed >= total) break;
      throw new Error(
        `Task group became inactive with only ${completed}/${total} tasks completed`
      );
    }
    if (completed >= total) break;
  }

  const elapsedMs = Date.now() - startedAtMs;
  console.error(
    `[parallel-task] all tasks settled (${completed}/${total}) in ${Math.round(elapsedMs / 1000)}s — fetching outputs`
  );

  // Step 4: List runs and fetch each output.
  const runOutputs = await fetchAllOutputs(headers, groupId);
  console.error(
    `[parallel-task] fetched ${Object.keys(runOutputs).length}/${rows.length} outputs`
  );

  // Step 5: Assemble RunResults, writing partial file after each task.
  const runResults: RunResults = {};
  let partialWriteChain: Promise<void> = Promise.resolve();

  for (const row of rows) {
    const content = runOutputs[row.id];
    if (!content) {
      console.error(`[parallel-task] task=${row.id} WARNING: no output — skipping`);
      continue;
    }

    const entry: RunResultEntry = {
      report: content,
      cost: buildCost(processor, costPerRun, content),
      conversation_id: `parallel-task-group:${groupId}`,
      latency_ms: elapsedMs,
      usage_source: "estimated",
    };

    runResults[row.id] = entry;
    console.error(`[parallel-task] task=${row.id} report_chars=${content.length}`);

    if (config.partialOutputPath) {
      const snapshot = { ...runResults };
      const path = config.partialOutputPath;
      partialWriteChain = partialWriteChain.then(() => writeJson(path, snapshot));
    }
  }

  await partialWriteChain;
  return runResults;
}

async function fetchAllOutputs(
  headers: Record<string, string>,
  groupId: string
): Promise<Record<string, string>> {
  // List all runs in the group (SSE text response).
  const runsRes = await fetch(`${PARALLEL_BASE_URL}/v1/tasks/groups/${groupId}/runs`, {
    headers,
  });
  if (!runsRes.ok) {
    throw new Error(`Failed to fetch group runs: HTTP ${runsRes.status} ${await safeBody(runsRes)}`);
  }

  const runsText = await runsRes.text();
  const runInfos: Array<{ runId: string; caseId: string }> = [];
  for (const line of runsText.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const eventData: unknown = JSON.parse(line.slice(5).trim());
      if (!isRecord(eventData)) continue;
      const run = isRecord(eventData["run"]) ? eventData["run"] : {};
      const runId = typeof run["run_id"] === "string" ? run["run_id"] : "";
      const metadata = isRecord(run["metadata"]) ? run["metadata"] : {};
      const caseId = typeof metadata["case_id"] === "string" ? metadata["case_id"] : "";
      if (runId) {
        runInfos.push({ runId, caseId });
      }
    } catch {
      // malformed SSE line — skip
    }
  }

  const outputs: Record<string, string> = {};
  for (const { runId, caseId } of runInfos) {
    const eventsRes = await fetch(
      `${PARALLEL_BASE_URL}/v1/tasks/runs/${runId}/events`,
      { headers }
    );
    if (!eventsRes.ok) {
      console.error(`[parallel-task] run=${runId} failed to fetch events: HTTP ${eventsRes.status}`);
      continue;
    }
    const eventsText = await eventsRes.text();
    for (const line of eventsText.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const edata: unknown = JSON.parse(line.slice(5).trim());
        if (!isRecord(edata)) continue;
        const output = edata["output"];
        if (!isRecord(output)) continue;
        const content =
          (typeof output["content"] === "string" ? output["content"] : "") ||
          (typeof output["answer"] === "string" ? output["answer"] : "") ||
          (typeof output["text"] === "string" ? output["text"] : "");
        if (content && caseId) {
          outputs[caseId] = content;
          break;
        }
      } catch {
        // malformed SSE event — skip
      }
    }
  }

  return outputs;
}

function buildInput(row: EvalRow, processor: string): Record<string, unknown> {
  return {
    task_spec: {
      output_schema: { type: "text" },
      instructions:
        "Conduct deep, comprehensive research on the following task and produce a detailed " +
        "research report in markdown format. Include analysis, data where available, and " +
        "well-reasoned conclusions.",
    },
    input: row.task,
    processor,
    metadata: { case_id: row.id },
  };
}

function buildCost(processor: string, costPerRunUsd: number, reportText: string): CostBreakdown {
  // Parallel Task API: flat cost per run, no separate LLM billing.
  const outputTokens = Math.ceil(reportText.length / 4);
  return {
    tool: "parallel_task",
    llm_input_tokens: 0,
    llm_output_tokens: outputTokens,
    search_calls: 0,
    fetch_calls: 0,
    summary_calls: 0,
    llm_cost_usd: 0,
    search_cost_usd: 0,
    fetch_cost_usd: 0,
    tool_cost_usd: costPerRunUsd,
    total_usd: costPerRunUsd,
    llm_pct: 0,
    tool_pct: 100,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<unreadable body>";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
