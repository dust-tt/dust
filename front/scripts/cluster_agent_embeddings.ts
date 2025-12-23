import { makeScript } from "@app/scripts/helpers";

interface AgentWithEmbedding {
  agentSid: string;
  agentName: string;
  workspaceName: string;
  instructionsPreview: string;
  embedding: number[];
}

interface ClusteredAgent {
  agentSid: string;
  agentName: string;
  workspaceName: string;
  instructionsPreview: string;
  clusterId: number;
  distanceToCenter: number;
}

interface Cluster {
  clusterId: number;
  size: number;
  agents: ClusteredAgent[];
  centroid: number[];
}

// Compute Euclidean distance between two vectors
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// Compute cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Compute centroid of a set of embeddings
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }
  return centroid;
}

// K-means clustering
function kMeans(
  embeddings: number[][],
  k: number,
  maxIterations: number = 100
): { assignments: number[]; centroids: number[][] } {
  const n = embeddings.length;
  if (n === 0 || k <= 0) {
    return { assignments: [], centroids: [] };
  }

  // Initialize centroids using k-means++ initialization
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();

  // First centroid: random
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...embeddings[firstIdx]]);
  usedIndices.add(firstIdx);

  // Remaining centroids: k-means++
  for (let c = 1; c < k; c++) {
    const distances: number[] = [];
    let totalDist = 0;

    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(embeddings[i], centroid);
        minDist = Math.min(minDist, dist);
      }
      distances.push(minDist ** 2);
      totalDist += minDist ** 2;
    }

    // Weighted random selection
    let r = Math.random() * totalDist;
    let selectedIdx = 0;
    for (let i = 0; i < n; i++) {
      r -= distances[i];
      if (r <= 0) {
        selectedIdx = i;
        break;
      }
    }
    centroids.push([...embeddings[selectedIdx]]);
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    const newAssignments: number[] = [];
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(embeddings[i], centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = c;
        }
      }
      newAssignments.push(minIdx);
    }

    // Check for convergence
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (newAssignments[i] !== assignments[i]) {
        changed = true;
        break;
      }
    }

    assignments = newAssignments;

    if (!changed) {
      break;
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      const clusterEmbeddings: number[][] = [];
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          clusterEmbeddings.push(embeddings[i]);
        }
      }
      if (clusterEmbeddings.length > 0) {
        centroids[c] = computeCentroid(clusterEmbeddings);
      }
    }
  }

  return { assignments, centroids };
}

makeScript(
  {
    input: {
      type: "string",
      demandOption: true,
      description: "Input JSON file with agent embeddings",
    },
    output: {
      type: "string",
      demandOption: true,
      description: "Output JSON file for clustered agents",
    },
    maxClusterSize: {
      type: "number",
      default: 10,
      description: "Maximum number of agents per cluster",
    },
    minClusters: {
      type: "number",
      default: 0,
      description:
        "Minimum number of clusters (0 = auto-calculate based on maxClusterSize)",
    },
  },
  async ({ input, output, maxClusterSize, minClusters }, logger) => {
    const fs = await import("fs/promises");

    const jsonContent = await fs.readFile(input, "utf-8");
    const agents = JSON.parse(jsonContent) as AgentWithEmbedding[];

    logger.info({ agentCount: agents.length }, "Loaded agent embeddings");

    if (agents.length === 0) {
      logger.warn("No agents to cluster");
      await fs.writeFile(output, JSON.stringify({ clusters: [] }, null, 2));
      return;
    }

    // Calculate number of clusters
    const numClusters =
      minClusters > 0
        ? minClusters
        : Math.max(1, Math.ceil(agents.length / maxClusterSize));

    logger.info(
      { numClusters, maxClusterSize, agentCount: agents.length },
      "Starting clustering"
    );

    // Extract embeddings
    const embeddings = agents.map((a) => a.embedding);

    // Run k-means
    const { assignments, centroids } = kMeans(embeddings, numClusters);

    // Build clusters
    const clusterMap = new Map<number, ClusteredAgent[]>();

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const clusterId = assignments[i];
      const centroid = centroids[clusterId];
      const distanceToCenter = euclideanDistance(agent.embedding, centroid);

      const clusteredAgent: ClusteredAgent = {
        agentSid: agent.agentSid,
        agentName: agent.agentName,
        workspaceName: agent.workspaceName,
        instructionsPreview: agent.instructionsPreview,
        clusterId,
        distanceToCenter,
      };

      const existing = clusterMap.get(clusterId) ?? [];
      existing.push(clusteredAgent);
      clusterMap.set(clusterId, existing);
    }

    // Convert to sorted cluster array
    const clusters: Cluster[] = [];
    for (const [clusterId, clusterAgents] of clusterMap) {
      // Sort agents by distance to center (most representative first)
      clusterAgents.sort((a, b) => a.distanceToCenter - b.distanceToCenter);

      clusters.push({
        clusterId,
        size: clusterAgents.length,
        agents: clusterAgents,
        centroid: centroids[clusterId],
      });
    }

    // Sort clusters by size (largest first)
    clusters.sort((a, b) => b.size - a.size);

    // Compute cluster statistics
    const clusterSizes = clusters.map((c) => c.size);
    const avgSize = clusterSizes.reduce((a, b) => a + b, 0) / clusters.length;
    const maxSize = Math.max(...clusterSizes);
    const minSize = Math.min(...clusterSizes);

    // Compute inter-cluster similarity (sample)
    const samplePairs: { c1: number; c2: number; similarity: number }[] = [];
    for (let i = 0; i < Math.min(clusters.length, 10); i++) {
      for (let j = i + 1; j < Math.min(clusters.length, 10); j++) {
        const similarity = cosineSimilarity(
          clusters[i].centroid,
          clusters[j].centroid
        );
        samplePairs.push({
          c1: clusters[i].clusterId,
          c2: clusters[j].clusterId,
          similarity,
        });
      }
    }
    samplePairs.sort((a, b) => b.similarity - a.similarity);

    const result = {
      metadata: {
        totalAgents: agents.length,
        numClusters: clusters.length,
        maxClusterSize,
        avgClusterSize: avgSize,
        actualMaxSize: maxSize,
        actualMinSize: minSize,
      },
      mostSimilarClusterPairs: samplePairs.slice(0, 5),
      clusters: clusters.map((c) => ({
        clusterId: c.clusterId,
        size: c.size,
        agents: c.agents.map(
          ({ agentSid, agentName, workspaceName, instructionsPreview }) => ({
            agentSid,
            agentName,
            workspaceName,
            instructionsPreview,
          })
        ),
      })),
    };

    await fs.writeFile(output, JSON.stringify(result, null, 2), "utf-8");

    logger.info(
      {
        numClusters: clusters.length,
        avgClusterSize: avgSize.toFixed(2),
        maxClusterSize: maxSize,
        minClusterSize: minSize,
        outputPath: output,
      },
      "Clustering completed"
    );
  }
);
