#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { Command } from "commander";
import { mapConcurrent, parseConcurrency } from "./concurrency";
import { runAgentOnTasks } from "./dust-runner";
import { runParallelTaskOnTasks } from "./parallel-task-runner";
import { loadEvalCsv, readJson, writeCsv, writeJson } from "./io";
import { OpenAIJudge } from "./openai-judge";
import { SearchJudge } from "./search-judge";
import type { SearchProviderName } from "./search-providers";
import { SEARCH_PROVIDERS, providerSearch } from "./search-providers";
import { buildRawScoreEntry, buildTaskScoreEntries, computeSummary } from "./scoring";
import type {
  CriteriaByTask,
  EvalRow,
  RawScoresFile,
  RunResults,
  TaskScoreEntry,
  ToolType,
} from "./types";

const DEFAULT_AGENT_CONCURRENCY = 6;
const DEFAULT_JUDGE_CONCURRENCY = 8;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Resolve Dust credentials from (in order): CLI flags, DUST_API_KEY /
// DUST_WORKSPACE_ID env vars, then — for local dust-hive runs — the seeded
// workspace key in the hive's front DB (FRONT_DATABASE_URI is set by the
// hive's .envrc, so `source .envrc` is enough; no exports needed).
function resolveDustAuth(opts: Record<string, string>): {
  apiKey: string;
  workspaceId: string;
} {
  let apiKey = opts["apiKey"] ?? process.env["DUST_API_KEY"];
  let workspaceId = opts["workspaceId"] ?? process.env["DUST_WORKSPACE_ID"];
  if (apiKey && workspaceId) {
    return { apiKey, workspaceId };
  }

  const dbUri = process.env["FRONT_DATABASE_URI"];
  if (dbUri) {
    try {
      const out = execFileSync(
        "psql",
        [
          dbUri,
          "-tAc",
          `select w."sId" || '|' || k.secret from keys k join workspaces w on w.id = k."workspaceId" where k.status = 'active' and k."isSystem" = false order by k.id desc limit 1`,
        ],
        { encoding: "utf8" }
      ).trim();
      const [devWorkspaceId, devSecret] = out.split("|");
      if (devWorkspaceId && devSecret) {
        workspaceId = workspaceId ?? devWorkspaceId;
        apiKey = apiKey ?? devSecret;
        console.error(
          `[env] using dust-hive dev credentials from local front DB (workspace=${workspaceId})`
        );
      }
    } catch {
      // psql unavailable or query failed; fall through to the explicit errors.
    }
  }

  if (!apiKey) {
    throw new Error(
      "Missing DUST_API_KEY (and no dev key could be resolved from FRONT_DATABASE_URI)"
    );
  }
  if (!workspaceId) {
    throw new Error("Missing DUST_WORKSPACE_ID");
  }
  return { apiKey, workspaceId };
}

function requiredOpenAIEnv(): string {
  return process.env["OPENAI_API_KEY"] ?? requiredEnv("DUST_MANAGED_OPENAI_API_KEY");
}

function resolveParallelKey(): string {
  const key =
    process.env["DUST_MANAGED_PARALLEL_API_KEY"] ??
    process.env["PARALLEL_API_KEY"];
  if (!key) {
    throw new Error("Missing Parallel API key (set DUST_MANAGED_PARALLEL_API_KEY or PARALLEL_API_KEY)");
  }
  return key;
}

const program = new Command().name("race-eval").description("RACE eval runner for Dust web-research tasks");

program
  .command("run-targets")
  .requiredOption("--csv <path>")
  .requiredOption("--agent-id <sid>")
  .requiredOption("--tool <tool>", "parallel|parallel_task|firecrawl")
  .requiredOption("--output <path>")
  .option("--base-url <url>")
  .option("--api-key <key>")
  .option("--workspace-id <id>")
  .option("--from <n>")
  .option("--to <n>")
  .option("--concurrency <n>", "parallel agent conversations", String(DEFAULT_AGENT_CONCURRENCY))
  .option(
    "--allow-failed-search",
    "do not abort when a task completes without a successful websearch"
  )
  .action(async (opts: Record<string, string>) => {
    const { apiKey, workspaceId } = resolveDustAuth(opts);
    const baseUrl =
      opts["baseUrl"] ??
      process.env["DUST_FRONT_API"] ??
      process.env["NEXT_PUBLIC_DUST_API_URL"] ??
      "https://dust.tt";
    const tool = parseTool(opts["tool"]);
    const rows = await loadEvalCsv(opts["csv"]);
    const selected = applyRange(rows, opts["from"], opts["to"]);

    const runResults = await runAgentOnTasks(selected, {
      apiKey,
      workspaceId,
      agentId: opts["agentId"],
      tool,
      baseUrl,
      concurrency: parseConcurrency(opts["concurrency"], DEFAULT_AGENT_CONCURRENCY),
      requireSearchSuccess: !opts["allowFailedSearch"],
      partialOutputPath: `${opts["output"]}.partial.json`,
    });
    await writeJson(opts["output"], runResults);
    console.error(`[run-targets] wrote ${Object.keys(runResults).length} tasks to ${opts["output"]}`);
  });

// Calls the Parallel Task Group API directly (no Dust agent layer).
// Submits all tasks as a single batch, polls until complete, fetches results.
program
  .command("run-parallel-task")
  .requiredOption("--csv <path>")
  .requiredOption("--output <path>")
  .option("--processor <tier>", "Parallel processor tier (lite|base|core|pro|ultra)", "pro")
  .option("--from <n>")
  .option("--to <n>")
  .action(async (opts: Record<string, string>) => {
    const apiKey = resolveParallelKey();
    const rows = applyRange(await loadEvalCsv(opts["csv"]), opts["from"], opts["to"]);
    const runResults = await runParallelTaskOnTasks(rows, {
      apiKey,
      processor: opts["processor"],
      partialOutputPath: `${opts["output"]}.partial.json`,
    });
    await writeJson(opts["output"], runResults);
    console.error(`[run-parallel-task] wrote ${Object.keys(runResults).length} tasks to ${opts["output"]}`);
  });

program
  .command("generate-criteria")
  .requiredOption("--csv <path>")
  .requiredOption("--output <path>")
  .option("--model <name>", "OpenAI model name", "gpt-4.1")
  .option("--from <n>")
  .option("--to <n>")
  .option("--concurrency <n>", "parallel judge calls", String(DEFAULT_JUDGE_CONCURRENCY))
  .action(async (opts: Record<string, string>) => {
    const apiKey = requiredOpenAIEnv();
    const rows = await loadEvalCsv(opts["csv"]);
    const selected = applyRange(rows, opts["from"], opts["to"]);

    const judge = new OpenAIJudge(apiKey, opts["model"]);
    const concurrency = parseConcurrency(opts["concurrency"], DEFAULT_JUDGE_CONCURRENCY);
    const byTask: CriteriaByTask = {};
    const generated = await mapConcurrent(selected, concurrency, async (row) => {
      console.error(`[generate-criteria] task ${row.id}`);
      return [row.id, await judge.generateCriteria(row.task)] as const;
    });
    for (const [taskId, criteria] of generated) {
      byTask[taskId] = criteria;
    }
    await writeJson(opts["output"], byTask);
    console.error(`[generate-criteria] wrote ${Object.keys(byTask).length} tasks to ${opts["output"]}`);
  });

program
  .command("score-agent")
  .requiredOption("--csv <path>")
  .requiredOption("--criteria <path>")
  .requiredOption("--run-results <path>")
  .requiredOption("--raw-output <path>")
  .requiredOption("--task-output <path>")
  .requiredOption("--cost-detail-csv <path>")
  .option("--model <name>", "OpenAI model name", "gpt-4.1")
  .option("--from <n>")
  .option("--to <n>")
  .option("--concurrency <n>", "parallel judge calls", String(DEFAULT_JUDGE_CONCURRENCY))
  .action(async (opts: Record<string, string>) => {
    const apiKey = requiredOpenAIEnv();
    const rows = await loadEvalCsv(opts["csv"]);
    const selected = applyRange(rows, opts["from"], opts["to"]);

    const criteriaByTask = await readJson<CriteriaByTask>(opts["criteria"]);
    const runResults = await readJson<RunResults>(opts["runResults"]);

    const judge = new OpenAIJudge(apiKey, opts["model"]);
    const concurrency = parseConcurrency(opts["concurrency"], DEFAULT_JUDGE_CONCURRENCY);
    const rawScores = await scoreRows({
      judge,
      rows: selected,
      criteriaByTask,
      runResults,
      concurrency,
      label: "score-agent",
    });

    await writeJson(opts["rawOutput"], rawScores);

    const taskScores = buildTaskScoreEntries({
      rows: selected,
      runResults,
      rawScores,
    });
    await writeJson(opts["taskOutput"], toTaskScoreMap(taskScores));
    await writeCostDetailCsv(opts["costDetailCsv"], taskScores);

    console.error(`[score-agent] wrote ${taskScores.length} tasks to ${opts["taskOutput"]}`);
  });

program
  .command("summarize")
  .option("--parallel <path>", "task_scores_dust_parallel.json")
  .option("--parallel-task <path>", "task_scores_dust_parallel_task.json")
  .option("--firecrawl <path>", "task_scores_dust_firecrawl.json")
  .requiredOption("--output-csv <path>", "results_summary.csv")
  .action(async (opts: Record<string, string>) => {
    const variantInputs: Array<[string, string | undefined]> = [
      ["dust_firecrawl", opts["firecrawl"]],
      ["dust_parallel", opts["parallel"]],
      ["dust_parallel_task", opts["parallelTask"]],
    ];

    const rows: Record<string, string | number>[] = [];
    for (const [key, path] of variantInputs) {
      if (!path) {
        continue;
      }
      const entries = mapToEntries(
        await readJson<Record<string, TaskScoreEntry>>(path)
      );
      rows.push(asSummaryRow(key, entries));
    }
    if (rows.length === 0) {
      throw new Error("summarize: provide at least one of --firecrawl, --parallel, --parallel-task");
    }
    await writeCsv(
      opts["outputCsv"],
      [
        "agent",
        "race_score",
        "avg_latency_ms",
        "p95_latency_ms",
        "total_usd",
        "avg_cost_per_task",
        "cost_efficiency",
        "quality_above_ref_per_usd",
      ],
      rows
    );
    console.error(`[summarize] wrote ${opts["outputCsv"]}`);
  });

program
  .command("run-all")
  .requiredOption("--csv <path>")
  .requiredOption("--output-prefix <prefix>")
  .option("--base-url <url>")
  .option("--api-key <key>")
  .option("--workspace-id <id>")
  .option("--dust-agent-id <sid>", "default dust agent id", "dust")
  .option("--parallel-agent-id <sid>", "default dust parallel agent id", "dust-parallel")
  .option(
    "--parallel-task-agent-id <sid>",
    "default dust parallel task agent id",
    "dust-parallel-task"
  )
  .option("--model <name>", "OpenAI model name", "gpt-4.1")
  .option("--from <n>")
  .option("--to <n>")
  .option(
    "--concurrency <n>",
    "parallel agent conversations per variant",
    String(DEFAULT_AGENT_CONCURRENCY)
  )
  .option("--judge-concurrency <n>", "parallel judge calls", String(DEFAULT_JUDGE_CONCURRENCY))
  .option(
    "--allow-failed-search",
    "do not abort when a task completes without a successful websearch"
  )
  .option(
    "--variants <list>",
    "comma-separated variants to run (firecrawl,parallel,parallel_task)",
    "firecrawl,parallel,parallel_task"
  )
  .action(async (opts: Record<string, string>) => {
    const { apiKey, workspaceId } = resolveDustAuth(opts);
    const openaiApiKey = requiredOpenAIEnv();
    const agentConcurrency = parseConcurrency(opts["concurrency"], DEFAULT_AGENT_CONCURRENCY);
    const judgeConcurrency = parseConcurrency(
      opts["judgeConcurrency"],
      DEFAULT_JUDGE_CONCURRENCY
    );
    const baseUrl =
      opts["baseUrl"] ??
      process.env["DUST_FRONT_API"] ??
      process.env["NEXT_PUBLIC_DUST_API_URL"] ??
      "https://dust.tt";
    const rows = applyRange(await loadEvalCsv(opts["csv"]), opts["from"], opts["to"]);
    const outputPrefix = opts["outputPrefix"];

    const enabledVariants = opts["variants"].split(",").map((value) => value.trim());
    const runConfigs = [
      { key: "dust_firecrawl", tool: "firecrawl" as const, agentId: opts["dustAgentId"] },
      {
        key: "dust_parallel",
        tool: "parallel" as const,
        agentId: opts["parallelAgentId"],
      },
      {
        key: "dust_parallel_task",
        tool: "parallel_task" as const,
        agentId: opts["parallelTaskAgentId"],
      },
    ].filter((config) => enabledVariants.includes(config.tool));
    if (runConfigs.length === 0) {
      throw new Error(`No valid variants in --variants: ${opts["variants"]}`);
    }
    console.error(`[run-all] variants: ${runConfigs.map((c) => c.key).join(", ")}`);

    const criteriaOutput = `${outputPrefix}_grading_criteria.json`;
    const judge = new OpenAIJudge(openaiApiKey, opts["model"]);
    const criteriaByTask: CriteriaByTask = {};
    const generated = await mapConcurrent(rows, judgeConcurrency, async (row) => {
      console.error(`[run-all] generating criteria task ${row.id}`);
      return [row.id, await judge.generateCriteria(row.task)] as const;
    });
    for (const [taskId, criteria] of generated) {
      criteriaByTask[taskId] = criteria;
    }
    await writeJson(criteriaOutput, criteriaByTask);
    console.error(`[run-all] wrote criteria: ${criteriaOutput}`);

    // One broken variant (e.g. a missing provider key tripping the search
    // guard) must not lose the other variants' results: settle each variant
    // independently and summarize whatever completed.
    //
    // parallel_task calls the Parallel Task Group API directly (no Dust agent
    // layer) because the API runs multi-minute synthesis tasks that exceed any
    // reasonable SDK stream timeout. All other variants go through runAgentOnTasks.
    const parallelApiKey = resolveParallelKey();
    const variantOutcomes = await Promise.allSettled(
      runConfigs.map(async (runConfig) => {
        const partialPath = `${outputPrefix}_${runConfig.key}_run_results.partial.json`;
        const runResults =
          runConfig.tool === "parallel_task"
            ? await runParallelTaskOnTasks(rows, {
                apiKey: parallelApiKey,
                processor: "pro",
                partialOutputPath: partialPath,
              })
            : await runAgentOnTasks(rows, {
                apiKey,
                workspaceId,
                agentId: runConfig.agentId,
                tool: runConfig.tool,
                baseUrl,
                concurrency: agentConcurrency,
                requireSearchSuccess: !opts["allowFailedSearch"],
                partialOutputPath: partialPath,
              });

        const runResultsOutput = `${outputPrefix}_${runConfig.key}_run_results.json`;
        await writeJson(runResultsOutput, runResults);
        console.error(`[run-all] wrote run results: ${runResultsOutput}`);

        const rawScores = await scoreRows({
          judge,
          rows,
          criteriaByTask,
          runResults,
          concurrency: judgeConcurrency,
          label: `run-all ${runConfig.key}`,
        });

        const rawOutput = `${outputPrefix}_${runConfig.key}_raw_scores.json`;
        await writeJson(rawOutput, rawScores);

        const taskScores = buildTaskScoreEntries({
          rows,
          runResults,
          rawScores,
        });
        const taskOutput = `${outputPrefix}_${runConfig.key}_task_scores.json`;
        await writeJson(taskOutput, toTaskScoreMap(taskScores));
        await writeCostDetailCsv(
          `${outputPrefix}_${runConfig.key}_cost_detail.csv`,
          taskScores
        );
        console.error(`[run-all] wrote scoring artifacts: ${taskOutput}`);
        return { key: runConfig.key, taskScores };
      })
    );

    const summaryRows: Record<string, string | number>[] = [];
    const failedVariants: string[] = [];
    for (const [index, outcome] of variantOutcomes.entries()) {
      if (outcome.status === "fulfilled") {
        summaryRows.push(asSummaryRow(outcome.value.key, outcome.value.taskScores));
      } else {
        const key = runConfigs[index].key;
        failedVariants.push(key);
        console.error(`[run-all] VARIANT FAILED: ${key} — ${outcome.reason}`);
      }
    }

    const summaryOutput = `${outputPrefix}_results_summary.csv`;
    await writeCsv(
      summaryOutput,
      [
        "agent",
        "race_score",
        "avg_latency_ms",
        "p95_latency_ms",
        "total_usd",
        "avg_cost_per_task",
        "cost_efficiency",
        "quality_above_ref_per_usd",
      ],
      summaryRows
    );

    console.error(`[run-all] wrote summary: ${summaryOutput}`);
    if (failedVariants.length > 0) {
      console.error(
        `[run-all] WARNING: ${failedVariants.length} variant(s) failed and are EXCLUDED from the summary: ${failedVariants.join(", ")}`
      );
      process.exitCode = 1;
    }
  });

program
  .command("search-eval")
  .description(
    "Search-only 'unit test': call each provider directly with agent-style queries and judge raw result quality, isolated from the agent loop"
  )
  .requiredOption("--csv <path>")
  .requiredOption("--output <path>", "per-provider per-task scores JSON")
  .option("--output-csv <path>", "summary CSV")
  .option("--providers <list>", "comma-separated providers", SEARCH_PROVIDERS.join(","))
  .option("--num <n>", "results per query", "10")
  .option("--model <name>", "OpenAI judge model name", "gpt-4.1")
  .option("--from <n>")
  .option("--to <n>")
  .option("--concurrency <n>", "parallel tasks", String(DEFAULT_JUDGE_CONCURRENCY))
  .action(async (opts: Record<string, string>) => {
    const apiKey = requiredOpenAIEnv();
    const rows = applyRange(await loadEvalCsv(opts["csv"]), opts["from"], opts["to"]);
    const providers = parseProviders(opts["providers"]);
    const num = Number(opts["num"]);
    if (!Number.isInteger(num) || num < 1 || num > 25) {
      throw new Error(`Invalid --num value: ${opts["num"]} (expected 1-25)`);
    }
    const concurrency = parseConcurrency(opts["concurrency"], DEFAULT_JUDGE_CONCURRENCY);
    const judge = new SearchJudge(apiKey, opts["model"]);

    const partialByTask: Record<string, Record<string, unknown>> = {};
    let partialWriteChain: Promise<void> = Promise.resolve();
    const partialPath = `${opts["output"]}.partial.json`;

    const taskEntries = await mapConcurrent(rows, concurrency, async (row) => {
      const query = await judge.generateQuery(row.task);
      console.error(`[search-eval] task=${row.id} query="${query}"`);

      // One provider at a time per task: tasks already run concurrently, and
      // this keeps a slow provider from skewing latency via local contention.
      const byProvider: Record<string, unknown> = {};
      for (const provider of providers) {
        const response = await providerSearch(provider, query, num);
        if (response.error) {
          console.error(
            `[search-eval] task=${row.id} provider=${provider} ERROR ${response.error}`
          );
          byProvider[provider] = {
            query,
            latency_ms: response.latency_ms,
            result_count: 0,
            error: response.error,
          };
          continue;
        }
        const scores = await judge.scoreResults(row.task, response);
        console.error(
          `[search-eval] task=${row.id} provider=${provider} results=${response.results.length} latency_ms=${response.latency_ms} overall=${scores.overall}`
        );
        byProvider[provider] = {
          query,
          latency_ms: response.latency_ms,
          result_count: response.results.length,
          avg_snippet_chars: Math.round(
            response.results.reduce((sum, result) => sum + result.snippet.length, 0) /
              Math.max(1, response.results.length)
          ),
          results_with_dates: response.results.filter((result) => result.publish_date)
            .length,
          scores,
          results: response.results.map((result) => ({
            title: result.title,
            link: result.link,
            publish_date: result.publish_date,
            snippet_chars: result.snippet.length,
          })),
        };
      }
      partialByTask[row.id] = byProvider;
      const snapshot = { ...partialByTask };
      partialWriteChain = partialWriteChain.then(() => writeJson(partialPath, snapshot));
      return [row.id, byProvider] as const;
    });
    await partialWriteChain;

    const byTask: Record<string, Record<string, unknown>> = {};
    for (const [taskId, byProvider] of taskEntries) {
      byTask[taskId] = byProvider as Record<string, unknown>;
    }
    await writeJson(opts["output"], byTask);
    console.error(`[search-eval] wrote ${Object.keys(byTask).length} tasks to ${opts["output"]}`);

    if (opts["outputCsv"]) {
      await writeSearchEvalSummaryCsv(opts["outputCsv"], providers, byTask);
      console.error(`[search-eval] wrote summary: ${opts["outputCsv"]}`);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});

async function scoreRows(params: {
  judge: OpenAIJudge;
  rows: EvalRow[];
  criteriaByTask: CriteriaByTask;
  runResults: RunResults;
  concurrency: number;
  label: string;
}): Promise<RawScoresFile> {
  const { judge, rows, criteriaByTask, runResults, concurrency, label } = params;
  const scored = await mapConcurrent(rows, concurrency, async (row) => {
    const criteria = criteriaByTask[row.id];
    const run = runResults[row.id];
    if (!criteria || !run) {
      console.error(`[${label}] skipping task ${row.id} (missing criteria/run result)`);
      return null;
    }
    console.error(`[${label}] scoring task ${row.id}`);
    const scores = await judge.scorePair(
      row.task,
      run.report,
      row.reference_report,
      criteria
    );
    return [row.id, buildRawScoreEntry(scores, criteria)] as const;
  });

  const rawScores: RawScoresFile = {};
  for (const entry of scored) {
    if (entry) {
      rawScores[entry[0]] = entry[1];
    }
  }
  return rawScores;
}

function parseProviders(raw: string): SearchProviderName[] {
  const providers = raw.split(",").map((value) => value.trim()).filter(Boolean);
  for (const provider of providers) {
    if (!(SEARCH_PROVIDERS as string[]).includes(provider)) {
      throw new Error(
        `Invalid provider "${provider}" (expected one of: ${SEARCH_PROVIDERS.join(", ")})`
      );
    }
  }
  return providers as SearchProviderName[];
}

async function writeSearchEvalSummaryCsv(
  path: string,
  providers: SearchProviderName[],
  byTask: Record<string, Record<string, unknown>>
) {
  const scoreFields = [
    "relevance",
    "coverage",
    "freshness",
    "authority",
    "content_richness",
    "overall",
  ] as const;

  const rows = providers.map((provider) => {
    const taskEntries = Object.values(byTask)
      .map((entry) => entry[provider] as any)
      .filter(Boolean);
    const scoredEntries = taskEntries.filter((entry) => entry.scores);
    const errors = taskEntries.filter((entry) => entry.error).length;

    const averages: Record<string, number> = {};
    for (const field of scoreFields) {
      const values = scoredEntries.map((entry) => Number(entry.scores[field]));
      averages[field] = values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
        : 0;
    }
    const latencies = taskEntries.map((entry) => Number(entry.latency_ms));
    const snippetChars = scoredEntries.map((entry) => Number(entry.avg_snippet_chars ?? 0));

    return {
      provider,
      queries: taskEntries.length,
      errors,
      avg_latency_ms: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      avg_snippet_chars: snippetChars.length
        ? Math.round(snippetChars.reduce((a, b) => a + b, 0) / snippetChars.length)
        : 0,
      ...averages,
    };
  });

  await writeCsv(
    path,
    [
      "provider",
      "queries",
      "errors",
      "avg_latency_ms",
      "avg_snippet_chars",
      ...scoreFields,
    ],
    rows
  );
}

function parseTool(value: string): ToolType {
  switch (value) {
    case "parallel":
    case "parallel_task":
    case "firecrawl":
      return value;
    default:
      throw new Error(`Invalid --tool value: ${value}`);
  }
}

function applyRange<T extends { id: string }>(rows: T[], fromRaw?: string, toRaw?: string): T[] {
  const from = fromRaw ? Number(fromRaw) : Number.NEGATIVE_INFINITY;
  const to = toRaw ? Number(toRaw) : Number.POSITIVE_INFINITY;
  return rows.filter((row) => {
    const id = Number(row.id);
    return id >= from && id <= to;
  });
}

function toTaskScoreMap(entries: TaskScoreEntry[]): Record<string, TaskScoreEntry> {
  const byId: Record<string, TaskScoreEntry> = {};
  for (const entry of entries) {
    byId[entry.task_id] = entry;
  }
  return byId;
}

function mapToEntries(value: Record<string, TaskScoreEntry>): TaskScoreEntry[] {
  return Object.values(value);
}

async function writeCostDetailCsv(path: string, entries: TaskScoreEntry[]) {
  const rows = entries.map((entry) => ({
    task_id: entry.task_id,
    category: entry.category,
    race_score: entry.race_score,
    latency_ms: entry.latency_ms,
    llm_input_tokens: entry.cost.llm_input_tokens,
    llm_output_tokens: entry.cost.llm_output_tokens,
    search_calls: entry.cost.search_calls,
    fetch_calls: entry.cost.fetch_calls,
    summary_calls: entry.cost.summary_calls,
    llm_cost_usd: entry.cost.llm_cost_usd,
    tool_cost_usd: entry.cost.tool_cost_usd,
    total_usd: entry.cost.total_usd,
    cost_efficiency: entry.cost_efficiency,
    quality_above_ref_per_usd: entry.quality_above_reference_per_usd,
  }));
  await writeCsv(
    path,
    [
      "task_id",
      "category",
      "race_score",
      "latency_ms",
      "llm_input_tokens",
      "llm_output_tokens",
      "search_calls",
      "fetch_calls",
      "summary_calls",
      "llm_cost_usd",
      "tool_cost_usd",
      "total_usd",
      "cost_efficiency",
      "quality_above_ref_per_usd",
    ],
    rows
  );
}

function asSummaryRow(agent: string, entries: TaskScoreEntry[]): Record<string, string | number> {
  const summary = computeSummary(entries);
  return {
    agent,
    race_score: summary.avg_race_score,
    avg_latency_ms: summary.avg_latency_ms,
    p95_latency_ms: summary.p95_latency_ms,
    total_usd: summary.total_spend_usd,
    avg_cost_per_task: summary.avg_cost_per_task,
    cost_efficiency: summary.avg_cost_efficiency,
    quality_above_ref_per_usd: summary.avg_quality_above_ref_per_usd,
  };
}
