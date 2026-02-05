import * as fs from "fs";
import * as path from "path";

interface EmbeddedAgent {
  agent_id: string;
  agent_name: string;
  embedding: number[];
}

interface Cluster {
  cluster_id: number;
  centroid: number[];
  agent_ids: string[];
  agent_names: string[];
}

interface ClusteringOutput {
  num_clusters: number;
  clusters: Cluster[];
}

const MIN_CLUSTER_SIZE = 5;
const MAX_CLUSTER_SIZE = 20;

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/3_clustering.ts --workspace <workspaceId>"
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

// Calculate Euclidean distance between two vectors
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Calculate centroid of a set of vectors
function calculateCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }

  const dimensions = vectors[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += vector[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= vectors.length;
  }

  return centroid;
}

// K-means++ initialization for better initial centroids
function initializeCentroids(embeddings: number[][], k: number): number[][] {
  const centroids: number[][] = [];
  const n = embeddings.length;

  // Pick first centroid randomly
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...embeddings[firstIdx]]);

  // Pick remaining centroids with probability proportional to distance squared
  for (let c = 1; c < k; c++) {
    const distances: number[] = [];
    let totalDist = 0;

    for (const embedding of embeddings) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(embedding, centroid);
        minDist = Math.min(minDist, dist);
      }
      distances.push(minDist * minDist);
      totalDist += minDist * minDist;
    }

    // Weighted random selection
    let threshold = Math.random() * totalDist;
    for (let i = 0; i < n; i++) {
      threshold -= distances[i];
      if (threshold <= 0) {
        centroids.push([...embeddings[i]]);
        break;
      }
    }

    // Fallback if we didn't pick one
    if (centroids.length === c) {
      centroids.push([...embeddings[Math.floor(Math.random() * n)]]);
    }
  }

  return centroids;
}

// Assign each embedding to nearest centroid
function assignToClusters(
  embeddings: number[][],
  centroids: number[][]
): number[] {
  const assignments: number[] = [];

  for (const embedding of embeddings) {
    let minDist = Infinity;
    let minCluster = 0;

    for (let c = 0; c < centroids.length; c++) {
      const dist = euclideanDistance(embedding, centroids[c]);
      if (dist < minDist) {
        minDist = dist;
        minCluster = c;
      }
    }

    assignments.push(minCluster);
  }

  return assignments;
}

// K-means clustering algorithm
function kMeans(
  embeddings: number[][],
  k: number,
  maxIterations: number = 100
): { assignments: number[]; centroids: number[][] } {
  const actualK = Math.min(k, embeddings.length);

  let centroids = initializeCentroids(embeddings, actualK);
  let assignments = assignToClusters(embeddings, centroids);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newCentroids: number[][] = [];
    for (let c = 0; c < actualK; c++) {
      const clusterEmbeddings = embeddings.filter(
        (_, i) => assignments[i] === c
      );
      if (clusterEmbeddings.length > 0) {
        newCentroids.push(calculateCentroid(clusterEmbeddings));
      } else {
        newCentroids.push(centroids[c]);
      }
    }

    const newAssignments = assignToClusters(embeddings, newCentroids);

    let changed = false;
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== newAssignments[i]) {
        changed = true;
        break;
      }
    }

    centroids = newCentroids;
    assignments = newAssignments;

    if (!changed) {
      console.log(`  Converged after ${iter + 1} iterations`);
      break;
    }
  }

  return { assignments, centroids };
}

// Split a cluster into two smaller clusters
function splitCluster(
  embeddings: number[][],
  indices: number[]
): { cluster1: number[]; cluster2: number[] } {
  const clusterEmbeddings = indices.map((i) => embeddings[i]);
  const { assignments } = kMeans(clusterEmbeddings, 2, 50);

  const cluster1: number[] = [];
  const cluster2: number[] = [];

  for (let i = 0; i < indices.length; i++) {
    if (assignments[i] === 0) {
      cluster1.push(indices[i]);
    } else {
      cluster2.push(indices[i]);
    }
  }

  return { cluster1, cluster2 };
}

// Adaptive clustering to get clusters between MIN and MAX size
function adaptiveClustering(
  embeddings: number[][]
): Map<number, number[]> {
  const n = embeddings.length;

  // Start with an estimated number of clusters based on target size
  const targetSize = (MIN_CLUSTER_SIZE + MAX_CLUSTER_SIZE) / 2;
  const initialK = Math.max(1, Math.round(n / targetSize));

  console.log(`Starting with ${initialK} initial clusters...`);
  const { assignments } = kMeans(embeddings, initialK);

  // Build initial clusters
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const clusterId = assignments[i];
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId)!.push(i);
  }

  // Split clusters that are too large
  let nextClusterId = clusters.size;
  let splitCount = 0;

  for (const [clusterId, indices] of clusters.entries()) {
    if (indices.length > MAX_CLUSTER_SIZE) {
      console.log(
        `Splitting cluster ${clusterId} (${indices.length} agents)...`
      );

      // Recursively split until all sub-clusters are small enough
      const toSplit: number[][] = [indices];
      const newClusters: number[][] = [];

      while (toSplit.length > 0) {
        const current = toSplit.pop()!;
        if (current.length <= MAX_CLUSTER_SIZE) {
          newClusters.push(current);
        } else {
          const { cluster1, cluster2 } = splitCluster(embeddings, current);
          // Only split if it produces meaningful sub-clusters
          if (cluster1.length >= MIN_CLUSTER_SIZE && cluster2.length >= MIN_CLUSTER_SIZE) {
            toSplit.push(cluster1);
            toSplit.push(cluster2);
          } else {
            // Can't split further, keep as is
            newClusters.push(current);
          }
        }
      }

      // Remove original cluster and add new ones
      clusters.delete(clusterId);
      for (const newCluster of newClusters) {
        clusters.set(nextClusterId++, newCluster);
        splitCount++;
      }
    }
  }

  if (splitCount > 0) {
    console.log(`Split into ${splitCount} additional clusters`);
  }

  // Filter out clusters that are too small
  const validClusters = new Map<number, number[]>();
  let finalId = 0;
  for (const [, indices] of clusters.entries()) {
    if (indices.length >= MIN_CLUSTER_SIZE) {
      validClusters.set(finalId++, indices);
    } else {
      console.log(`Discarding cluster with only ${indices.length} agents`);
    }
  }

  return validClusters;
}

async function main() {
  const { workspace } = parseArgs();

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const inputPath = path.join(workspaceDir, "2_embeddings.json");
  const outputPath = path.join(workspaceDir, "3_clusters.json");

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error("Please run the embedding step first:");
    console.error(
      `  npx tsx scripts/suggest-skills/2_embed_prompts.ts --workspace ${workspace}`
    );
    process.exit(1);
  }

  console.log(`Reading embeddings from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const embeddedAgents: EmbeddedAgent[] = JSON.parse(rawData);

  console.log(`Found ${embeddedAgents.length} embedded agents`);
  console.log(
    `Target cluster size: ${MIN_CLUSTER_SIZE}-${MAX_CLUSTER_SIZE} agents`
  );

  const embeddings = embeddedAgents.map((a) => a.embedding);
  const clusterMap = adaptiveClustering(embeddings);

  // Build output
  const clusters: Cluster[] = [];
  for (const [clusterId, indices] of clusterMap.entries()) {
    const clusterEmbeddings = indices.map((i) => embeddings[i]);
    clusters.push({
      cluster_id: clusterId,
      centroid: calculateCentroid(clusterEmbeddings),
      agent_ids: indices.map((i) => embeddedAgents[i].agent_id),
      agent_names: indices.map((i) => embeddedAgents[i].agent_name),
    });
  }

  // Sort by cluster size descending
  clusters.sort((a, b) => b.agent_ids.length - a.agent_ids.length);

  const output: ClusteringOutput = {
    num_clusters: clusters.length,
    clusters,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nClusters written to ${outputPath}`);

  // Print summary
  console.log("\n=== Cluster Summary ===");
  console.log(`Total clusters: ${clusters.length}`);
  const sizes = clusters.map((c) => c.agent_ids.length);
  console.log(
    `Cluster sizes: min=${Math.min(...sizes)}, max=${Math.max(...sizes)}, avg=${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`
  );

  for (const cluster of clusters) {
    console.log(
      `\nCluster ${cluster.cluster_id} (${cluster.agent_ids.length} agents):`
    );
    const displayNames = cluster.agent_names.slice(0, 5);
    for (const name of displayNames) {
      console.log(`  - ${name}`);
    }
    if (cluster.agent_names.length > 5) {
      console.log(`  ... and ${cluster.agent_names.length - 5} more`);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
