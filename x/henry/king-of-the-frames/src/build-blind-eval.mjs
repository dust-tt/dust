import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
  createSeededRandom,
  getOutputConfig,
  getReviewConfig,
  loadEvaluationItems,
  parseArgs,
  pathExists,
  readJson,
  requireArg,
  seededShuffle,
  stderr,
  stdout,
  validateConfig,
  writeJson,
} from "./lib.mjs";

function permutations(values) {
  if (values.length <= 1) {
    return [[...values]];
  }
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_, candidateIndex) => candidateIndex !== index),
    ).map((suffix) => [value, ...suffix]),
  );
}

export function buildBalancedSlotOrders(items, seed, fixedOrders = new Map()) {
  const random = createSeededRandom(`${seed}:slots`);
  const positionCounts = new Map();
  const orders = new Map();
  for (const item of items) {
    for (const { id: candidateId } of item.candidates) {
      const counts = positionCounts.get(candidateId) ?? [];
      if (counts.length < item.candidates.length) {
        positionCounts.set(candidateId, [
          ...counts,
          ...Array(item.candidates.length - counts.length).fill(0),
        ]);
      }
    }
  }
  for (const item of items) {
    const fixedOrder = fixedOrders.get(item.id);
    if (!fixedOrder) {
      continue;
    }
    const expected = item.candidates.map(({ id }) => id).sort();
    const actual = [...fixedOrder].sort();
    if (
      expected.length !== actual.length ||
      expected.some((candidateId, index) => candidateId !== actual[index])
    ) {
      throw new Error(
        `${item.id} published slot mapping does not match its candidates`,
      );
    }
    orders.set(item.id, [...fixedOrder]);
    for (let position = 0; position < fixedOrder.length; position += 1) {
      positionCounts.get(fixedOrder[position])[position] += 1;
    }
  }
  const itemIndexes = seededShuffle(
    items
      .map((_, index) => index)
      .filter((index) => !fixedOrders.has(items[index].id)),
    random,
  );
  for (const itemIndex of itemIndexes) {
    const item = items[itemIndex];
    const candidates = item.candidates.map(({ id }) => id);
    const scored = permutations(candidates).map((order) => ({
      order,
      score: order.reduce(
        (sum, candidateId, position) =>
          sum + positionCounts.get(candidateId)[position],
        0,
      ),
    }));
    const bestScore = Math.min(...scored.map(({ score }) => score));
    const selected = seededShuffle(
      scored.filter(({ score }) => score === bestScore),
      random,
    )[0].order;
    orders.set(item.id, selected);
    for (let position = 0; position < selected.length; position += 1) {
      positionCounts.get(selected[position])[position] += 1;
    }
  }
  return {
    orders,
    positionCounts: Object.fromEntries(
      [...positionCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

async function loadFixedSlotOrders(items, outRoot) {
  const mappingPath = path.join(outRoot, "mapping.private.json");
  if (!(await pathExists(mappingPath))) {
    return new Map();
  }
  const existingMappings = await readJson(mappingPath);
  const fixedOrders = new Map();
  for (const item of items) {
    const slots = existingMappings[item.id]?.slots;
    if (!slots || typeof slots !== "object") {
      continue;
    }
    const entries = Object.entries(slots).sort(
      ([left], [right]) => Number(left) - Number(right),
    );
    if (
      entries.some(
        ([slot, mapping], index) =>
          Number(slot) !== index + 1 || typeof mapping?.agentId !== "string",
      )
    ) {
      throw new Error(`${item.id} has an invalid published slot mapping`);
    }
    fixedOrders.set(
      item.id,
      entries.map(([, mapping]) => mapping.agentId),
    );
  }
  return fixedOrders;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(
    await readJson(path.resolve(requireArg(args, "config"))),
  );
  const outputConfig = getOutputConfig(config);
  const reviewConfig = getReviewConfig(config);
  const datasetPath =
    typeof args.dataset === "string" ? path.resolve(args.dataset) : undefined;
  const packsRoot =
    typeof args.packs === "string" ? path.resolve(args.packs) : undefined;
  const items = await loadEvaluationItems({ config, datasetPath, packsRoot });
  const outputIndexArg = args["output-index"] ?? args["frame-index"];
  if (typeof outputIndexArg !== "string" || outputIndexArg.length === 0) {
    throw new Error("Missing --output-index");
  }
  const outputIndexPath = path.resolve(outputIndexArg);
  const outputIndex = await readJson(outputIndexPath);
  const outputIndexRoot = path.dirname(outputIndexPath);
  const modelAudit = config.requireModelAudit
    ? await readJson(
        path.join(outputIndexRoot, "prepublication-audit.private.json"),
      )
    : null;
  const outRoot = path.resolve(requireArg(args, "out"));
  const seed = typeof args.seed === "string" ? args.seed : crypto.randomUUID();
  const allowPartial = args["allow-partial"] === true;
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  await appendRunEvent(logPath, "blind_build_started", {
    seed,
    itemCount: items.length,
  });
  const reviewableItems = items
    .map((item) => {
      const candidates = item.candidates.filter((candidate) => {
        const output = outputIndex[item.id]?.[candidate.id];
        return (
          typeof output === "string" &&
          output.length > 0 &&
          (!modelAudit || Boolean(modelAudit[`${item.id}/${candidate.id}`]))
        );
      });
      return {
        item: { ...item, candidates },
        isComplete: candidates.length === item.candidates.length,
      };
    })
    .filter(({ item, isComplete }) =>
      allowPartial ? item.candidates.length >= 2 : isComplete,
    )
    .map(({ item }) => item);
  const fixedOrders = await loadFixedSlotOrders(reviewableItems, outRoot);
  const slotDesign = buildBalancedSlotOrders(
    allowPartial ? reviewableItems : items,
    seed,
    fixedOrders,
  );
  const payloads = [];
  const mappings = {};
  const skipped = [];
  const partial = [];

  for (const item of items) {
    const packId = item.id;
    const declaredCandidates = item.candidates.map((agent) => ({
      agentId: agent.id,
      label: agent.label,
      output:
        !modelAudit || modelAudit[`${packId}/${agent.id}`]
          ? outputIndex[packId]?.[agent.id]
          : undefined,
    }));
    const missing = declaredCandidates.filter(
      ({ output }) => typeof output !== "string" || output.length === 0,
    );
    const candidates = declaredCandidates.filter(
      ({ output }) => typeof output === "string" && output.length > 0,
    );
    if (missing.length > 0 && (!allowPartial || candidates.length < 2)) {
      skipped.push({
        packId,
        missingAgents: missing.map(({ agentId }) => agentId),
      });
      continue;
    }
    if (missing.length > 0) {
      partial.push({
        packId,
        includedAgents: candidates.map(({ agentId }) => agentId),
        missingAgents: missing.map(({ agentId }) => agentId),
      });
    }
    for (const candidate of candidates) {
      if (outputConfig.type === "frame") {
        let parsed;
        try {
          parsed = new URL(candidate.output);
        } catch {
          throw new Error(
            `${packId}/${candidate.agentId} has an invalid Frame URL`,
          );
        }
        if (!["https:", "http:"].includes(parsed.protocol)) {
          throw new Error(
            `${packId}/${candidate.agentId} Frame URL must use HTTP or HTTPS`,
          );
        }
        if (!parsed.pathname.startsWith("/share/frame/")) {
          throw new Error(
            `${packId}/${candidate.agentId} must use a Frame sharing URL`,
          );
        }
      } else {
        candidate.answerPath = path.resolve(outputIndexRoot, candidate.output);
        if (path.extname(candidate.answerPath).toLowerCase() !== ".md") {
          throw new Error(
            `${packId}/${candidate.agentId} answer must be a Markdown file`,
          );
        }
        try {
          const stat = await fs.stat(candidate.answerPath);
          if (!stat.isFile()) {
            throw new Error("not a file");
          }
        } catch {
          throw new Error(
            `${packId}/${candidate.agentId} answer file does not exist: ${candidate.output}`,
          );
        }
      }
    }

    const candidateById = new Map(
      candidates.map((candidate) => [candidate.agentId, candidate]),
    );
    const shuffled = slotDesign.orders
      .get(item.id)
      .map((candidateId) => candidateById.get(candidateId));
    const slots = [];
    for (let index = 0; index < shuffled.length; index += 1) {
      const candidate = shuffled[index];
      const slot = String(index + 1);
      if (outputConfig.type === "frame") {
        slots.push({ slot, frameUrl: candidate.output });
      } else {
        const answerFile = path.join("files", packId, `answer-${slot}.md`);
        const answerPath = path.join(outRoot, answerFile);
        await fs.mkdir(path.dirname(answerPath), { recursive: true });
        await fs.copyFile(candidate.answerPath, answerPath);
        slots.push({
          slot,
          answerFile: answerFile.split(path.sep).join("/"),
        });
      }
    }
    const mapping = Object.fromEntries(
      shuffled.map((candidate, index) => [
        String(index + 1),
        { agentId: candidate.agentId, label: candidate.label },
      ]),
    );
    payloads.push({
      packId,
      outputType: outputConfig.type,
      reviewType: reviewConfig.type,
      ...(reviewConfig.collection
        ? { reviewCollection: reviewConfig.collection }
        : {}),
      slots,
      brief: item.prompt,
    });
    mappings[packId] = { slots: mapping };
  }

  await writeJson(path.join(outRoot, "payloads.json"), payloads);
  await writeJson(path.join(outRoot, "mapping.private.json"), mappings);
  await writeJson(path.join(outRoot, "skipped.json"), skipped);
  await writeJson(path.join(outRoot, "partial.private.json"), partial);
  await writeJson(path.join(outRoot, "blinding.private.json"), {
    seed,
    preservedItemCount: fixedOrders.size,
    positionCounts: slotDesign.positionCounts,
  });
  await appendRunEvent(logPath, "blind_build_completed", {
    payloadCount: payloads.length,
    skippedCount: skipped.length,
    partialCount: partial.length,
    seed,
    preservedItemCount: fixedOrders.size,
  });
  stdout(
    `Built ${payloads.length} blind matchup(s); skipped ${skipped.length} incomplete item(s); included ${partial.length} partial matchup(s).`,
  );
  stdout(`Private mapping: ${path.join(outRoot, "mapping.private.json")}`);
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
