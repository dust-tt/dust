import { FACETS, tagKey } from "./taxonomy";

export type TagSet = Record<string, string[]>;

export type SimilarityMethod = "idf-cosine" | "jaccard";
export const SIMILARITY_METHODS: SimilarityMethod[] = ["idf-cosine", "jaccard"];

export type TagSpace = {
  ids: string[];
  index: Map<string, number>;
  sets: TagSet[];
  size: number;
  df: Map<string, number>;
  idf: Map<string, number>;
  vectors: Map<string, number>[];
};

const WEIGHTED_FACETS = FACETS.filter((facet) => facet.weight > 0);

/**
 * @cc [owner:aubin-tchoi,label:product] tag-space-weights
 * A tag's vector weight is its facet weight times `ln(N / df)` where `df` counts skills carrying
 * that tag, so a tag shared by every skill contributes nothing. Facets with weight 0 must be
 * excluded from vectors and from Jaccard similarity.
 */
export function buildTagSpace(ids: string[], sets: TagSet[]): TagSpace {
  if (ids.length !== sets.length || ids.length === 0) {
    throw new Error("Tag space needs one non-empty tag set per skill ID.");
  }
  const df = new Map<string, number>();
  for (const set of sets) {
    for (const facet of WEIGHTED_FACETS) {
      for (const tag of set[facet.id] ?? []) {
        const key = tagKey(facet.id, tag);
        df.set(key, (df.get(key) ?? 0) + 1);
      }
    }
  }
  const idf = new Map<string, number>();
  for (const [key, count] of df) {
    idf.set(key, Math.log(ids.length / count));
  }
  const vectors = sets.map((set) => {
    const vector = new Map<string, number>();
    for (const facet of WEIGHTED_FACETS) {
      for (const tag of set[facet.id] ?? []) {
        const key = tagKey(facet.id, tag);
        vector.set(key, facet.weight * (idf.get(key) ?? 0));
      }
    }
    return vector;
  });
  return {
    ids,
    index: new Map(ids.map((id, position) => [id, position])),
    sets,
    size: ids.length,
    df,
    idf,
    vectors,
  };
}

function norm(vector: Map<string, number>): number {
  let sum = 0;
  for (const value of vector.values()) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function idfCosine(a: Map<string, number>, b: Map<string, number>): number {
  const denominator = norm(a) * norm(b);
  if (denominator === 0) {
    return 0;
  }
  let dot = 0;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other !== undefined) {
      dot += value * other;
    }
  }
  return dot / denominator;
}

// Facets where both skills carry no tag are skipped so an absence of systems is not a match.
function facetJaccard(a: TagSet, b: TagSet): number {
  let weighted = 0;
  let weights = 0;
  for (const facet of WEIGHTED_FACETS) {
    const left = new Set(a[facet.id] ?? []);
    const right = new Set(b[facet.id] ?? []);
    if (left.size === 0 && right.size === 0) {
      continue;
    }
    let intersection = 0;
    for (const tag of left) {
      if (right.has(tag)) {
        intersection++;
      }
    }
    const union = left.size + right.size - intersection;
    weighted += facet.weight * (intersection / union);
    weights += facet.weight;
  }
  return weights === 0 ? 0 : weighted / weights;
}

export function similarity(
  space: TagSpace,
  i: number,
  j: number,
  method: SimilarityMethod,
): number {
  if (method === "idf-cosine") {
    return idfCosine(space.vectors[i], space.vectors[j]);
  }
  return facetJaccard(space.sets[i], space.sets[j]);
}

export type Neighbor = { index: number; score: number };

// Ties break on skill ID so neighbor lists are reproducible across runs.
export function rankNeighbors(
  ids: string[],
  self: number,
  score: (other: number) => number,
  k: number,
): Neighbor[] {
  const candidates: Neighbor[] = [];
  for (let other = 0; other < ids.length; other++) {
    if (other !== self) {
      candidates.push({ index: other, score: score(other) });
    }
  }
  return candidates
    .toSorted(
      (a, b) => b.score - a.score || ids[a.index].localeCompare(ids[b.index]),
    )
    .slice(0, k);
}

export function tagNeighbors(
  space: TagSpace,
  self: number,
  k: number,
  method: SimilarityMethod,
): Neighbor[] {
  return rankNeighbors(space.ids, self, (other) => similarity(space, self, other, method), k);
}

// Full pairwise matrix as a flat row-major array; used for rank correlations.
export function similarityMatrix(space: TagSpace, method: SimilarityMethod): Float64Array {
  const matrix = new Float64Array(space.size * space.size);
  for (let i = 0; i < space.size; i++) {
    matrix[i * space.size + i] = 1;
    for (let j = i + 1; j < space.size; j++) {
      const value = similarity(space, i, j, method);
      matrix[i * space.size + j] = value;
      matrix[j * space.size + i] = value;
    }
  }
  return matrix;
}

export type TagQuery = { facet: string; tag: string }[];

// AND semantics: a skill matches when it carries every queried tag in the queried facet.
export function matchingSkills(space: TagSpace, query: TagQuery): number[] {
  const matches: number[] = [];
  for (let i = 0; i < space.size; i++) {
    if (query.every(({ facet, tag }) => (space.sets[i][facet] ?? []).includes(tag))) {
      matches.push(i);
    }
  }
  return matches;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
