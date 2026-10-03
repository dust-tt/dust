import fs from "node:fs/promises";
import path from "node:path";

import {
  loadJsonl,
  mean,
  parseArgs,
  percentile,
  readJson,
  requireArg,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

function tokenCount(record, key) {
  const value = Number(record[key] ?? 0);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${record.conversationId ?? "unknown conversation"}: ${key} must be non-negative`,
    );
  }
  return value;
}

export function costMicroUsd(record, pricing) {
  const freshInputTokens = tokenCount(record, "freshInputTokens");
  const cacheReadTokens = tokenCount(record, "cacheReadTokens");
  const cacheWriteTokens = tokenCount(record, "cacheWriteTokens");
  const outputTokens = tokenCount(record, "outputTokens");
  const requiredRates = [
    "inputUsdPerMillion",
    "cacheReadUsdPerMillion",
    "cacheWriteUsdPerMillion",
    "outputUsdPerMillion",
  ];
  for (const rate of requiredRates) {
    if (
      !Number.isFinite(Number(pricing?.[rate])) ||
      Number(pricing[rate]) < 0
    ) {
      throw new Error(`Missing or invalid ${rate} for model ${record.modelId}`);
    }
  }
  return (
    freshInputTokens * Number(pricing.inputUsdPerMillion) +
    cacheReadTokens * Number(pricing.cacheReadUsdPerMillion) +
    cacheWriteTokens * Number(pricing.cacheWriteUsdPerMillion) +
    outputTokens * Number(pricing.outputUsdPerMillion)
  );
}

function latencyMs(record) {
  const startMs = Date.parse(record.startedAt);
  const endMs = Date.parse(record.completedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error(
      `${record.conversationId ?? "unknown conversation"}: invalid latency timestamps`,
    );
  }
  return endMs - startMs;
}

export function summarizeUsage(records, pricingByModel) {
  const grouped = new Map();
  for (const record of records.filter(
    ({ frameProduced }) => frameProduced === true,
  )) {
    const pricing = pricingByModel[record.modelId];
    if (!pricing) {
      throw new Error(`No pricing for model ${record.modelId}`);
    }
    if (!grouped.has(record.agentId)) {
      grouped.set(record.agentId, []);
    }
    grouped.get(record.agentId).push({
      ...record,
      latencyMs: latencyMs(record),
      computedCostMicroUsd: costMicroUsd(record, pricing),
    });
  }

  return [...grouped.entries()]
    .map(([agentId, rows]) => {
      const latencies = rows.map(({ latencyMs: value }) => value);
      const costs = rows.map(
        ({ computedCostMicroUsd }) => computedCostMicroUsd,
      );
      const freshInputTokens = rows.reduce(
        (sum, row) => sum + tokenCount(row, "freshInputTokens"),
        0,
      );
      const cacheReadTokens = rows.reduce(
        (sum, row) => sum + tokenCount(row, "cacheReadTokens"),
        0,
      );
      const cacheWriteTokens = rows.reduce(
        (sum, row) => sum + tokenCount(row, "cacheWriteTokens"),
        0,
      );
      const outputTokens = rows.reduce(
        (sum, row) => sum + tokenCount(row, "outputTokens"),
        0,
      );
      const totalInputTokens =
        freshInputTokens + cacheReadTokens + cacheWriteTokens;
      return {
        agentId,
        frameCount: rows.length,
        latencyMs: {
          mean: mean(latencies),
          median: percentile(latencies, 0.5),
          p90: percentile(latencies, 0.9),
        },
        costMicroUsd: {
          total: costs.reduce((sum, value) => sum + value, 0),
          mean: mean(costs),
          median: percentile(costs, 0.5),
          p90: percentile(costs, 0.9),
        },
        averageTokens: {
          freshInput: freshInputTokens / rows.length,
          cacheRead: cacheReadTokens / rows.length,
          cacheWrite: cacheWriteTokens / rows.length,
          output: outputTokens / rows.length,
        },
        cacheHitRate:
          totalInputTokens === 0 ? 0 : cacheReadTokens / totalInputTokens,
      };
    })
    .sort((left, right) => left.agentId.localeCompare(right.agentId));
}

function cents(microUsd) {
  return microUsd / 10_000;
}

function markdown(summary) {
  const lines = [
    "# Frame cost and latency",
    "",
    "Only conversations that produced reviewed Frames are included. Costs use disjoint fresh-input, cache-read, cache-write, and output counters.",
    "",
    "| Candidate | N | Latency median/p90 (s) | Cost mean/median/p90 (cents) | Total (USD) | Cache hit |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const candidate of summary) {
    lines.push(
      `| ${candidate.agentId} | ${candidate.frameCount} | ${(candidate.latencyMs.median / 1000).toFixed(1)} / ${(candidate.latencyMs.p90 / 1000).toFixed(1)} | ${cents(candidate.costMicroUsd.mean).toFixed(2)} / ${cents(candidate.costMicroUsd.median).toFixed(2)} / ${cents(candidate.costMicroUsd.p90).toFixed(2)} | ${(candidate.costMicroUsd.total / 1_000_000).toFixed(2)} | ${(candidate.cacheHitRate * 100).toFixed(1)}% |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const usage = await loadJsonl(path.resolve(requireArg(args, "usage")));
  const pricing = await readJson(path.resolve(requireArg(args, "pricing")));
  const outRoot = path.resolve(requireArg(args, "out"));
  const summary = summarizeUsage(usage, pricing.models ?? {});
  await writeJson(path.join(outRoot, "summary.json"), summary);
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(path.join(outRoot, "COST_LATENCY.md"), markdown(summary));
  stdout(`Computed cost and latency for ${summary.length} candidate(s).`);
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
