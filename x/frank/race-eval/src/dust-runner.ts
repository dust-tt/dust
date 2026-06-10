import { execFileSync } from "node:child_process";
import { DustAPI } from "@dust-tt/client";
import { mapConcurrent } from "./concurrency";
import { CostTracker } from "./cost-metric";
import { writeJson } from "./io";
import type { EvalRow, RunResults, ToolType } from "./types";

const MAX_AGENT_RETRIES = 3;
const DEFAULT_TASK_CONCURRENCY = 6;

interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

interface AgentAction {
  toolName: string;
  status: "success" | "error" | "blocked";
}

interface AgentResponse {
  text: string;
  conversationId: string;
  actions: AgentAction[];
  usage?: UsageInfo;
}

export interface DustRunnerConfig {
  apiKey: string;
  workspaceId: string;
  agentId: string;
  tool: ToolType;
  baseUrl: string;
  concurrency?: number;
  // When true (default), abort the run if a task completes without at least
  // one successful websearch action. Prevents the May 2026 failure mode where
  // every search errored (missing provider keys) and the agent silently wrote
  // reports from parametric memory + guessed URLs, producing bogus eval data.
  requireSearchSuccess?: boolean;
  // When set, accumulated results are rewritten to this path after every task
  // completion so progress is visible mid-run.
  partialOutputPath?: string;
}

export async function runAgentOnTasks(
  rows: EvalRow[],
  config: DustRunnerConfig
): Promise<RunResults> {
  const dust = new DustAPI({
    workspaceId: config.workspaceId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    logger: console,
    autoApproveTools: true,
  });

  const concurrency = config.concurrency ?? DEFAULT_TASK_CONCURRENCY;
  console.error(
    `[run-targets] agent=${config.agentId} tool=${config.tool} tasks=${rows.length} concurrency=${concurrency}`
  );

  const partialResults: RunResults = {};
  // Serialize partial writes so concurrent task completions cannot interleave.
  let partialWriteChain: Promise<void> = Promise.resolve();

  const entries = await mapConcurrent(rows, concurrency, async (row) => {
    const result = await runSingleTask(dust, row, config);
    if (config.partialOutputPath) {
      partialResults[row.id] = result[1];
      const snapshot = { ...partialResults };
      const path = config.partialOutputPath;
      partialWriteChain = partialWriteChain.then(() => writeJson(path, snapshot));
    }
    return result;
  });
  await partialWriteChain;

  const runResults: RunResults = {};
  let totalSearchSuccess = 0;
  let totalSearchError = 0;
  for (const [row, entry, searchStats] of entries) {
    runResults[row.id] = entry;
    totalSearchSuccess += searchStats.success;
    totalSearchError += searchStats.error;
  }

  const totalSearches = totalSearchSuccess + totalSearchError;
  const errorRatePct =
    totalSearches > 0 ? Math.round((totalSearchError / totalSearches) * 100) : 0;
  console.error(
    `[run-targets] agent=${config.agentId} tool=${config.tool} SEARCH HEALTH: ${totalSearchSuccess}/${totalSearches} succeeded (${errorRatePct}% errors)`
  );
  if (config.requireSearchSuccess !== false && totalSearches > 0 && errorRatePct > 25) {
    throw new Error(
      `agent=${config.agentId} tool=${config.tool}: ${errorRatePct}% of websearch calls failed across the run — ` +
        `results are unreliable (degraded provider?). Pass --allow-failed-search to override.`
    );
  }
  return runResults;
}

async function runSingleTask(
  dust: DustAPI,
  row: EvalRow,
  config: DustRunnerConfig
): Promise<[EvalRow, RunResults[string], { success: number; error: number }]> {
  const startedAtMs = Date.now();
  console.error(
    `[run-targets] task=${row.id} agent=${config.agentId} tool=${config.tool} status=starting prompt_chars=${row.task.length}`
  );

  let response: AgentResponse | null = null;
  for (let attempt = 1; attempt <= MAX_AGENT_RETRIES; attempt++) {
    try {
      response = (await dust.agents.sendMessage({
        agentId: config.agentId,
        message: row.task,
        context: {
          origin: "api",
          username: "race-eval",
          timezone: "UTC",
        },
      })) as AgentResponse;
      break;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[run-targets] task=${row.id} agent=${config.agentId} status=retryable_error attempt=${attempt} error=${message}`
      );
      if (attempt >= MAX_AGENT_RETRIES) {
        const elapsedMs = Date.now() - startedAtMs;
        console.error(
          `[run-targets] task=${row.id} agent=${config.agentId} status=failed elapsed_ms=${elapsedMs} error=${message}`
        );
        throw error;
      }
    }
  }
  if (!response) {
    throw new Error(`No response received for task ${row.id}`);
  }
  const elapsedMs = Date.now() - startedAtMs;

  const tracker = new CostTracker(config.tool);
  const usage = getUsage(response);
  const estimatedUsage = estimateUsageFromText(row.task, response.text);

  const inputTokens = usage.inputTokens ?? estimatedUsage.inputTokens;
  const outputTokens = usage.outputTokens ?? estimatedUsage.outputTokens;
  tracker.recordLLM(inputTokens, outputTokens);
  countToolActions(tracker, response.actions);
  const cost = tracker.compute();
  const actionSummary = summarizeActions(response.actions);

  console.error(
    `[run-targets] task=${row.id} agent=${config.agentId} status=done elapsed_ms=${elapsedMs} conversation_id=${response.conversationId} report_chars=${response.text.length}`
  );
  console.error(
    `[run-targets] task=${row.id} actions total=${actionSummary.total} success=${actionSummary.success} error=${actionSummary.error} blocked=${actionSummary.blocked} top_tools=${actionSummary.topTools}`
  );

  // The SDK's streamed `actions` is unreliable (observed: 0 actions reported
  // for a conversation whose DB row shows 12). Prefer ground truth from the
  // local hive front DB when available; fall back to SDK-reported actions.
  const searchStats =
    dbSearchOutcomes(response.conversationId) ??
    countSearchOutcomes(response.actions);
  if (config.requireSearchSuccess !== false) {
    if (searchStats.success === 0) {
      throw new Error(
        `task=${row.id} agent=${config.agentId} completed WITHOUT any successful websearch ` +
          `(search_errors=${searchStats.error}, conversation=${response.conversationId}). ` +
          `The report would be based on model memory, not search — aborting the run. ` +
          `Check provider API keys on the front server, or pass --allow-failed-search to override.`
      );
    }
    console.error(
      `[run-targets] task=${row.id} search_guard OK successful_searches=${searchStats.success} failed_searches=${searchStats.error}`
    );
  }

  return [
    row,
    {
      report: response.text,
      cost,
      conversation_id: response.conversationId,
      latency_ms: elapsedMs,
      action_summary: actionSummary,
      usage_source:
        usage.inputTokens !== undefined || usage.outputTokens !== undefined
          ? "dust_usage"
          : "estimated",
    },
    searchStats,
  ];
}

function getUsage(response: AgentResponse): UsageInfo {
  return response.usage ?? {};
}

function estimateUsageFromText(prompt: string, responseText: string): {
  inputTokens: number;
  outputTokens: number;
} {
  // Fallback estimate from implementation notes: 1 token ~= 4 chars.
  return {
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(responseText.length / 4),
  };
}

// The Dust tool names are provider-agnostic ("websearch" / "webbrowser"),
// regardless of which search provider backs them, so match on those rather
// than provider-specific names.
function countToolActions(tracker: CostTracker, actions: AgentAction[]): void {
  for (const action of actions) {
    if (action.status !== "success") {
      continue;
    }

    const normalized = `${action.toolName}`.toLowerCase();
    if (isSearchAction(normalized)) {
      tracker.recordSearch(1);
      continue;
    }
    if (isFetchAction(normalized)) {
      tracker.recordFetch(1);
    }
  }
}

function dbSearchOutcomes(
  conversationId: string
): { success: number; error: number } | null {
  const dbUri = process.env["FRONT_DATABASE_URI"];
  if (!dbUri || !/^[A-Za-z0-9]+$/.test(conversationId)) {
    return null;
  }
  try {
    const out = execFileSync(
      "psql",
      [
        dbUri,
        "-tAc",
        `select count(*) filter (where a.status = 'succeeded'), count(*) filter (where a.status <> 'succeeded')
         from agent_mcp_actions a
         join agent_messages am on am.id = a."agentMessageId"
         join messages m on m."agentMessageId" = am.id
         join conversations c on c.id = m."conversationId"
         where c."sId" = '${conversationId}'
           and a."toolConfiguration"->>'originalName' = 'websearch'`,
      ],
      { encoding: "utf8" }
    ).trim();
    const [success, error] = out.split("|").map(Number);
    if (Number.isFinite(success) && Number.isFinite(error)) {
      return { success, error };
    }
    return null;
  } catch {
    // DB unavailable (e.g. running against prod); caller falls back to SDK actions.
    return null;
  }
}

function countSearchOutcomes(actions: AgentAction[]): {
  success: number;
  error: number;
} {
  let success = 0;
  let error = 0;
  for (const action of actions) {
    if (!isSearchAction(`${action.toolName}`.toLowerCase())) {
      continue;
    }
    if (action.status === "success") {
      success++;
    } else {
      error++;
    }
  }
  return { success, error };
}

function isSearchAction(toolName: string): boolean {
  if (toolName.includes("websearch")) {
    return true;
  }
  return toolName.includes("search") && !toolName.includes("browse");
}

function isFetchAction(toolName: string): boolean {
  const fetchLike = ["webbrowser", "browse", "fetch", "extract", "content", "page"];
  return fetchLike.some((token) => toolName.includes(token));
}

function summarizeActions(actions: AgentAction[]): {
  total: number;
  success: number;
  error: number;
  blocked: number;
  topTools: string;
} {
  const countsByStatus = {
    success: 0,
    error: 0,
    blocked: 0,
  };
  const toolCounts: Record<string, number> = {};

  for (const action of actions) {
    countsByStatus[action.status] += 1;
    toolCounts[action.toolName] = (toolCounts[action.toolName] ?? 0) + 1;
  }

  const topTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([toolName, count]) => `${toolName}:${count}`)
    .join("|");

  return {
    total: actions.length,
    success: countsByStatus.success,
    error: countsByStatus.error,
    blocked: countsByStatus.blocked,
    topTools: topTools || "none",
  };
}
