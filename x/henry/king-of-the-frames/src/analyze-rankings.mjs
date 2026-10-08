import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRunEvent,
  createSeededRandom,
  mean,
  parseArgs,
  percentile,
  readJson,
  requireArg,
  stderr,
  stdout,
  writeJson,
} from "./lib.mjs";

function center(values) {
  const average = mean(values);
  return values.map((value) => value - average);
}

function solveLinear(matrix, vector) {
  const size = matrix.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) {
      throw new Error("ranking information matrix is singular");
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const pivotValue = rows[column][column];
    for (let inner = column; inner <= size; inner += 1) {
      rows[column][inner] /= pivotValue;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = rows[row][column];
      for (let inner = column; inner <= size; inner += 1) {
        rows[row][inner] -= factor * rows[column][inner];
      }
    }
  }
  return rows.map((row) => row[size]);
}

function inverse(matrix) {
  return matrix.map((_, column) =>
    solveLinear(
      matrix,
      matrix.map((__, row) => (row === column ? 1 : 0)),
    ),
  );
}

function likelihoodState(theta, observations, candidateIndex, ridge) {
  const size = theta.length;
  let objective = -0.5 * ridge * theta.reduce((sum, value) => sum + value ** 2, 0);
  const gradient = theta.map((value) => -ridge * value);
  const information = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (__, column) =>
      row === column ? ridge : 0,
    ),
  );
  for (const observation of observations) {
    const observationWeight = observation.weight ?? 1;
    const order = observation.order.map((candidateId) => {
      const index = candidateIndex.get(candidateId);
      if (index === undefined) {
        throw new Error(`unknown candidate ${candidateId}`);
      }
      return index;
    });
    for (let stage = 0; stage < order.length - 1; stage += 1) {
      const remaining = order.slice(stage);
      const maximum = Math.max(...remaining.map((index) => theta[index]));
      const weights = remaining.map((index) => Math.exp(theta[index] - maximum));
      const denominator = weights.reduce((sum, value) => sum + value, 0);
      objective +=
        observationWeight *
        (theta[order[stage]] - maximum - Math.log(denominator));
      gradient[order[stage]] += observationWeight;
      for (let left = 0; left < remaining.length; left += 1) {
        const leftIndex = remaining[left];
        const leftProbability = weights[left] / denominator;
        gradient[leftIndex] -= observationWeight * leftProbability;
        for (let right = 0; right < remaining.length; right += 1) {
          const rightIndex = remaining[right];
          const rightProbability = weights[right] / denominator;
          information[leftIndex][rightIndex] +=
            observationWeight *
            ((leftIndex === rightIndex ? leftProbability : 0) -
              leftProbability * rightProbability);
        }
      }
    }
  }
  return { objective, gradient, information };
}

export function fitPlackettLuce(
  observations,
  candidateIds,
  { ridge = 1e-4, maxIterations = 100 } = {},
) {
  if (observations.length === 0) {
    throw new Error("at least one ranking is required");
  }
  const candidateIndex = new Map(
    candidateIds.map((candidateId, index) => [candidateId, index]),
  );
  let theta = Array(candidateIds.length).fill(0);
  let state = likelihoodState(theta, observations, candidateIndex, ridge);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const delta = solveLinear(state.information, state.gradient);
    let step = 1;
    let accepted = null;
    while (step >= 1 / 1024) {
      const candidateTheta = center(
        theta.map((value, index) => value + step * delta[index]),
      );
      const candidateState = likelihoodState(
        candidateTheta,
        observations,
        candidateIndex,
        ridge,
      );
      if (candidateState.objective >= state.objective) {
        accepted = { theta: candidateTheta, state: candidateState };
        break;
      }
      step /= 2;
    }
    if (!accepted) {
      break;
    }
    theta = accepted.theta;
    state = accepted.state;
    if (Math.max(...delta.map((value) => Math.abs(step * value))) < 1e-8) {
      break;
    }
  }
  const covariance = inverse(state.information);
  return {
    scores: Object.fromEntries(
      candidateIds.map((candidateId, index) => [candidateId, theta[index]]),
    ),
    covariance,
    objective: state.objective,
  };
}

export function collectRankingObservations(feedback, mapping, manifest) {
  const questionByItem = new Map(
    manifest.items.map(({ id, questionId }) => [id, questionId]),
  );
  const observations = [];
  for (const matchup of feedback.matchups ?? []) {
    const slots = mapping[matchup.packId]?.slots;
    if (!slots) {
      throw new Error(`missing private mapping for ${matchup.packId}`);
    }
    const questionId = questionByItem.get(matchup.packId);
    if (!questionId) {
      throw new Error(`missing question mapping for ${matchup.packId}`);
    }
    for (const ranking of matchup.rankings ?? []) {
      observations.push({
        itemId: matchup.packId,
        questionId,
        reviewerId: ranking.userId,
        order: ranking.slots.map((slot) => {
          const candidate = slots[slot];
          if (!candidate) {
            throw new Error(`unknown slot ${slot} in ${matchup.packId}`);
          }
          return candidate.agentId;
        }),
      });
    }
  }
  return observations;
}

function kendallTau(left, right) {
  const rightPosition = new Map(
    right.map((candidateId, index) => [candidateId, index]),
  );
  let concordant = 0;
  let discordant = 0;
  for (let first = 0; first < left.length; first += 1) {
    for (let second = first + 1; second < left.length; second += 1) {
      if (rightPosition.get(left[first]) < rightPosition.get(left[second])) {
        concordant += 1;
      } else {
        discordant += 1;
      }
    }
  }
  return (concordant - discordant) / (concordant + discordant);
}

function majorityPairwiseAgreement(left, right) {
  const tau = kendallTau(left, right);
  return tau > 0 ? (tau + 1) / 2 : 0;
}

export function applySameThreadSimilarityDiscount(
  observations,
  discountStrength,
) {
  if (
    !Number.isFinite(discountStrength) ||
    discountStrength < 0 ||
    discountStrength > 1
  ) {
    throw new Error("same-thread similarity discount must be between 0 and 1");
  }
  const byItem = new Map();
  for (const observation of observations) {
    const item = byItem.get(observation.itemId) ?? [];
    item.push(observation);
    byItem.set(observation.itemId, item);
  }
  return observations.map((observation) => {
    const peers = byItem.get(observation.itemId);
    const redundantSimilarity = peers
      .filter((peer) => peer !== observation)
      .reduce(
        (sum, peer) =>
          sum + majorityPairwiseAgreement(observation.order, peer.order),
        0,
      );
    return {
      ...observation,
      weight: 1 / (1 + discountStrength * redundantSimilarity),
    };
  });
}

export function reviewerAgreement(observations) {
  const byItem = new Map();
  for (const observation of observations) {
    const item = byItem.get(observation.itemId) ?? [];
    item.push(observation);
    byItem.set(observation.itemId, item);
  }
  const comparisons = [];
  for (const item of byItem.values()) {
    for (let left = 0; left < item.length; left += 1) {
      for (let right = left + 1; right < item.length; right += 1) {
        comparisons.push({
          reviewerPair: [item[left].reviewerId, item[right].reviewerId]
            .sort()
            .join("/"),
          exact: item[left].order.join("/") === item[right].order.join("/"),
          tau: kendallTau(item[left].order, item[right].order),
        });
      }
    }
  }
  const pairGroups = new Map();
  for (const comparison of comparisons) {
    const group = pairGroups.get(comparison.reviewerPair) ?? [];
    group.push(comparison);
    pairGroups.set(comparison.reviewerPair, group);
  }
  return {
    comparisonCount: comparisons.length,
    exactAgreement:
      comparisons.length === 0
        ? null
        : mean(comparisons.map(({ exact }) => (exact ? 1 : 0))),
    meanKendallTau:
      comparisons.length === 0
        ? null
        : mean(comparisons.map(({ tau }) => tau)),
    reviewerPairs: Object.fromEntries(
      [...pairGroups.entries()].map(([pair, rows]) => [
        pair,
        {
          comparisonCount: rows.length,
          exactAgreement: mean(rows.map(({ exact }) => (exact ? 1 : 0))),
          meanKendallTau: mean(rows.map(({ tau }) => tau)),
        },
      ]),
    ),
  };
}

function bootstrapScores(observations, candidateIds, replicates, seed) {
  const byQuestion = new Map();
  for (const observation of observations) {
    const group = byQuestion.get(observation.questionId) ?? [];
    group.push(observation);
    byQuestion.set(observation.questionId, group);
  }
  const questionIds = [...byQuestion.keys()];
  const random = createSeededRandom(`${seed}:bootstrap`);
  const samples = [];
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const sample = [];
    for (let index = 0; index < questionIds.length; index += 1) {
      const selected = questionIds[Math.floor(random() * questionIds.length)];
      sample.push(...byQuestion.get(selected));
    }
    samples.push(fitPlackettLuce(sample, candidateIds).scores);
  }
  return samples;
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function operationalSummary(audit) {
  if (!audit) {
    return [];
  }
  const groups = new Map();
  for (const record of audit.records ?? []) {
    if (!record.outputProduced) {
      continue;
    }
    const group = groups.get(record.candidateId) ?? [];
    group.push(record);
    groups.set(record.candidateId, group);
  }
  return [...groups.entries()].map(([candidateId, records]) => {
    const latencies = records
      .map(({ latencyMs }) => latencyMs)
      .filter(Number.isFinite);
    const credits = records.map(({ consumption }) =>
      Number(consumption?.billedCredits ?? 0),
    );
    const toolCalls = records.map(({ consumption }) =>
      (consumption?.details?.tools ?? []).reduce(
        (sum, tool) => sum + Number(tool.callCount ?? 0),
        0,
      ),
    );
    return {
      candidateId,
      outputCount: records.length,
      latencyMs: {
        median: percentile(latencies, 0.5),
        p90: percentile(latencies, 0.9),
      },
      billedCredits: {
        mean: mean(credits),
        median: percentile(credits, 0.5),
        p90: percentile(credits, 0.9),
        total: credits.reduce((sum, value) => sum + value, 0),
      },
      toolCalls: {
        mean: mean(toolCalls),
        median: percentile(toolCalls, 0.5),
        p90: percentile(toolCalls, 0.9),
      },
    };
  });
}

export function analyzeRankings({
  feedback,
  mapping,
  manifest,
  audit = null,
  bootstrapReplicates = 500,
  sameThreadSimilarityDiscount = 0,
}) {
  const rawObservations = collectRankingObservations(feedback, mapping, manifest);
  const observations = applySameThreadSimilarityDiscount(
    rawObservations,
    sameThreadSimilarityDiscount,
  );
  const candidateIds = manifest.candidates.map(({ id }) => id);
  const labelById = new Map(
    manifest.candidates.map(({ id, label }) => [id, label]),
  );
  const fit = fitPlackettLuce(observations, candidateIds);
  const samples = bootstrapScores(
    observations,
    candidateIds,
    bootstrapReplicates,
    manifest.seed,
  );
  const bestCounts = new Map(candidateIds.map((candidateId) => [candidateId, 0]));
  for (const sample of samples) {
    const best = candidateIds.reduce((left, right) =>
      sample[left] >= sample[right] ? left : right,
    );
    bestCounts.set(best, bestCounts.get(best) + 1);
  }
  const candidates = candidateIds
    .map((candidateId) => {
      const values = samples.map((sample) => sample[candidateId]);
      return {
        candidateId,
        label: labelById.get(candidateId),
        score: fit.scores[candidateId],
        scoreCi95: [percentile(values, 0.025), percentile(values, 0.975)],
        probabilityBest: bestCounts.get(candidateId) / samples.length,
      };
    })
    .sort((left, right) => right.score - left.score);
  const pairwise = [];
  for (let left = 0; left < candidateIds.length; left += 1) {
    for (let right = left + 1; right < candidateIds.length; right += 1) {
      const leftId = candidateIds[left];
      const rightId = candidateIds[right];
      const scoreDifferences = samples.map(
        (sample) => sample[leftId] - sample[rightId],
      );
      pairwise.push({
        left: leftId,
        right: rightId,
        leftWinProbability: logistic(fit.scores[leftId] - fit.scores[rightId]),
        leftHigherProbability:
          scoreDifferences.filter((difference) => difference > 0).length /
          scoreDifferences.length,
        scoreDifferenceCi95: [
          percentile(scoreDifferences, 0.025),
          percentile(scoreDifferences, 0.975),
        ],
      });
    }
  }
  const effortPairs = [
    ["fable-low", "fable-high"],
    ["sol-low", "sol-high"],
    ["v4-flash-low", "v4-flash-high"],
    ["grok-4-6-low", "grok-4-6-high"],
  ].map(([low, high]) => {
    const differences = samples.map((sample) => sample[high] - sample[low]);
    return {
      low,
      high,
      scoreDifference: fit.scores[high] - fit.scores[low],
      differenceCi95: [
        percentile(differences, 0.025),
        percentile(differences, 0.975),
      ],
      highWinProbability: logistic(fit.scores[high] - fit.scores[low]),
    };
  });
  return {
    rankingCount: rawObservations.length,
    effectiveRankingCount: observations.reduce(
      (sum, observation) => sum + observation.weight,
      0,
    ),
    rankingWeighting: {
      method: "majority_same_thread_pairwise_agreement",
      discountStrength: sameThreadSimilarityDiscount,
      discountedRankingCount: observations.filter(({ weight }) => weight < 1)
        .length,
      minimumWeight: Math.min(...observations.map(({ weight }) => weight)),
    },
    questionCount: new Set(observations.map(({ questionId }) => questionId)).size,
    bootstrapReplicates,
    candidates,
    pairwise,
    effortPairs,
    reviewerAgreement: reviewerAgreement(observations),
    operational: operationalSummary(audit),
  };
}

function markdown(analysis) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const lines = [
    "# Ranked model analysis",
    "",
    `- Complete rankings: ${analysis.rankingCount}`,
    `- Effective weighted rankings: ${analysis.effectiveRankingCount.toFixed(1)}`,
    `- Same-thread similarity discount: ${analysis.rankingWeighting.discountStrength.toFixed(2)}`,
    `- Questions represented: ${analysis.questionCount}`,
    `- Question-clustered bootstrap replicates: ${analysis.bootstrapReplicates}`,
    "",
    "| Configuration | PL score (95% clustered CI) | Probability best |",
    "|---|---:|---:|",
  ];
  for (const candidate of analysis.candidates) {
    lines.push(
      `| ${candidate.label} | ${candidate.score.toFixed(3)} (${candidate.scoreCi95[0].toFixed(3)}, ${candidate.scoreCi95[1].toFixed(3)}) | ${percent(candidate.probabilityBest)} |`,
    );
  }
  lines.push(
    "",
    "## Effort contrasts",
    "",
    "| Model | High-low score (95% clustered CI) | P(high beats low) |",
    "|---|---:|---:|",
  );
  for (const pair of analysis.effortPairs) {
    const model = pair.high.replace(/-high$/, "");
    lines.push(
      `| ${model} | ${pair.scoreDifference.toFixed(3)} (${pair.differenceCi95[0].toFixed(3)}, ${pair.differenceCi95[1].toFixed(3)}) | ${percent(pair.highWinProbability)} |`,
    );
  }
  const agreement = analysis.reviewerAgreement;
  lines.push(
    "",
    "## Reviewer agreement",
    "",
    `- Compared co-reviews: ${agreement.comparisonCount}`,
    `- Exact agreement: ${agreement.exactAgreement === null ? "n/a" : percent(agreement.exactAgreement)}`,
    `- Mean Kendall tau: ${agreement.meanKendallTau === null ? "n/a" : agreement.meanKendallTau.toFixed(3)}`,
  );
  if (analysis.operational.length > 0) {
    lines.push(
      "",
      "## Operations",
      "",
      "| Configuration | N | Latency median/p90 (s) | Billed credits mean/p90 | Tool calls mean/p90 |",
      "|---|---:|---:|---:|---:|",
    );
    const labelById = new Map(
      analysis.candidates.map(({ candidateId, label }) => [candidateId, label]),
    );
    for (const row of analysis.operational) {
      lines.push(
        `| ${labelById.get(row.candidateId) ?? row.candidateId} | ${row.outputCount} | ${(row.latencyMs.median / 1000).toFixed(1)} / ${(row.latencyMs.p90 / 1000).toFixed(1)} | ${row.billedCredits.mean.toFixed(2)} / ${row.billedCredits.p90.toFixed(2)} | ${row.toolCalls.mean.toFixed(1)} / ${row.toolCalls.p90.toFixed(1)} |`,
      );
    }
  }
  lines.push(
    "",
    "Scores use a weakly regularized, ranking-weighted Plackett-Luce fit. A ranking's weight is 1 / (1 + discount × summed majority pairwise agreement with other reviews of the same output). Pairwise-agreement similarity is used only when more than half of the implied preferences agree, so similar rankings receive a redundancy discount while conflicting rankings are not discounted. Confidence intervals resample whole questions, retaining both threads and all reviews for a sampled question.",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = path.resolve(requireArg(args, "out"));
  const logPath =
    typeof args.log === "string" ? path.resolve(args.log) : undefined;
  const bootstrapReplicates = Number(args.bootstrap ?? 500);
  if (!Number.isInteger(bootstrapReplicates) || bootstrapReplicates < 1) {
    throw new Error("--bootstrap must be a positive integer");
  }
  const sameThreadSimilarityDiscount = Number(
    args["same-thread-similarity-discount"] ?? 0,
  );
  if (
    !Number.isFinite(sameThreadSimilarityDiscount) ||
    sameThreadSimilarityDiscount < 0 ||
    sameThreadSimilarityDiscount > 1
  ) {
    throw new Error(
      "--same-thread-similarity-discount must be between 0 and 1",
    );
  }
  const audit =
    typeof args.audit === "string"
      ? await readJson(path.resolve(args.audit))
      : null;
  await appendRunEvent(logPath, "ranking_analysis_started", {
    bootstrapReplicates,
    sameThreadSimilarityDiscount,
  });
  const analysis = analyzeRankings({
    feedback: await readJson(path.resolve(requireArg(args, "feedback"))),
    mapping: await readJson(path.resolve(requireArg(args, "mapping"))),
    manifest: await readJson(path.resolve(requireArg(args, "manifest"))),
    audit,
    bootstrapReplicates,
    sameThreadSimilarityDiscount,
  });
  await writeJson(path.join(outRoot, "analysis.json"), analysis);
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(
    path.join(outRoot, "RANKING_ANALYSIS.md"),
    markdown(analysis),
  );
  await appendRunEvent(logPath, "ranking_analysis_completed", {
    rankingCount: analysis.rankingCount,
    effectiveRankingCount: analysis.effectiveRankingCount,
    questionCount: analysis.questionCount,
    bootstrapReplicates,
  });
  stdout(`Analyzed ${analysis.rankingCount} ranking(s).`);
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
