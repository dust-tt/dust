import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
  createSeededRandom,
  loadDatasetItems,
  parseArgs,
  readJson,
  requireArg,
  seededShuffle,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

export const TEXT_EXPERIMENT_CANDIDATES = [
  {
    id: "fable-low",
    agentId: "dust",
    label: "Fable / low",
    modelSelection: {
      providerId: "anthropic",
      modelId: "claude-fable-5",
      reasoningEffort: "light",
    },
  },
  {
    id: "fable-high",
    agentId: "dust",
    label: "Fable / high",
    modelSelection: {
      providerId: "anthropic",
      modelId: "claude-fable-5",
      reasoningEffort: "high",
    },
  },
  {
    id: "sonnet-high",
    agentId: "dust",
    label: "Sonnet / high",
    modelSelection: {
      providerId: "anthropic",
      modelId: "claude-sonnet-5",
      reasoningEffort: "high",
    },
  },
  {
    id: "luna-high",
    agentId: "dust",
    label: "Luna / high",
    modelSelection: {
      providerId: "openai",
      modelId: "gpt-5.6-luna",
      reasoningEffort: "high",
    },
  },
  {
    id: "sol-low",
    agentId: "dust",
    label: "Sol / low",
    modelSelection: {
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      reasoningEffort: "light",
    },
  },
  {
    id: "sol-high",
    agentId: "dust",
    label: "Sol / high",
    modelSelection: {
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      reasoningEffort: "high",
    },
  },
  {
    id: "k3-high",
    agentId: "dust",
    label: "K3 / high",
    modelSelection: {
      providerId: "fireworks",
      modelId: "accounts/fireworks/models/kimi-k3",
      reasoningEffort: "high",
    },
  },
  {
    id: "v4-flash-low",
    agentId: "dust",
    label: "v4 Flash / low",
    modelSelection: {
      providerId: "fireworks",
      modelId: "accounts/fireworks/models/deepseek-v4-flash-0731",
      reasoningEffort: "light",
    },
  },
  {
    id: "v4-flash-high",
    agentId: "dust",
    label: "v4 Flash / high",
    modelSelection: {
      providerId: "fireworks",
      modelId: "accounts/fireworks/models/deepseek-v4-flash-0731",
      reasoningEffort: "high",
    },
  },
  {
    id: "grok-4-6-low",
    agentId: "dust",
    label: "Grok 4.6 / low",
    modelSelection: {
      providerId: "xai",
      modelId: "grok-4.6",
      reasoningEffort: "light",
    },
  },
  {
    id: "grok-4-6-high",
    agentId: "dust",
    label: "Grok 4.6 / high",
    modelSelection: {
      providerId: "xai",
      modelId: "grok-4.6",
      reasoningEffort: "high",
    },
  },
];

export const TEXT_EXPERIMENT_PRICING = {
  effectiveDate: "2026-08-25",
  source: "front/lib/api/assistant/token_pricing/global.ts",
  inferenceRegion: "global-baseline",
  models: {
    "claude-fable-5": {
      inputUsdPerMillion: 10,
      cacheReadUsdPerMillion: 1,
      cacheWriteUsdPerMillion: 12.5,
      outputUsdPerMillion: 50,
    },
    "claude-sonnet-5": {
      inputUsdPerMillion: 2,
      cacheReadUsdPerMillion: 0.2,
      cacheWriteUsdPerMillion: 2.5,
      outputUsdPerMillion: 10,
    },
    "gpt-5.6-luna": {
      inputUsdPerMillion: 0.2,
      cacheReadUsdPerMillion: 0.02,
      cacheWriteUsdPerMillion: 0.25,
      outputUsdPerMillion: 1.2,
    },
    "gpt-5.6-sol": {
      inputUsdPerMillion: 5,
      cacheReadUsdPerMillion: 0.5,
      cacheWriteUsdPerMillion: 6.25,
      outputUsdPerMillion: 30,
    },
    "accounts/fireworks/models/kimi-k3": {
      inputUsdPerMillion: 3.75,
      cacheReadUsdPerMillion: 0.375,
      cacheWriteUsdPerMillion: 0,
      cacheWriteSupported: false,
      outputUsdPerMillion: 18.75,
    },
    "accounts/fireworks/models/deepseek-v4-flash-0731": {
      inputUsdPerMillion: 0.14,
      cacheReadUsdPerMillion: 0.028,
      cacheWriteUsdPerMillion: 0,
      cacheWriteSupported: false,
      outputUsdPerMillion: 0.28,
    },
    "grok-4.6": {
      inputUsdPerMillion: 2,
      cacheReadUsdPerMillion: 0.5,
      cacheWriteUsdPerMillion: 0,
      cacheWriteSupported: false,
      outputUsdPerMillion: 6,
    },
  },
};

const EXTRA_PAIR_CYCLE = [0, 1, 2, 4, 5, 3, 7, 8, 9, 10];

function combinations(values, size) {
  if (size === 0) {
    return [[]];
  }
  const output = [];
  for (let index = 0; index <= values.length - size; index += 1) {
    for (const suffix of combinations(values.slice(index + 1), size - 1)) {
      output.push([values[index], ...suffix]);
    }
  }
  return output;
}

function pairKey(left, right) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function triplePairKeys(triple) {
  return combinations(triple, 2).map(([left, right]) => pairKey(left, right));
}

function targetPairCounts(candidateCount) {
  const counts = new Map(
    combinations(
      Array.from({ length: candidateCount }, (_, index) => index),
      2,
    ).map(([left, right]) => [pairKey(left, right), 2]),
  );
  // For eight candidates, solve the 16 omitted triangles of K8. Each pair
  // occurs in six of its 56 triangles; removing 2*K8-C8 leaves 4*K8+C8.
  const cycle =
    candidateCount === 8
      ? Array.from({ length: 8 }, (_, index) => index)
      : EXTRA_PAIR_CYCLE;
  for (let index = 0; index < cycle.length; index += 1) {
    const left = cycle[index];
    const right = cycle[(index + 1) % cycle.length];
    counts.set(pairKey(left, right), candidateCount === 8 ? 1 : 3);
  }
  return counts;
}

export function solveBalancedTriplets(candidateCount = 11) {
  if (candidateCount !== 8 && candidateCount !== 11) {
    throw new Error("the balanced design requires exactly 8 or 11 candidates");
  }
  const candidateIndexes = Array.from(
    { length: candidateCount },
    (_, index) => index,
  );
  const pairCounts = targetPairCounts(candidateCount);
  const pairKeys = [...pairCounts.keys()];
  const triples = combinations(candidateIndexes, 3);
  const pairsByTriple = triples.map(triplePairKeys);
  const triplesByPair = new Map(pairKeys.map((key) => [key, []]));
  for (let index = 0; index < triples.length; index += 1) {
    for (const key of pairsByTriple[index]) {
      triplesByPair.get(key).push(index);
    }
  }

  const selected = [];
  const used = new Set();
  const search = () => {
    if ([...pairCounts.values()].every((count) => count === 0)) {
      return true;
    }
    const remainingDegrees = Array(candidateCount).fill(0);
    for (const [key, count] of pairCounts) {
      const [left, right] = key.split(":").map(Number);
      remainingDegrees[left] += count;
      remainingDegrees[right] += count;
    }
    if (remainingDegrees.some((degree) => degree % 2 !== 0)) {
      return false;
    }

    let eligible = null;
    for (const key of pairKeys) {
      if (pairCounts.get(key) === 0) {
        continue;
      }
      const candidates = triplesByPair
        .get(key)
        .filter(
          (tripleIndex) =>
            !used.has(tripleIndex) &&
            pairsByTriple[tripleIndex].every(
              (pair) => pairCounts.get(pair) > 0,
            ),
        );
      if (candidates.length === 0) {
        return false;
      }
      if (eligible === null || candidates.length < eligible.length) {
        eligible = candidates;
      }
    }

    for (const tripleIndex of eligible) {
      for (const key of pairsByTriple[tripleIndex]) {
        pairCounts.set(key, pairCounts.get(key) - 1);
      }
      selected.push(tripleIndex);
      used.add(tripleIndex);
      if (search()) {
        return true;
      }
      used.delete(tripleIndex);
      selected.pop();
      for (const key of pairsByTriple[tripleIndex]) {
        pairCounts.set(key, pairCounts.get(key) + 1);
      }
    }
    return false;
  };

  if (!search()) {
    throw new Error("could not construct the balanced triplet design");
  }
  return candidateCount === 8
    ? triples.filter((_, index) => !used.has(index))
    : selected.map((index) => triples[index]);
}

function disjointTripletMatching(triplets) {
  const search = (remaining, matched) => {
    if (remaining.length === 0) {
      return matched;
    }
    const left = remaining[0];
    const leftCandidates = new Set(triplets[left]);
    for (const right of remaining.slice(1)) {
      if (triplets[right].some((candidate) => leftCandidates.has(candidate))) {
        continue;
      }
      const next = remaining.filter(
        (tripletIndex) => tripletIndex !== left && tripletIndex !== right,
      );
      const result = search(next, [...matched, [left, right]]);
      if (result) {
        return result;
      }
    }
    return null;
  };
  const result = search(
    triplets.map((_, index) => index),
    [],
  );
  if (!result) {
    throw new Error(
      "could not pair the triplets into disjoint question blocks",
    );
  }
  return result;
}

export function parseQuestionsMarkdown(body) {
  const questions = [];
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*(\d+)\.\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    questions.push({
      number: Number(match[1]),
      prompt: match[2].replaceAll("**", "").trim(),
    });
  }
  if (
    questions.length !== 20 ||
    questions.some(({ number }, index) => number !== index + 1)
  ) {
    throw new Error(
      "questions Markdown must contain numbered questions 1 through 20",
    );
  }
  return questions;
}

export async function loadQuestionsDirectory(questionsDir) {
  const entries = await fs.readdir(questionsDir, { withFileTypes: true });
  const questionFiles = entries
    .filter((entry) => entry.isFile() && /^q\d{2}\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const expectedFiles = Array.from(
    { length: 20 },
    (_, index) => `q${String(index + 1).padStart(2, "0")}.md`,
  );
  if (JSON.stringify(questionFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("questions directory must contain q01.md through q20.md");
  }
  return Promise.all(
    questionFiles.map(async (fileName, index) => {
      const prompt = (
        await fs.readFile(path.join(questionsDir, fileName), "utf8")
      ).trim();
      if (!prompt) {
        throw new Error(`${fileName} must contain a non-empty prompt`);
      }
      return { number: index + 1, prompt };
    }),
  );
}

function logDeterminant(matrix) {
  const work = matrix.map((row) => [...row]);
  let logDeterminantValue = 0;
  for (let column = 0; column < work.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < work.length; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(work[pivot][column]) < 1e-12) {
      throw new Error("the concurrence graph is disconnected");
    }
    [work[column], work[pivot]] = [work[pivot], work[column]];
    const pivotValue = work[column][column];
    logDeterminantValue += Math.log(Math.abs(pivotValue));
    for (let row = column + 1; row < work.length; row += 1) {
      const factor = work[row][column] / pivotValue;
      for (let inner = column + 1; inner < work.length; inner += 1) {
        work[row][inner] -= factor * work[column][inner];
      }
    }
  }
  return logDeterminantValue;
}

export function summarizeDesign(triplets) {
  const candidateCount = Math.max(...triplets.flat()) + 1;
  const pairCounts = Array.from({ length: candidateCount }, () =>
    Array(candidateCount).fill(0),
  );
  const exposures = Array(candidateCount).fill(0);
  for (const triplet of triplets) {
    for (const candidate of triplet) {
      exposures[candidate] += 1;
    }
    for (const [left, right] of combinations(triplet, 2)) {
      pairCounts[left][right] += 1;
      pairCounts[right][left] += 1;
    }
  }
  const laplacian = pairCounts.map((row, index) =>
    row.map((count, column) =>
      index === column ? row.reduce((sum, value) => sum + value, 0) : -count,
    ),
  );
  const cofactor = laplacian.slice(0, -1).map((row) => row.slice(0, -1));
  const logPseudoDeterminant =
    Math.log(candidateCount) + logDeterminant(cofactor);
  const geometricMeanEigenvalue = Math.exp(
    logPseudoDeterminant / (candidateCount - 1),
  );
  return {
    tripletCount: triplets.length,
    outputCount: triplets.length * 3,
    exposures,
    pairCounts,
    minPairCount: Math.min(
      ...pairCounts.flatMap((row, index) => row.slice(index + 1)),
    ),
    maxPairCount: Math.max(...pairCounts.flat()),
    geometricMeanEigenvalue,
    dEfficiency:
      geometricMeanEigenvalue / ((6 * triplets.length) / (candidateCount - 1)),
  };
}

export function buildPreparedExperiment(
  questions,
  seed,
  {
    outputType = "answer",
    candidates = TEXT_EXPERIMENT_CANDIDATES,
    reviewerCount = 5,
  } = {},
) {
  if (outputType !== "answer" && outputType !== "frame") {
    throw new Error("outputType must be answer or frame");
  }
  if (
    questions.length !== 20 ||
    questions.some(
      (question, index) =>
        question.number !== index + 1 || !question.prompt?.trim(),
    )
  ) {
    throw new Error(
      "the balanced design requires non-empty questions 1 through 20",
    );
  }
  if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) {
    throw new Error("candidate IDs must be unique");
  }
  if (reviewerCount !== 5 && reviewerCount !== 8) {
    throw new Error("reviewerCount must be 5 or 8");
  }
  const triplets = solveBalancedTriplets(candidates.length);
  const random = createSeededRandom(seed);
  const matchedTriplets = seededShuffle(
    disjointTripletMatching(triplets),
    random,
  );
  const items = [];
  const manifestItems = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const matched = [...matchedTriplets[index]];
    if (random() < 0.5) {
      matched.reverse();
    }
    for (let threadIndex = 0; threadIndex < matched.length; threadIndex += 1) {
      const scheduleIndex = matched[threadIndex];
      const candidateIndexes = triplets[scheduleIndex];
      const id = `q${String(question.number).padStart(2, "0")}-${
        threadIndex === 0 ? "a" : "b"
      }`;
      items.push({
        id,
        prompt: question.prompt,
        candidates: candidateIndexes.map(
          (candidateIndex) => candidates[candidateIndex],
        ),
        attachments: [],
      });
      manifestItems.push({
        id,
        questionId: `q${String(question.number).padStart(2, "0")}`,
        questionNumber: question.number,
        scheduleIndex,
        candidateIds: candidateIndexes.map(
          (candidateIndex) => candidates[candidateIndex].id,
        ),
      });
    }
  }
  return {
    items,
    manifest: {
      version: 1,
      seed,
      evidenceMode: "live-tools",
      outputType,
      reviewType: "ranking",
      questionCount: questions.length,
      candidates,
      design: summarizeDesign(triplets),
      items: manifestItems,
      reviewerDesign: {
        reviewerCount,
        reviewersPerThread: 2,
        threadsPerReviewer: 80 / reviewerCount,
        ...(reviewerCount === 5
          ? { threadsPerReviewerPair: 4 }
          : {
              reviewerPairsWithOneThread: 16,
              reviewerPairsWithTwoThreads: 12,
            }),
      },
    },
  };
}

function incrementNestedCount(counts, outerKey, innerKey) {
  const innerCounts = counts.get(outerKey) ?? new Map();
  innerCounts.set(innerKey, (innerCounts.get(innerKey) ?? 0) + 1);
  counts.set(outerKey, innerCounts);
}

function reviewerScheduleScore(questionBlocks, schedule) {
  const pairCandidateCounts = new Map();
  const reviewerCandidateCounts = new Map();
  for (
    let questionIndex = 0;
    questionIndex < questionBlocks.length;
    questionIndex += 1
  ) {
    for (let threadIndex = 0; threadIndex < 2; threadIndex += 1) {
      const pair = schedule[questionIndex][threadIndex];
      const pairKey = [...pair].sort((left, right) => left - right).join(":");
      for (const candidate of questionBlocks[questionIndex][threadIndex]
        .candidates) {
        incrementNestedCount(pairCandidateCounts, pairKey, candidate.id);
        for (const reviewerIndex of pair) {
          incrementNestedCount(
            reviewerCandidateCounts,
            reviewerIndex,
            candidate.id,
          );
        }
      }
    }
  }
  const pairCandidateCoverages = [...pairCandidateCounts.values()].map(
    (counts) => counts.size,
  );
  const pairCandidateCountsFlat = [...pairCandidateCounts.values()].flatMap(
    (counts) => [...counts.values()],
  );
  const reviewerCandidateCountsFlat = [
    ...reviewerCandidateCounts.values(),
  ].flatMap((counts) => [...counts.values()]);
  return {
    minimumPairCandidateCoverage: Math.min(...pairCandidateCoverages),
    totalPairCandidateCoverage: pairCandidateCoverages.reduce(
      (sum, count) => sum + count,
      0,
    ),
    maximumPairCandidateCount: Math.max(...pairCandidateCountsFlat),
    pairCandidateConcentration: pairCandidateCountsFlat.reduce(
      (sum, count) => sum + count ** 2,
      0,
    ),
    reviewerCandidateConcentration: reviewerCandidateCountsFlat.reduce(
      (sum, count) => sum + count ** 2,
      0,
    ),
  };
}

function compareReviewerScheduleScores(left, right) {
  const comparisons = [
    left.minimumPairCandidateCoverage - right.minimumPairCandidateCoverage,
    left.totalPairCandidateCoverage - right.totalPairCandidateCoverage,
    right.maximumPairCandidateCount - left.maximumPairCandidateCount,
    right.pairCandidateConcentration - left.pairCandidateConcentration,
    right.reviewerCandidateConcentration - left.reviewerCandidateConcentration,
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
}

export function buildReviewerAssignments(items, reviewers, seed) {
  if (items.length !== 40) {
    throw new Error("reviewer assignment requires the 40-thread design");
  }
  if (
    !Array.isArray(reviewers) ||
    ![5, 8].includes(reviewers.length) ||
    reviewers.some((reviewer) => typeof reviewer !== "string" || !reviewer)
  ) {
    throw new Error(
      "reviewers must contain exactly five or eight non-empty IDs",
    );
  }
  if (new Set(reviewers).size !== reviewers.length) {
    throw new Error("reviewer IDs must be unique");
  }
  const questionBlocks = Array.from({ length: items.length / 2 }, (_, index) =>
    items.slice(index * 2, index * 2 + 2),
  );
  for (const [left, right] of questionBlocks) {
    const leftMatch = left.id.match(/^(.*)-a$/);
    const rightMatch = right.id.match(/^(.*)-b$/);
    if (!leftMatch || !rightMatch || leftMatch[1] !== rightMatch[1]) {
      throw new Error(
        "reviewer assignment requires adjacent a/b question threads",
      );
    }
  }

  const reviewerIndexes = reviewers.map((_, index) => index);
  const reviewerPairs = combinations(reviewerIndexes, 2);
  let matchingSchedule;
  if (reviewers.length === 8) {
    // K8 plus the cube edges is a 10-regular reviewer multigraph: 40 threads,
    // every pair once or twice, and each reviewer on ten distinct questions.
    const pairs = [
      ...reviewerPairs,
      ...reviewerPairs.filter(([left, right]) =>
        [1, 2, 4].includes(left ^ right),
      ),
    ];
    matchingSchedule = disjointTripletMatching(pairs).map(([left, right]) => [
      pairs[left],
      pairs[right],
    ]);
  } else {
    const matchings = combinations(reviewerPairs, 2).filter(
      ([left, right]) => new Set([...left, ...right]).size === 4,
    );
    const factorization = combinations(matchings, 5).find((candidate) => {
      const pairKeys = candidate.flatMap((matching) =>
        matching.map((pair) => pair.join(":")),
      );
      return new Set(pairKeys).size === reviewerPairs.length;
    });
    if (!factorization) {
      throw new Error("could not construct the reviewer-pair factorization");
    }

    matchingSchedule = [...matchings, ...factorization];
  }
  const random = createSeededRandom(`${seed}:reviewers`);
  let bestSchedule = null;
  let bestScore = null;
  for (let iteration = 0; iteration < 20_000; iteration += 1) {
    const schedule = seededShuffle(matchingSchedule, random).map((matching) =>
      random() < 0.5 ? [matching[1], matching[0]] : matching,
    );
    const score = reviewerScheduleScore(questionBlocks, schedule);
    if (
      bestScore === null ||
      compareReviewerScheduleScores(score, bestScore) > 0
    ) {
      bestSchedule = schedule;
      bestScore = score;
    }
  }
  if (!bestSchedule) {
    throw new Error("could not optimize the reviewer schedule");
  }

  return questionBlocks.flatMap((block, questionIndex) =>
    block.map((item, threadIndex) => ({
      itemId: item.id,
      reviewers: bestSchedule[questionIndex][threadIndex].map(
        (reviewerIndex) => reviewers[reviewerIndex],
      ),
    })),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const questionsPath =
    typeof args.questions === "string" ? path.resolve(args.questions) : null;
  const questionsDir =
    typeof args["questions-dir"] === "string"
      ? path.resolve(args["questions-dir"])
      : null;
  const sourceDataset =
    typeof args["source-dataset"] === "string"
      ? path.resolve(args["source-dataset"])
      : null;
  if (
    [questionsPath, questionsDir, sourceDataset].filter(Boolean).length !== 1
  ) {
    throw new Error(
      "provide exactly one of --questions, --questions-dir, or --source-dataset",
    );
  }
  const outputType = args["output-type"] ?? "answer";
  if (outputType !== "answer" && outputType !== "frame") {
    throw new Error("--output-type must be answer or frame");
  }
  const outRoot = path.resolve(requireArg(args, "out"));
  const seed = requireArg(args, "seed");
  const logPath =
    typeof args.log === "string"
      ? path.resolve(args.log)
      : path.join(outRoot, "events.jsonl");
  await appendRunEvent(logPath, "experiment_preparation_started", {
    questionsPath: questionsPath ?? questionsDir ?? sourceDataset,
    seed,
    outputType,
  });
  let questions = questionsDir
    ? await loadQuestionsDirectory(questionsDir)
    : questionsPath
      ? parseQuestionsMarkdown(await fs.readFile(questionsPath, "utf8"))
      : null;
  if (sourceDataset) {
    const sourceItems = await loadDatasetItems(sourceDataset);
    const byQuestion = new Map();
    for (const item of sourceItems) {
      const match = item.id.match(/^q(\d{2})-[ab]$/);
      if (!match || item.attachments.length > 0) {
        throw new Error(
          "source dataset requires qNN-a/b IDs and attachment-free prompts",
        );
      }
      const number = Number(match[1]);
      if (byQuestion.has(number) && byQuestion.get(number) !== item.prompt) {
        throw new Error(
          `source dataset has conflicting prompts for question ${number}`,
        );
      }
      byQuestion.set(number, item.prompt);
    }
    questions = [...byQuestion]
      .sort(([left], [right]) => left - right)
      .map(([number, prompt]) => ({ number, prompt }));
  }
  const candidates =
    typeof args.candidates === "string"
      ? await readJson(path.resolve(args.candidates))
      : TEXT_EXPERIMENT_CANDIDATES;
  const reviewerInput =
    typeof args.reviewers === "string"
      ? await readJson(path.resolve(args.reviewers))
      : null;
  const reviewers = Array.isArray(reviewerInput)
    ? reviewerInput
    : reviewerInput?.reviewers;
  const prepared = buildPreparedExperiment(questions, seed, {
    outputType,
    candidates,
    reviewerCount: reviewers?.length ?? 5,
  });
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(
    path.join(outRoot, "dataset.jsonl"),
    `${prepared.items.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  await writeJson(
    path.join(outRoot, "manifest.private.json"),
    prepared.manifest,
  );
  await writeJson(path.join(outRoot, "config.json"), {
    apiBaseUrl: "https://dust.tt/api/v1",
    output: { type: outputType },
    review: { type: "ranking" },
    concurrency: 4,
    timeoutMs: 900_000,
    pollIntervalMs: 4000,
    timezone: "Europe/Paris",
  });
  if (args.candidates === undefined) {
    await writeJson(
      path.join(outRoot, "pricing.snapshot.json"),
      TEXT_EXPERIMENT_PRICING,
    );
  }

  if (reviewers) {
    await writeJson(
      path.join(outRoot, "reviewer-assignments.private.json"),
      buildReviewerAssignments(prepared.items, reviewers, seed),
    );
  }
  await appendRunEvent(logPath, "experiment_preparation_completed", {
    itemCount: prepared.items.length,
    outputCount: prepared.manifest.design.outputCount,
    dEfficiency: prepared.manifest.design.dEfficiency,
  });
  stdout(
    `Prepared ${prepared.items.length} triplets from ${questions.length} questions.`,
  );
  stdout(
    `D-efficiency: ${(prepared.manifest.design.dEfficiency * 100).toFixed(2)}%.`,
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
