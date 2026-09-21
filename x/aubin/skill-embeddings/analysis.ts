import { Matrix, SingularValueDecomposition } from "ml-matrix";
import type { EmbeddingData } from "./data";

export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("Expected a finite, nonzero embedding vector.");
  }
  return vector.map((value) => value / norm);
}

function squaredDistance(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
}

/**
 * @cc [owner:aubin-tchoi,label:product] full-vector-analysis
 * PCA centers L2-normalized embeddings. Clustering and cosine similarity must use the full
 * normalized vectors, never the 2D PCA coordinates. Degenerate PCA must return finite zeros.
 */
export function analyze(
  data: EmbeddingData,
  clusterCounts: number[],
  seed: number,
) {
  if (data.skills.length === 0) {
    throw new Error(
      "No skills to analyze. Check the workspace, status, and visibility settings.",
    );
  }
  const vectors = data.skills.map((skill) => {
    if (!skill.embedding) {
      throw new Error(
        "Embedding file is incomplete. Rerun the fetch command to resume.",
      );
    }
    return normalize(skill.embedding);
  });
  const centered = new Matrix(vectors).center("column");
  const totalVariance = centered
    .to1DArray()
    .reduce((sum, value) => sum + value * value, 0);
  let coordinates = vectors.map(() => [0, 0]);
  let explainedVariance = [0, 0];
  // Exact SVD is CPU work in this offline CLI, not an application request. Typical runs
  // contain hundreds of skills; large workspaces may take minutes. Report progress in the CLI.
  if (vectors.length > 1 && totalVariance > 1e-20) {
    const svd = new SingularValueDecomposition(centered, {
      autoTranspose: true,
    });
    const singular = svd.diagonal;
    const left = svd.leftSingularVectors;
    coordinates = vectors.map((_, index) =>
      [0, 1].map((axis) =>
        axis < singular.length ? left.get(index, axis) * singular[axis] : 0,
      ),
    );
    explainedVariance = [0, 1].map(
      (axis) => (singular[axis] ?? 0) ** 2 / totalVariance,
    );
  }
  // Pairwise silhouette distances are bounded to 96 sampled points, computed once in the CLI.
  // This is a diagnostic of that subset, not the whole workspace's silhouette score.
  const sampled = shuffledIndices(vectors.length, seed).slice(0, 96);
  const distances = sampled.map((i) =>
    sampled.map((j) => squaredDistance(vectors[i], vectors[j]) / 2),
  );
  const maxK = Math.min(
    vectors.length,
    new Set(vectors.map((v) => JSON.stringify(v))).size,
  );
  const counts = [
    ...new Set(clusterCounts.map((k) => Math.min(k, maxK))),
  ].toSorted((a, b) => a - b);
  const clusters = counts.map((k) => {
    const attempts = [0, 1, 2].map((attempt) =>
      kmeans(vectors, k, seed + attempt),
    );
    const best = attempts.reduce((a, b) => (a.inertia <= b.inertia ? a : b));
    return {
      k,
      ...best,
      silhouette: silhouette(
        distances,
        sampled.map((i) => best.labels[i]),
      ),
    };
  });
  return {
    version: 1,
    workspace: data.workspace,
    model: data.model,
    dimensions: data.dimensions,
    createdAt: data.createdAt,
    seed,
    normalized: true,
    coordinates,
    explainedVariance,
    clusters,
    silhouetteSampleSize: sampled.length,
    skills: data.skills.map((skill, index) => ({
      ...skill,
      embedding: vectors[index],
    })),
  };
}
export type Analysis = ReturnType<typeof analyze>;

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffledIndices(length: number, seed: number): number[] {
  const random = randomGenerator(seed);
  const result = Array.from({ length }, (_, index) => index);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// K-means++ initialization and Lloyd updates, three seeded restarts in analyze().
// Work is O(iterations * n * k * dimensions), bounded to 100 iterations per run.
function kmeans(vectors: number[][], k: number, seed: number) {
  const random = randomGenerator(seed);
  let centroids = [vectors[Math.floor(random() * vectors.length)].slice()];
  let nearest = vectors.map(() => Infinity);
  while (centroids.length < k) {
    const last = centroids[centroids.length - 1];
    nearest = nearest.map((value, index) =>
      Math.min(value, squaredDistance(vectors[index], last)),
    );
    let target = random() * nearest.reduce((sum, value) => sum + value, 0);
    let selected = nearest.length - 1;
    for (let i = 0; i < nearest.length; i++) {
      target -= nearest[i];
      if (target < 0) {
        selected = i;
        break;
      }
    }
    centroids.push(vectors[selected].slice());
  }
  let labels = vectors.map(() => -1);
  let iterations = 0;
  let converged = false;
  for (; iterations < 100; iterations++) {
    const next = vectors.map((vector) => {
      let best = 0;
      let distance = Infinity;
      for (let i = 0; i < k; i++) {
        const candidate = squaredDistance(vector, centroids[i]);
        if (candidate < distance) {
          distance = candidate;
          best = i;
        }
      }
      return best;
    });
    if (next.every((value, index) => value === labels[index])) {
      converged = true;
      break;
    }
    labels = next;
    const sums = centroids.map(() => vectors[0].map(() => 0));
    const counts = centroids.map(() => 0);
    vectors.forEach((vector, index) => {
      counts[labels[index]]++;
      vector.forEach((value, dimension) => {
        sums[labels[index]][dimension] += value;
      });
    });
    centroids = sums.map((sum, index) =>
      counts[index] > 0
        ? sum.map((value) => value / counts[index])
        : centroids[index],
    );
  }
  return {
    labels,
    inertia: vectors.reduce(
      (sum, vector, index) =>
        sum + squaredDistance(vector, centroids[labels[index]]),
      0,
    ),
    iterations,
    converged,
  };
}

function silhouette(distances: number[][], labels: number[]): number | null {
  const unique = new Set(labels);
  if (unique.size < 2 || unique.size === labels.length) {
    return null;
  }
  let total = 0;
  for (let i = 0; i < labels.length; i++) {
    const groups = new Map<number, { sum: number; count: number }>();
    for (let j = 0; j < labels.length; j++) {
      if (i === j) {
        continue;
      }
      const group = groups.get(labels[j]) ?? { sum: 0, count: 0 };
      groups.set(labels[j], {
        sum: group.sum + distances[i][j],
        count: group.count + 1,
      });
    }
    const own = groups.get(labels[i]);
    if (!own) {
      continue;
    }
    const a = own.sum / own.count;
    const b = Math.min(
      ...[...groups]
        .filter(([label]) => label !== labels[i])
        .map(([, g]) => g.sum / g.count),
    );
    total += Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
  }
  return total / labels.length;
}
