import type { SkillsSnapshotType } from "./data";
import { bracketPrefixes, buildTaggingInput } from "./data";
import type { Neighbor, SimilarityMethod, TagSet, TagSpace } from "./similarity";
import {
  buildTagSpace,
  matchingSkills,
  rankNeighbors,
  seededRandom,
  shuffled,
  similarity,
  similarityMatrix,
  SIMILARITY_METHODS,
  tagNeighbors,
} from "./similarity";
import type { StabilityFileType, TagsFileType } from "./tagging";
import { FACETS, tagKey } from "./taxonomy";

export type EmbeddingReference = {
  model: string;
  dimensions: number;
  // L2-normalized vectors, one per skill ID.
  vectors: Map<string, number[]>;
};

const NARROWING_PATH = ["function", "subject", "task", "output"];
const PAIR_FACETS = ["function", "task", "subject", "output"];
const NEIGHBOR_KS = [5, 10];
const TIGHT_BUCKET_MAX = 10;
const TARGET_BUCKET_MAX = 5;
const COHESION_MIN_MEMBERS = 3;
const COHESION_BOOTSTRAP = 30;

// USD per million tokens; used only to estimate what a run cost.
const PRICING_USD_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

// Author-assigned bracket labels in skill names, mapped to the function tags they imply. Labels
// absent here (person names, "app", "wip") are not evaluated.
const PREFIX_FUNCTIONS: Record<string, string[]> = {
  gtm: ["sales", "customer-success"],
  cx: ["customer-success", "support"],
  cxos: ["customer-success", "support"],
  cs: ["customer-success"],
  se: ["sales"],
  sales: ["sales"],
  revops: ["sales"],
  growth: ["sales", "marketing"],
  demo: ["sales"],
  solutions: ["sales", "customer-success"],
  "agent optimization": ["customer-success"],
  support: ["support"],
  partnerships: ["partnerships"],
  partner: ["partnerships"],
  talent: ["people-talent"],
  people: ["people-talent"],
  product: ["product"],
  releases: ["product"],
  eng: ["engineering"],
  design: ["design"],
  content: ["marketing"],
  marketing: ["marketing"],
  comms: ["marketing"],
  community: ["marketing"],
  grc: ["legal-compliance"],
  security: ["legal-compliance", "engineering"],
  it: ["workplace-it"],
  office: ["workplace-it"],
  team: ["team-management", "general"],
  "area lead": ["team-management"],
  utils: ["general"],
};

// Name patterns that group skills a human would call the same kind of skill. Patterns must not
// name people or customers; this file is public.
const NAME_FAMILIES: { id: string; pattern: RegExp }[] = [
  { id: "brand-image", pattern: /brand[ _]?image|branded/i },
  { id: "business-case", pattern: /^business case/i },
  { id: "vp-of-sales", pattern: /^vp of sales/i },
  { id: "hiring", pattern: /^hiring/i },
  { id: "query-api", pattern: /^query .* api/i },
  { id: "credit-usage", pattern: /credit/i },
  { id: "call-analysis", pattern: /call[ _]analysis/i },
  { id: "post-call", pattern: /post[- ]?call/i },
  { id: "meeting-prep", pattern: /meeting prep/i },
  { id: "weekly-goals", pattern: /weekly goals|^goals$/i },
  { id: "find-people", pattern: /find[ _]people|search prospects/i },
  { id: "tone-of-voice", pattern: /tone|writing style|writing tone|voice$/i },
  { id: "test", pattern: /^test|test$|testpr|test\d|^dnkd|hellohello/i },
];

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function bucketStats(buckets: number[][], total: number) {
  const sizes = buckets.map((bucket) => bucket.length);
  const covered = new Set<number>();
  for (const bucket of buckets) {
    if (bucket.length >= 2 && bucket.length <= TIGHT_BUCKET_MAX) {
      for (const member of bucket) {
        covered.add(member);
      }
    }
  }
  return {
    buckets: buckets.length,
    medianSize: median(sizes),
    meanSize: round(mean(sizes)),
    maxSize: Math.max(0, ...sizes),
    shareSingleton: round(sizes.filter((size) => size === 1).length / Math.max(1, sizes.length)),
    shareTight: round(
      sizes.filter((size) => size >= 2 && size <= TIGHT_BUCKET_MAX).length /
        Math.max(1, sizes.length),
    ),
    skillsInTightBucket: round(covered.size / total),
  };
}

function facetTagCounts(sets: TagSet[], facetId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const set of sets) {
    for (const tag of set[facetId] ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

function normalizedEntropy(counts: number[], categories: number): number {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0 || categories < 2) {
    return 0;
  }
  const entropy = -counts
    .filter((count) => count > 0)
    .reduce((sum, count) => sum + (count / total) * Math.log(count / total), 0);
  return entropy / Math.log(categories);
}

function conjunctionBuckets(space: TagSpace, facetIds: string[]): number[][] {
  const combos = new Map<string, number[]>();
  const walk = (position: number, query: { facet: string; tag: string }[], members: number[]) => {
    if (position === facetIds.length) {
      combos.set(JSON.stringify(query), members);
      return;
    }
    const facetId = facetIds[position];
    const tags = new Set<string>();
    for (const member of members) {
      for (const tag of space.sets[member][facetId] ?? []) {
        tags.add(tag);
      }
    }
    for (const tag of [...tags].toSorted()) {
      const next = members.filter((member) =>
        (space.sets[member][facetId] ?? []).includes(tag),
      );
      walk(position + 1, [...query, { facet: facetId, tag }], next);
    }
  };
  walk(0, [], space.ids.map((_, index) => index));
  return [...combos.values()];
}

function pairs(items: string[]): string[][] {
  const result: string[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      result.push([items[i], items[j]]);
    }
  }
  return result;
}

function averageRanks(values: Float64Array): Float64Array {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  const ranks = new Float64Array(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && values[order[end + 1]] === values[order[start]]) {
      end++;
    }
    const rank = (start + end) / 2 + 1;
    for (let position = start; position <= end; position++) {
      ranks[order[position]] = rank;
    }
    start = end + 1;
  }
  return ranks;
}

function pearson(a: Float64Array, b: Float64Array): number {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < a.length; i++) {
    covariance += (a[i] - meanA) * (b[i] - meanB);
    varianceA += (a[i] - meanA) ** 2;
    varianceB += (b[i] - meanB) ** 2;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator === 0 ? 0 : covariance / denominator;
}

function upperTriangle(matrix: Float64Array, size: number): Float64Array {
  const values = new Float64Array((size * (size - 1)) / 2);
  let position = 0;
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      values[position++] = matrix[i * size + j];
    }
  }
  return values;
}

function cosineMatrix(space: TagSpace, reference: EmbeddingReference): Float64Array {
  const vectors = space.ids.map((id) => {
    const vector = reference.vectors.get(id);
    if (!vector) {
      throw new Error(`Embedding reference is missing skill ${id}.`);
    }
    return vector;
  });
  const size = vectors.length;
  const matrix = new Float64Array(size * size);
  for (let i = 0; i < size; i++) {
    matrix[i * size + i] = 1;
    for (let j = i + 1; j < size; j++) {
      let dot = 0;
      const a = vectors[i];
      const b = vectors[j];
      for (let d = 0; d < a.length; d++) {
        dot += a[d] * b[d];
      }
      matrix[i * size + j] = dot;
      matrix[j * size + i] = dot;
    }
  }
  return matrix;
}

function meanWithin(matrix: Float64Array, size: number, members: number[]): number {
  if (members.length < 2) {
    throw new Error("Within-group mean needs at least two members.");
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      sum += matrix[members[i] * size + members[j]];
      count++;
    }
  }
  return sum / count;
}

function modalTag(sets: TagSet[], members: number[], facetId: string) {
  const counts = new Map<string, number>();
  for (const member of members) {
    for (const tag of sets[member][facetId] ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const [best] = [...counts.entries()].toSorted(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return best
    ? { tag: best[0], share: round(best[1] / members.length) }
    : { tag: null, share: 0 };
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const tag of left) {
    if (right.has(tag)) {
      intersection++;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

/**
 * @cc [owner:aubin-tchoi,label:product] metrics-require-complete-tags
 * Metrics must be computed over every skill of the snapshot; a snapshot skill without a saved tag
 * entry, or an entry whose input hash no longer matches the snapshot, must throw rather than be
 * skipped. Reference-based metrics must throw when the reference lacks a snapshot skill.
 */
export function computeMetrics(params: {
  snapshot: SkillsSnapshotType;
  tags: TagsFileType;
  reference: EmbeddingReference | null;
  stability: StabilityFileType | null;
  seed: number;
}) {
  const { snapshot, tags, reference, stability, seed } = params;
  const ids = snapshot.skills.map((skill) => skill.id);
  const inputOptions = {
    maskNamePrefix: tags.maskNamePrefix,
    instructionTokenBudget: tags.instructionTokenBudget,
  };
  const entries = snapshot.skills.map((skill) => {
    const entry = tags.entries[skill.id];
    if (!entry) {
      throw new Error(
        `Tags are incomplete: skill ${skill.id} has no entry. Run the tag stage first.`,
      );
    }
    if (entry.inputHash !== buildTaggingInput(skill, inputOptions).inputHash) {
      throw new Error(`Tags for ${skill.id} were produced from a different skill text. Retag first.`);
    }
    return entry;
  });
  const space = buildTagSpace(ids, entries.map((entry) => entry.tags));
  const size = space.size;

  const facets = FACETS.map((facet) => {
    const counts = facetTagCounts(space.sets, facet.id);
    const perSkill = space.sets.map((set) => (set[facet.id] ?? []).length);
    const rows = facet.tags
      .map((tag) => ({
        id: tag.id,
        count: counts.get(tag.id) ?? 0,
        share: round((counts.get(tag.id) ?? 0) / size),
      }))
      .toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    return {
      id: facet.id,
      weight: facet.weight,
      coverage: round(perSkill.filter((count) => count > 0).length / size),
      meanTagsPerSkill: round(mean(perSkill)),
      distinctUsed: rows.filter((row) => row.count > 0).length,
      distinctDeclared: facet.tags.length,
      normalizedEntropy: round(
        normalizedEntropy(
          rows.map((row) => row.count),
          facet.tags.length,
        ),
      ),
      dominant: rows.filter((row) => row.share > 0.4).map((row) => row.id),
      rare: rows.filter((row) => row.count < 3).map((row) => row.id),
      tags: rows,
    };
  });

  const singleTagBuckets = Object.fromEntries(
    PAIR_FACETS.map((facetId) => [
      facetId,
      bucketStats(conjunctionBuckets(space, [facetId]), size),
    ]),
  );
  const pairBuckets = pairs(PAIR_FACETS).map((facetIds) => ({
    facets: facetIds,
    ...bucketStats(conjunctionBuckets(space, facetIds), size),
  }));
  const tripleBuckets = {
    facets: ["function", "task", "subject"],
    ...bucketStats(conjunctionBuckets(space, ["function", "task", "subject"]), size),
  };

  const narrowingSizes = space.sets.map((set) =>
    NARROWING_PATH.map((_, depth) => {
      const query = NARROWING_PATH.slice(0, depth + 1).map((facetId) => {
        const primary = (set[facetId] ?? [])[0];
        if (primary === undefined) {
          throw new Error(`Skill lacks a ${facetId} tag; cardinality was not enforced.`);
        }
        return { facet: facetId, tag: primary };
      });
      return matchingSkills(space, query).length;
    }),
  );
  const narrowing = NARROWING_PATH.map((facetId, depth) => {
    const sizes = narrowingSizes.map((row) => row[depth]);
    return {
      depth: depth + 1,
      facet: facetId,
      medianBucket: median(sizes),
      meanBucket: round(mean(sizes)),
      shareAtMostTarget: round(sizes.filter((value) => value <= TARGET_BUCKET_MAX).length / size),
      shareAtMostTight: round(sizes.filter((value) => value <= TIGHT_BUCKET_MAX).length / size),
      shareSingleton: round(sizes.filter((value) => value === 1).length / size),
    };
  });
  const depthToTarget = narrowingSizes.map((row) => {
    const depth = row.findIndex((value) => value <= TARGET_BUCKET_MAX);
    return depth === -1 ? null : depth + 1;
  });

  const weightedFacetIds = FACETS.filter((facet) => facet.weight > 0).map((facet) => facet.id);
  const signatureGroups = new Map<string, number[]>();
  space.sets.forEach((set, index) => {
    const signature = JSON.stringify(
      weightedFacetIds.map((facetId) => (set[facetId] ?? []).toSorted()),
    );
    signatureGroups.set(signature, [...(signatureGroups.get(signature) ?? []), index]);
  });

  const referenceMatrix = reference ? cosineMatrix(space, reference) : null;

  const collisions = [...signatureGroups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      ids: group.map((index) => ids[index]),
      size: group.length,
      meanCosine: referenceMatrix ? round(meanWithin(referenceMatrix, size, group)) : null,
    }))
    .toSorted((a, b) => b.size - a.size || a.ids[0].localeCompare(b.ids[0]));

  const tagMatrices = Object.fromEntries(
    SIMILARITY_METHODS.map((method) => [method, similarityMatrix(space, method)]),
  );

  const referenceMetrics = referenceMatrix
    ? computeReferenceMetrics(space, referenceMatrix, tagMatrices, seed)
    : null;

  const prefixed = ids.map((id, index) => {
    const skill = snapshot.skills[index];
    const prefix = bracketPrefixes(skill.name).find((label) => PREFIX_FUNCTIONS[label]);
    return prefix ? { index, prefix, expected: PREFIX_FUNCTIONS[prefix] } : null;
  });
  const perPrefix = new Map<
    string,
    { count: number; correct: number; observed: Map<string, number> }
  >();
  for (const item of prefixed) {
    if (!item) {
      continue;
    }
    const observed = space.sets[item.index].function ?? [];
    const row = perPrefix.get(item.prefix) ?? { count: 0, correct: 0, observed: new Map() };
    row.count++;
    if (observed.some((tag) => item.expected.includes(tag))) {
      row.correct++;
    }
    for (const tag of observed) {
      row.observed.set(tag, (row.observed.get(tag) ?? 0) + 1);
    }
    perPrefix.set(item.prefix, row);
  }
  const evaluatedPrefixes = prefixed.filter((item) => item !== null);
  const prefixFunction = {
    evaluated: evaluatedPrefixes.length,
    correct: [...perPrefix.values()].reduce((sum, row) => sum + row.correct, 0),
    accuracy: round(
      [...perPrefix.values()].reduce((sum, row) => sum + row.correct, 0) /
        Math.max(1, evaluatedPrefixes.length),
    ),
    perPrefix: [...perPrefix.entries()]
      .map(([prefix, row]) => ({
        prefix,
        expected: PREFIX_FUNCTIONS[prefix],
        count: row.count,
        correct: row.correct,
        observed: Object.fromEntries(
          [...row.observed.entries()].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
        ),
      }))
      .toSorted((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix)),
  };

  const globalTagMeans = Object.fromEntries(
    SIMILARITY_METHODS.map((method) => [
      method,
      round(mean(Array.from(upperTriangle(tagMatrices[method], size)))),
    ]),
  );
  const nameFamilies = NAME_FAMILIES.map((family) => {
    const members = ids
      .map((_, index) => index)
      .filter((index) => family.pattern.test(snapshot.skills[index].name));
    if (members.length < 2) {
      return { id: family.id, count: members.length, ids: members.map((index) => ids[index]) };
    }
    return {
      id: family.id,
      count: members.length,
      ids: members.map((index) => ids[index]),
      meanTagSimilarity: Object.fromEntries(
        SIMILARITY_METHODS.map((method) => [
          method,
          round(meanWithin(tagMatrices[method], size, members)),
        ]),
      ),
      meanCosine: referenceMatrix ? round(meanWithin(referenceMatrix, size, members)) : null,
      purity: Object.fromEntries(
        ["function", "task", "subject", "audience"].map((facetId) => [
          facetId,
          modalTag(space.sets, members, facetId),
        ]),
      ),
    };
  });

  const stabilityMetrics = stability ? computeStability(tags, stability) : null;

  const keywordCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const keyword of new Set(entry.uncoveredAspects)) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
    }
  }
  const gaps = {
    skillsWithUncoveredAspects: entries.filter((entry) => entry.uncoveredAspects.length > 0).length,
    share: round(entries.filter((entry) => entry.uncoveredAspects.length > 0).length / size),
    topKeywords: [...keywordCounts.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .toSorted((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
      .slice(0, 60),
  };

  const usage = entries.reduce(
    (sum, entry) => ({
      inputTokens: sum.inputTokens + entry.usage.inputTokens,
      cacheReadInputTokens: sum.cacheReadInputTokens + entry.usage.cacheReadInputTokens,
      cacheCreationInputTokens:
        sum.cacheCreationInputTokens + entry.usage.cacheCreationInputTokens,
      outputTokens: sum.outputTokens + entry.usage.outputTokens,
    }),
    { inputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 0 },
  );
  const pricing = PRICING_USD_PER_MTOK[tags.model];
  const estimatedCostUsd = pricing
    ? round(
        (usage.inputTokens * pricing.input +
          usage.cacheReadInputTokens * pricing.cacheRead +
          usage.cacheCreationInputTokens * pricing.cacheWrite +
          usage.outputTokens * pricing.output) /
          1_000_000,
        2,
      )
    : null;

  return {
    version: 1,
    workspace: snapshot.workspace,
    model: tags.model,
    effort: tags.effort,
    taxonomyVersion: tags.taxonomyVersion,
    taxonomyHash: tags.taxonomyHash,
    referenceModel: reference?.model ?? null,
    seed,
    createdAt: new Date().toISOString(),
    counts: {
      skills: size,
      truncatedInputs: entries.filter((entry) => entry.truncated).length,
      retried: entries.filter((entry) => entry.attempts > 1).length,
      meanTagsPerSkill: round(
        mean(space.sets.map((set) => Object.values(set).reduce((sum, tags) => sum + tags.length, 0))),
      ),
      confidence: Object.fromEntries(
        ["low", "medium", "high"].map((level) => [
          level,
          entries.filter((entry) => entry.confidence === level).length,
        ]),
      ),
      distinctTagSets: signatureGroups.size,
    },
    usage: { ...usage, estimatedCostUsd },
    facets,
    segmentation: {
      tightBucketMax: TIGHT_BUCKET_MAX,
      targetBucketMax: TARGET_BUCKET_MAX,
      singleTagBuckets,
      pairBuckets,
      tripleBuckets,
      narrowingPath: NARROWING_PATH,
      narrowing,
      depthToTarget: {
        shareByDepth: NARROWING_PATH.map((_, depth) =>
          round(depthToTarget.filter((value) => value === depth + 1).length / size),
        ),
        shareNever: round(depthToTarget.filter((value) => value === null).length / size),
      },
      collisions,
    },
    reference: referenceMetrics,
    families: { prefixFunction, nameFamilies, globalTagMeans },
    stability: stabilityMetrics,
    gaps,
  };
}
export type Metrics = ReturnType<typeof computeMetrics>;

function computeReferenceMetrics(
  space: TagSpace,
  referenceMatrix: Float64Array,
  tagMatrices: Record<string, Float64Array>,
  seed: number,
) {
  const size = space.size;
  const ids = space.ids;
  const globalCosine = mean(Array.from(upperTriangle(referenceMatrix, size)));
  const embeddingNeighbors = ids.map((_, self) =>
    rankNeighbors(ids, self, (other) => referenceMatrix[self * size + other], Math.max(...NEIGHBOR_KS)),
  );
  const tagNeighborLists = Object.fromEntries(
    SIMILARITY_METHODS.map((method) => [
      method,
      ids.map((_, self) => tagNeighbors(space, self, Math.max(...NEIGHBOR_KS), method)),
    ]),
  );

  const neighborOverlap = NEIGHBOR_KS.map((k) => ({
    k,
    random: round(k / (size - 1)),
    ...Object.fromEntries(
      SIMILARITY_METHODS.map((method) => [
        method,
        round(
          mean(
            ids.map((_, self) => {
              const reference = new Set(
                embeddingNeighbors[self].slice(0, k).map((neighbor) => neighbor.index),
              );
              return (
                tagNeighborLists[method][self]
                  .slice(0, k)
                  .filter((neighbor) => reference.has(neighbor.index)).length / k
              );
            }),
          ),
        ),
      ]),
    ),
  }));

  const referenceUpper = upperTriangle(referenceMatrix, size);
  const referenceRanks = averageRanks(referenceUpper);
  const spearman = Object.fromEntries(
    SIMILARITY_METHODS.map((method) => [
      method,
      round(pearson(referenceRanks, averageRanks(upperTriangle(tagMatrices[method], size)))),
    ]),
  );

  const random = seededRandom(seed);
  const randomOthers = (self: number, k: number) => {
    const picks = new Set<number>();
    while (picks.size < k) {
      const candidate = Math.floor(random() * size);
      if (candidate !== self) {
        picks.add(candidate);
      }
    }
    return [...picks];
  };
  const contrast = Object.fromEntries(
    SIMILARITY_METHODS.map((method) => {
      const matrix = tagMatrices[method];
      const toNeighbors = mean(
        ids.map((_, self) =>
          mean(
            embeddingNeighbors[self]
              .slice(0, 5)
              .map((neighbor) => matrix[self * size + neighbor.index]),
          ),
        ),
      );
      const toRandom = mean(
        ids.map((_, self) =>
          mean(randomOthers(self, 5).map((other) => matrix[self * size + other])),
        ),
      );
      return [
        method,
        {
          tagSimilarityToEmbeddingNeighbors: round(toNeighbors),
          tagSimilarityToRandom: round(toRandom),
          ratio: toRandom === 0 ? null : round(toNeighbors / toRandom, 2),
        },
      ];
    }),
  );

  const tagNeighborCosine = Object.fromEntries(
    SIMILARITY_METHODS.map((method) => {
      const perSkill = ids.map((_, self) =>
        mean(
          tagNeighborLists[method][self]
            .slice(0, 5)
            .map((neighbor) => referenceMatrix[self * size + neighbor.index]),
        ),
      );
      return [
        method,
        {
          meanCosineToTagNeighbors: round(mean(perSkill)),
          globalMeanCosine: round(globalCosine),
          lift: round(mean(perSkill) - globalCosine),
          oracleMeanCosineToEmbeddingNeighbors: round(
            mean(
              ids.map((_, self) =>
                mean(
                  embeddingNeighbors[self]
                    .slice(0, 5)
                    .map((neighbor) => referenceMatrix[self * size + neighbor.index]),
                ),
              ),
            ),
          ),
        },
      ];
    }),
  );

  // Bootstrap baseline: mean within-cosine of random groups of the same size.
  const bootstrapCache = new Map<number, { mean: number; std: number }>();
  const baseline = (count: number) => {
    const cached = bootstrapCache.get(count);
    if (cached) {
      return cached;
    }
    const indices = ids.map((_, index) => index);
    const samples = Array.from({ length: COHESION_BOOTSTRAP }, (_, round_) =>
      meanWithin(referenceMatrix, size, shuffled(indices, seed + round_ * 7919 + count).slice(0, count)),
    );
    const result = { mean: mean(samples), std: standardDeviation(samples) };
    bootstrapCache.set(count, result);
    return result;
  };
  const tagCohesion = FACETS.filter((facet) => facet.weight > 0)
    .flatMap((facet) =>
      facet.tags.map((tag) => {
        const members = matchingSkills(space, [{ facet: facet.id, tag: tag.id }]);
        if (members.length < COHESION_MIN_MEMBERS) {
          return null;
        }
        const within = meanWithin(referenceMatrix, size, members);
        const reference = baseline(members.length);
        return {
          key: tagKey(facet.id, tag.id),
          count: members.length,
          meanCosine: round(within),
          lift: round(within - globalCosine),
          z: reference.std === 0 ? null : round((within - reference.mean) / reference.std, 2),
        };
      }),
    )
    .filter((row) => row !== null)
    .toSorted((a, b) => (b.z ?? -Infinity) - (a.z ?? -Infinity) || a.key.localeCompare(b.key));

  const bucketCohesion = (facetIds: string[]) => {
    const buckets = conjunctionBuckets(space, facetIds).filter(
      (bucket) => bucket.length >= COHESION_MIN_MEMBERS,
    );
    const lifts = buckets.map((bucket) => meanWithin(referenceMatrix, size, bucket) - globalCosine);
    return {
      facets: facetIds,
      buckets: buckets.length,
      meanLift: round(mean(lifts)),
      shareAboveGlobal: round(lifts.filter((lift) => lift > 0).length / Math.max(1, lifts.length)),
    };
  };

  return {
    globalMeanCosine: round(globalCosine),
    neighborOverlap,
    spearman,
    contrast,
    tagNeighborCosine,
    tagCohesion,
    bucketCohesion: {
      single: PAIR_FACETS.map((facetId) => bucketCohesion([facetId])),
      pairs: pairs(PAIR_FACETS).map((facetIds) => bucketCohesion(facetIds)),
      triple: bucketCohesion(["function", "task", "subject"]),
    },
    embeddingNeighbors: Object.fromEntries(
      ids.map((id, self) => [
        id,
        embeddingNeighbors[self].map((neighbor) => ({
          id: ids[neighbor.index],
          score: round(neighbor.score),
        })),
      ]),
    ),
  };
}

function computeStability(tags: TagsFileType, stability: StabilityFileType) {
  const compared = stability.sampleIds.filter(
    (id) => tags.entries[id] && stability.entries[id],
  );
  if (compared.length === 0) {
    throw new Error("Stability file has no re-tagged skills in common with tags.json.");
  }
  const perFacet = FACETS.map((facet) => {
    const rows = compared.map((id) => {
      const original = tags.entries[id].tags[facet.id] ?? [];
      const retagged = stability.entries[id].tags[facet.id] ?? [];
      return {
        jaccard: jaccard(original, retagged),
        exact: jaccard(original, retagged) === 1,
        primary: original[0] === retagged[0],
      };
    });
    return {
      facet: facet.id,
      meanJaccard: round(mean(rows.map((row) => row.jaccard))),
      exactMatchShare: round(rows.filter((row) => row.exact).length / rows.length),
      primaryMatchShare: round(rows.filter((row) => row.primary).length / rows.length),
    };
  });
  const weighted = FACETS.filter((facet) => facet.weight > 0).map((facet) => facet.id);
  return {
    sampleSize: compared.length,
    perFacet,
    allWeightedFacetsExactShare: round(
      compared.filter((id) =>
        weighted.every(
          (facetId) =>
            jaccard(
              tags.entries[id].tags[facetId] ?? [],
              stability.entries[id].tags[facetId] ?? [],
            ) === 1,
        ),
      ).length / compared.length,
    ),
  };
}

/**
 * @cc [owner:aubin-tchoi,label:product] cosines-upper-triangle-order
 * The exported cosines are the strict upper triangle of the pairwise cosine matrix over `ids` in
 * the given order, row-major (pair (i, j) with i < j at index `i * n - i * (i + 1) / 2 + (j - i - 1)`),
 * rounded to 3 decimals. Every ID must have a reference vector.
 */
export function referenceCosines(ids: string[], reference: EmbeddingReference): number[] {
  const vectors = ids.map((id) => {
    const vector = reference.vectors.get(id);
    if (!vector) {
      throw new Error(`Embedding reference is missing skill ${id}.`);
    }
    return vector;
  });
  const values: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      let dot = 0;
      for (let d = 0; d < vectors[i].length; d++) {
        dot += vectors[i][d] * vectors[j][d];
      }
      values.push(round(dot, 3));
    }
  }
  return values;
}

export function toEmbeddingReference(embeddings: {
  model: string;
  dimensions: number;
  skills: { id: string; embedding?: number[] }[];
}): EmbeddingReference {
  const vectors = new Map<string, number[]>();
  for (const skill of embeddings.skills) {
    if (!skill.embedding) {
      throw new Error(`Embedding file is incomplete for ${skill.id}.`);
    }
    const norm = Math.sqrt(skill.embedding.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error(`Invalid embedding vector for ${skill.id}.`);
    }
    vectors.set(
      skill.id,
      skill.embedding.map((value) => value / norm),
    );
  }
  return { model: embeddings.model, dimensions: embeddings.dimensions, vectors };
}

export type { Neighbor, SimilarityMethod };
export { similarity };
