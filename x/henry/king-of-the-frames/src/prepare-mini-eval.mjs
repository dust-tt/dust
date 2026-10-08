import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendRunEvent,
  createSeededRandom,
  loadDatasetItems,
  parseArgs,
  requireArg,
  seededShuffle,
  stderr,
  stdout,
  validateConfig,
} from "./lib.mjs";

const toolkitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasets = ["synthesis", "frames", "finance"];
const models = [
  ["opus-5-5", "Opus 5.5", "anthropic", "claude-opus-5-5"],
  ["opus-5", "Opus 5", "anthropic", "claude-opus-5"],
  ["gpt-6-1-sol", "GPT-6.1 Sol", "openai", "gpt-6.1-sol"],
  ["gpt-6-astra", "GPT-6 Astra", "openai", "gpt-6-astra"],
];
const hash = (body) => crypto.createHash("sha256").update(body).digest("hex");

function candidate(model, effort, agentId) {
  const [id, label, providerId, modelId] = model;
  return {
    id: `${id}-${effort}`,
    agentId,
    label: `${label} / ${effort}`,
    modelSelection: { providerId, modelId, reasoningEffort: effort },
  };
}

function candidatesFor(profile, cohort, agentId) {
  if (profile === "migration") {
    return models
      .filter(([id]) => cohort !== "xhigh" || id !== "opus-5")
      .map((model) => candidate(model, model[0] === "opus-5" ? "high" : cohort, agentId));
  }
  const matched = models.map((model) => candidate(model, cohort, agentId));
  return profile === "extended" && cohort === "medium"
    ? [...matched, candidate(models[1], "high", agentId)]
    : matched;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    stdout("Usage: node src/prepare-mini-eval.mjs --out work/new-study [--source-root work/mini-eval-2026-09-30] [--profile migration|matched|extended] [--repeats 5] [--agent-id dust] [--concurrency 8] [--seed mini-eval-v1] [--dry-run]");
    return;
  }
  const allowed = new Set(["out", "source-root", "profile", "repeats", "agent-id", "concurrency", "seed", "dry-run"]);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) throw new Error(`Unknown option --${key}`);
  }
  const outRoot = path.resolve(requireArg(args, "out"));
  const sourceRoot = path.resolve(args["source-root"] ?? path.join(toolkitRoot, "work/mini-eval-2026-09-30"));
  const profile = args.profile ?? "migration";
  const repeats = Number(args.repeats ?? 5);
  const concurrency = Number(args.concurrency ?? 8);
  const seed = args.seed ?? "mini-eval-v1";
  const agentId = args["agent-id"] ?? "dust";
  if (!["migration", "matched", "extended"].includes(profile)) throw new Error("Unknown profile");
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) throw new Error("repeats must be 1 to 20");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error("concurrency must be 1 to 32");
  if (typeof seed !== "string" || typeof agentId !== "string" || !/^[A-Za-z0-9_-]+$/.test(agentId)) {
    throw new Error("seed and agent-id must be strings; agent-id must be a safe identifier");
  }
  const random = createSeededRandom(seed);
  const sources = [];
  const planned = [];
  for (const dataset of datasets) {
    const sourcePath = path.join(sourceRoot, dataset, "dataset.jsonl");
    const sourceBody = await fs.readFile(sourcePath);
    const items = await loadDatasetItems(sourcePath);
    if (items.length !== 3 || items.some((item) => item.attachments.length || /-r\d+$/.test(item.id))) {
      throw new Error(`${dataset} requires exactly three distinct, attachment-free original questions`);
    }
    sources.push({ dataset, path: sourcePath, sha256: hash(sourceBody) });
    for (const cohort of ["medium", "xhigh"]) {
      const candidates = candidatesFor(profile, cohort, agentId);
      const repeated = [];
      const questions = [];
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        for (const item of items) {
          const id = repeat === 1 ? item.id : `${item.id}-r${String(repeat).padStart(2, "0")}`;
          repeated.push({ id, prompt: item.prompt, candidates: seededShuffle(candidates, random), attachments: [] });
          questions.push({ itemId: id, questionId: item.id, repeat, promptSha256: hash(item.prompt) });
        }
      }
      const rows = seededShuffle(repeated, random);
      const config = validateConfig({
        apiBaseUrl: "https://dust.tt/api/v1",
        requireModelAudit: true,
        output: { type: dataset === "frames" ? "frame" : "answer" },
        review: { type: "ranking", collection: "google-form" },
        concurrency,
        timeoutMs: 900000,
        pollIntervalMs: 4000,
        timezone: "Europe/Paris",
      });
      planned.push({ dataset, cohort, directory: `${cohort}/${dataset}`, config, rows, questions, candidates });
    }
  }
  const batches = planned.map(({ rows, config, ...batch }) => {
    const datasetBody = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
    const configBody = `${JSON.stringify(config, null, 2)}\n`;
    return { ...batch, itemCount: rows.length, plannedCells: rows.length * batch.candidates.length,
      datasetSha256: hash(datasetBody), configSha256: hash(configBody) };
  });
  const manifest = {
    version: 1, createdAt: new Date().toISOString(), profile, repeats, seed,
    agentId, sources, uniqueQuestions: 9,
    plannedCells: batches.reduce((sum, batch) => sum + batch.plannedCells, 0),
    publication: "none", batches,
    notes: [
      "Historical model identifiers and efforts. Validate live resolvedModel during the pilot; do not silently substitute.",
      "Fresh independent conversations, not copies of prior outputs. Repeat IDs are not matched random seeds.",
      "Shuffling changes queue order only. Runner concurrency is a per-process in-flight cap, not launch-all behavior.",
      "No Slack, Forms, sharing changes, or API requests during preparation.",
    ],
  };
  if (!args["dry-run"]) {
    // The entire destination must be new, including on a partially failed prepare.
    await fs.mkdir(outRoot, { mode: 0o700 });
    for (const batch of planned) {
      const directory = path.join(outRoot, batch.directory);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(directory, "dataset.jsonl"),
        `${batch.rows.map((row) => JSON.stringify(row)).join("\n")}\n`, { flag: "wx", mode: 0o600 });
      await fs.writeFile(path.join(directory, "config.json"),
        `${JSON.stringify(batch.config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      await loadDatasetItems(path.join(directory, "dataset.jsonl"));
    }
    await fs.writeFile(path.join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 });
    await appendRunEvent(path.join(outRoot, "events.jsonl"), "mini_eval_prepared", {
      profile, seed, repeats, plannedCells: manifest.plannedCells,
    });
  }
  stdout(JSON.stringify({ dryRun: Boolean(args["dry-run"]), outRoot, profile, repeats,
    uniqueQuestions: 9, plannedCells: manifest.plannedCells,
    batches: batches.map(({ directory, itemCount, plannedCells }) => ({ directory, itemCount, plannedCells })) }, null, 2));
}

main().catch((error) => {
  stderr(error.message);
  process.exitCode = 1;
});
