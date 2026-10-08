import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { loadDatasetItems, mean, parseArgs, pathExists, percentile, readJson, requireArg, stderr, stdout } from "./lib.mjs";

const hash = (body) => crypto.createHash("sha256").update(body).digest("hex");
const numberOrNull = (value) => Number.isFinite(value) ? value : null;
const successful = new Set(["succeeded", "gracefully_stopped"]);
const csv = (rows) => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n") + "\n";
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    stdout("Usage: node src/summarize-mini-eval.mjs --study work/new-study [--out work/new-study/snapshot-001]");
    return;
  }
  for (const key of Object.keys(args)) {
    if (!["study", "out"].includes(key)) throw new Error(`Unknown option --${key}`);
  }
  const studyRoot = path.resolve(requireArg(args, "study"));
  const manifest = await readJson(path.join(studyRoot, "manifest.json"));
  if (manifest.version !== 1) throw new Error("Unsupported mini-eval manifest");
  const rows = [];
  const snapshots = [];
  for (const batch of manifest.batches) {
    const directory = path.resolve(studyRoot, batch.directory);
    if (!directory.startsWith(`${studyRoot}${path.sep}`)) throw new Error("Batch outside study directory");
    for (const name of ["dataset", "config"]) {
      const file = path.join(directory, `${name}.${name === "dataset" ? "jsonl" : "json"}`);
      if (hash(await fs.readFile(file)) !== batch[`${name}Sha256`]) throw new Error(`Frozen ${name} changed: ${batch.directory}`);
    }
    const items = await loadDatasetItems(path.join(directory, "dataset.jsonl"));
    const questions = new Map(batch.questions.map((question) => [question.itemId, question]));
    const auditPath = path.join(directory, "data/step-costs.private.json");
    const audit = await pathExists(auditPath) ? await readJson(auditPath) : null;
    snapshots.push({ batch: batch.directory, collectedAt: audit?.collectedAt ?? null });
    const audits = new Map((audit?.conversations ?? []).map((entry) => [entry.conversationId, entry]));
    for (const item of items) {
      const question = questions.get(item.id);
      if (!question || hash(item.prompt) !== question.promptSha256) throw new Error(`Prompt mismatch: ${batch.directory}/${item.id}`);
      for (const candidate of item.candidates) {
        const runRoot = path.join(directory, "run");
        const cellPath = path.join(runRoot, "cells", item.id, `${candidate.id}.json`);
        const cell = await pathExists(cellPath) ? await readJson(cellPath) : null;
        const billing = audits.get(cell?.generatedConversationId);
        const generation = billing?.messages.find((message) => message.phase === "generation");
        const actual = generation?.resolvedModel;
        const modelMatches = actual ? ["providerId", "modelId", "reasoningEffort"].every(
          (key) => actual[key] === candidate.modelSelection[key]) : null;
        let outputRecorded = false;
        if (cell && !cell.invalidatedAt && successful.has(cell.status)) {
          if (batch.dataset === "frames") {
            outputRecorded = Boolean(cell.frameFileUrl);
          } else if (cell.answerFile) {
            const answerPath = path.resolve(runRoot, cell.answerFile);
            if (!answerPath.startsWith(`${runRoot}${path.sep}`)) throw new Error("Answer outside run directory");
            outputRecorded = await pathExists(answerPath);
          }
        }
        const credits = numberOrNull(generation?.costCredits);
        const subAgentCredits = numberOrNull(generation?.subAgentCostCredits);
        rows.push({
          dataset: batch.dataset, cohort: batch.cohort, questionId: question.questionId,
          itemId: item.id, repeat: question.repeat, candidateId: candidate.id,
          providerId: candidate.modelSelection.providerId, modelId: candidate.modelSelection.modelId,
          reasoningEffort: candidate.modelSelection.reasoningEffort,
          conversationId: cell?.generatedConversationId ?? null,
          agentMessageId: generation?.agentMessageId ?? null,
          state: !cell ? "not-started" : cell.creationUncertain ? "creation-uncertain" :
            cell.invalidatedAt ? "invalidated" : cell.error ? "local-error-check-saved-id" : cell.status ?? "unknown",
          apiStatusAtAudit: generation?.status ?? null,
          outputRecorded, modelMatches, frameShareUrl: cell?.frameShareUrl ?? null,
          originalMessageCredits: credits, subAgentCredits,
          originalTotalCredits: credits !== null && subAgentCredits !== null ? credits + subAgentCredits : null,
          exportedOriginalCredits: numberOrNull(generation?.exportedCredits),
          reconciliation: generation?.reconciliation ?? "not-collected",
          agentCompletionSeconds: Number.isFinite(generation?.completionDurationMs) ? generation.completionDurationMs / 1000 : null,
          modelInteractionSeconds: Number.isFinite(generation?.modelInteractionDurationMs) ? generation.modelInteractionDurationMs / 1000 : null,
          stepCount: generation?.reconciliation === "matched" ? generation.exportedStepCount : null,
          toolCalls: numberOrNull(generation?.toolCallCount), failedToolCalls: numberOrNull(generation?.failedToolCallCount),
          followupExportedCredits: billing ? billing.messages.filter((message) => message.phase === "followup")
            .reduce((sum, message) => sum + message.exportedCredits, 0) : null,
          promptSha256: question.promptSha256, auditCollectedAt: audit?.collectedAt ?? null,
        });
      }
    }
  }
  if (rows.length !== manifest.plannedCells) throw new Error("Planned cell count mismatch");
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.dataset}/${row.candidateId}`;
    const group = groups.get(key) ?? [];
    groups.set(key, [...group, row]);
  }
  const summary = [...groups.values()].map((group) => {
    const measured = group.filter((row) => row.modelMatches === true && row.reconciliation === "matched"
      && Number.isFinite(row.originalTotalCredits) && ["succeeded", "gracefully_stopped", "failed", "cancelled"].includes(row.apiStatusAtAudit));
    const costsByQuestion = new Map();
    for (const row of measured) {
      costsByQuestion.set(row.questionId, [...(costsByQuestion.get(row.questionId) ?? []), row.originalTotalCredits]);
    }
    const latencySeconds = measured.map((row) => row.agentCompletionSeconds).filter(Number.isFinite);
    return {
      dataset: group[0].dataset, candidateId: group[0].candidateId, plannedCells: group.length,
      notStarted: group.filter((row) => row.state === "not-started").length,
      creationUncertain: group.filter((row) => row.state === "creation-uncertain").length,
      outputsRecorded: group.filter((row) => row.outputRecorded).length,
      frameSharingUrlsRecorded: group.filter((row) => row.frameShareUrl).length,
      modelMismatches: group.filter((row) => row.modelMatches === false).length,
      modelUnverified: group.filter((row) => row.modelMatches === null).length,
      costMeasuredCells: measured.length, questionCoverage: costsByQuestion.size,
      allPlannedCostsMeasured: measured.length === group.length,
      observedOriginalCredits: measured.length ? measured.reduce((sum, row) => sum + row.originalTotalCredits, 0) : null,
      observedEqualQuestionMeanCredits: costsByQuestion.size === 3 ? mean([...costsByQuestion.values()].map(mean)) : null,
      agentLatencyMeasuredCells: latencySeconds.length,
      medianAgentSeconds: latencySeconds.length ? percentile(latencySeconds, 0.5) : null,
      p90AgentSeconds: latencySeconds.length ? percentile(latencySeconds, 0.9) : null,
    };
  });
  const metadata = {
    generatedAt: new Date().toISOString(), profile: manifest.profile,
    plannedCells: rows.length, snapshots,
    notes: [
      "Offline snapshot only. No live API checks, retries, publication, or quality scoring.",
      "outputRecorded means the runner saved text or a Frame file. It does not verify substantive answers, sharing access, correctness, or rendered Frame behavior.",
      "Costs use the original generation message plus explicit subagent credits, not later follow-ups. Missing metrics remain blank, not zero.",
      "Descriptive costs include all observed model-matched terminal original messages with reconciled billing, even failed outputs. No assessability exclusions are inferred.",
      "Equal-question means require all three questions, but partial repeats can remain. Check allPlannedCostsMeasured before interpreting them as complete-run cost.",
      "This view describes current cells in the frozen plan. Previous/recovery attempts remain in raw logs and separate recovery exports; it is not the complete retry bill.",
      "The shared collector retains tool timings and per-step credits in its JSON. Tool durations overlap, and zero exported LLM execution time is not measured latency.",
    ],
  };
  if (args.out) {
    const outRoot = path.resolve(requireArg(args, "out"));
    await fs.mkdir(outRoot, { mode: 0o700 });
    await fs.writeFile(path.join(outRoot, "attempts.csv"), csv(rows), { flag: "wx", mode: 0o600 });
    await fs.writeFile(path.join(outRoot, "summary.csv"), csv(summary), { flag: "wx", mode: 0o600 });
    await fs.writeFile(path.join(outRoot, "snapshot.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  stdout(JSON.stringify({ ...metadata, summary }, null, 2));
}

main().catch((error) => {
  stderr(error.message);
  process.exitCode = 1;
});
