import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
  mean,
  parseArgs,
  percentile,
  readJson,
  requireArg,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

function metricSummary(values) {
  const measured = values.filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  return {
    measuredCount: measured.length,
    total: measured.reduce((sum, value) => sum + value, 0),
    mean: measured.length > 0 ? mean(measured) : null,
    median: measured.length > 0 ? percentile(measured, 0.5) : null,
    p90: measured.length > 0 ? percentile(measured, 0.9) : null,
  };
}

function rootMessageDuration(record, key) {
  const durations = (record.messages ?? [])
    .filter(({ parentAgentMessageId }) => !parentAgentMessageId)
    .map((message) => message[key])
    .filter((value) => Number.isFinite(value) && value >= 0);
  return durations.length > 0 ? Math.max(...durations) : null;
}

function summarize(records) {
  return {
    conversationCount: records.length,
    outputCount: records.filter(({ outputProduced }) => outputProduced).length,
    billedCredits: records.reduce(
      (sum, record) => sum + Number(record.consumption?.billedCredits ?? 0),
      0,
    ),
    runnerLatencyMs: metricSummary(records.map(({ latencyMs }) => latencyMs)),
    agentCompletionDurationMs: metricSummary(
      records.map((record) =>
        rootMessageDuration(record, "completionDurationMs"),
      ),
    ),
    modelInteractionDurationMs: metricSummary(
      records.map((record) =>
        rootMessageDuration(record, "modelInteractionDurationMs"),
      ),
    ),
  };
}

function groupByCandidate(records) {
  const grouped = new Map();
  for (const record of records) {
    const group = grouped.get(record.candidateId) ?? [];
    group.push(record);
    grouped.set(record.candidateId, group);
  }
  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([candidateId, candidateRecords]) => [
        candidateId,
        summarize(candidateRecords),
      ]),
  );
}

function countConsumptionSources(records) {
  const counts = new Map();
  for (const { consumption } of records) {
    const source = consumption?.source ?? "private";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

function seconds(value) {
  return value === null ? "n/a" : (value / 1000).toFixed(1);
}

function markdown(report) {
  const lines = [
    "# Full-run cost and latency",
    "",
    `- Reviewable conversations: ${report.reviewable.conversationCount}`,
    `- Discarded conversations: ${report.discarded.conversationCount}`,
    `- Reviewable billed credits: ${report.reviewable.billedCredits}`,
    `- Discarded billed credits: ${report.discarded.billedCredits}`,
    `- Agent completion median / p90: ${seconds(report.reviewable.agentCompletionDurationMs.median)}s / ${seconds(report.reviewable.agentCompletionDurationMs.p90)}s`,
    `- Runner wall-time median / p90: ${seconds(report.reviewable.runnerLatencyMs.median)}s / ${seconds(report.reviewable.runnerLatencyMs.p90)}s`,
    "",
    "Runner wall time includes public-API transport interruptions and resumed polling. Agent completion duration comes from the final root agent message and is the primary latency metric.",
    "",
    "| Candidate | N | Billed credits total / mean | Agent completion median / p90 (s) | Model interaction median / p90 (s) | Runner wall median / p90 (s) |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const [candidateId, summary] of Object.entries(
    report.reviewableByCandidate,
  )) {
    lines.push(
      `| ${candidateId} | ${summary.conversationCount} | ${summary.billedCredits} / ${(summary.billedCredits / summary.conversationCount).toFixed(1)} | ${seconds(summary.agentCompletionDurationMs.median)} / ${seconds(summary.agentCompletionDurationMs.p90)} | ${seconds(summary.modelInteractionDurationMs.median)} / ${seconds(summary.modelInteractionDurationMs.p90)} | ${seconds(summary.runnerLatencyMs.median)} / ${seconds(summary.runnerLatencyMs.p90)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = await readJson(path.resolve(requireArg(args, "audit")));
  const outRoot = path.resolve(requireArg(args, "out"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const records = Array.isArray(audit.records) ? audit.records : [];
  const discardedRecords = Array.isArray(audit.discardedRecords)
    ? audit.discardedRecords
    : [];
  const report = {
    generatedAt: new Date().toISOString(),
    reviewable: summarize(records),
    discarded: summarize(discardedRecords),
    combined: summarize([...records, ...discardedRecords]),
    reviewableByCandidate: groupByCandidate(records),
    consumptionSources: countConsumptionSources([
      ...records,
      ...discardedRecords,
    ]),
  };
  await fs.mkdir(outRoot, { recursive: true });
  await writeJson(path.join(outRoot, "summary.json"), report);
  await fs.writeFile(path.join(outRoot, "COST_LATENCY.md"), markdown(report));
  await appendRunEvent(logPath, "run_audit_report_completed", {
    reviewableConversationCount: report.reviewable.conversationCount,
    discardedConversationCount: report.discarded.conversationCount,
    billedCredits: report.combined.billedCredits,
  });
  stdout(
    `Reported ${report.reviewable.conversationCount} reviewable and ${report.discarded.conversationCount} discarded conversation(s).`,
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch((error) => {
    stderr(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
