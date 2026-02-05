import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

import { concurrentExecutor } from "@app/lib/utils/async_utils";

interface AgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
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

interface SkillIdea {
  name: string;
  description: string;
  agent_names: string[];
}

interface ClusterSkillIdeas {
  cluster_id: number;
  agent_names: string[];
  skill_ideas: SkillIdea[];
}

interface GeminiResponse {
  skill_ideas: SkillIdea[];
}

const MAX_RETRIES = 3;
const MIN_CLUSTER_SIZE = 4;
const MIN_SKILL_AGENTS = 4;
const PARALLELISM = 8;

function parseArgs(): { workspace: string; cluster?: number } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");
  const clusterIndex = args.indexOf("--cluster");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/4_find_skill_ideas.ts --workspace <workspaceId> [--cluster <clusterId>]",
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
    cluster:
      clusterIndex !== -1 ? parseInt(args[clusterIndex + 1], 10) : undefined,
  };
}

function sanitizeJsonString(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

async function findSkillIdeasForCluster(
  client: GoogleGenAI,
  cluster: Cluster,
  clusterAgents: AgentData[],
  prompt: string,
): Promise<ClusterSkillIdeas> {
  const agentsContext = clusterAgents
    .map((agent) => {
      return `================================================================================
AGENT NAME: "${agent.agent_name}"
================================================================================
${agent.instructions}
================================================================================`;
    })
    .join("\n\n");

  const fullPrompt = prompt.replace("[AGENTS_CONTEXT]", agentsContext);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        config: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from API");
      }

      const sanitizedText = sanitizeJsonString(text);
      const parsed: GeminiResponse = JSON.parse(sanitizedText);

      // Filter skills to only include those with at least MIN_SKILL_AGENTS agents
      const filteredSkills = parsed.skill_ideas.filter(
        (skill) => skill.agent_names.length >= MIN_SKILL_AGENTS,
      );

      return {
        cluster_id: cluster.cluster_id,
        agent_names: cluster.agent_names,
        skill_ideas: filteredSkills,
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        console.warn(
          `  Cluster ${cluster.cluster_id}: Attempt ${attempt}/${MAX_RETRIES} failed, retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(
    `Cluster ${cluster.cluster_id}: Failed after ${MAX_RETRIES} attempts:`,
    lastError,
  );
  return {
    cluster_id: cluster.cluster_id,
    agent_names: cluster.agent_names,
    skill_ideas: [],
  };
}

async function main() {
  const { workspace, cluster: targetCluster } = parseArgs();

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required",
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const agentsPath = path.join(workspaceDir, "1_agents.json");
  const clustersPath = path.join(workspaceDir, "3_clusters.json");
  const promptPath = path.join(__dirname, "4_prompt.txt");
  const skillDefinitionPath = path.join(__dirname, "5_skill_definition.txt");
  const outputPath = path.join(workspaceDir, "4_skill_ideas.json");

  // Check input files exist
  if (!fs.existsSync(agentsPath)) {
    console.error(`Error: Agents file not found: ${agentsPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(clustersPath)) {
    console.error(`Error: Clusters file not found: ${clustersPath}`);
    console.error("Please run the clustering step first:");
    console.error(
      `  npx tsx scripts/suggest-skills/3_clustering.ts --workspace ${workspace}`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(promptPath)) {
    console.error(`Error: Prompt file not found: ${promptPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(skillDefinitionPath)) {
    console.error(
      `Error: Skill definition file not found: ${skillDefinitionPath}`
    );
    process.exit(1);
  }

  console.log("Loading data...");
  const agents: AgentData[] = JSON.parse(fs.readFileSync(agentsPath, "utf-8"));
  const clustering: ClusteringOutput = JSON.parse(
    fs.readFileSync(clustersPath, "utf-8"),
  );
  const promptTemplate = fs.readFileSync(promptPath, "utf-8");
  const skillDefinition = fs.readFileSync(skillDefinitionPath, "utf-8");
  const prompt = promptTemplate.replace("[SKILL_DEFINITION]", skillDefinition);

  // Build agent lookup map
  const agentMap = new Map<string, AgentData>();
  for (const agent of agents) {
    agentMap.set(agent.agent_id, agent);
  }

  // Filter clusters to process
  let clustersToProcess = clustering.clusters.filter(
    (c) => c.agent_ids.length >= MIN_CLUSTER_SIZE,
  );

  if (targetCluster !== undefined) {
    clustersToProcess = clustersToProcess.filter(
      (c) => c.cluster_id === targetCluster,
    );
    if (clustersToProcess.length === 0) {
      console.error(`Error: Cluster ${targetCluster} not found or too small`);
      process.exit(1);
    }
  }

  console.log(
    `Processing ${clustersToProcess.length} clusters (parallelism: ${PARALLELISM})...`,
  );

  // Prepare cluster data with their agents
  const clusterData = clustersToProcess
    .map((cluster) => {
      const clusterAgents: AgentData[] = [];
      for (const agentId of cluster.agent_ids) {
        const agent = agentMap.get(agentId);
        if (agent) {
          clusterAgents.push(agent);
        }
      }
      return { cluster, clusterAgents };
    })
    .filter(({ clusterAgents }) => clusterAgents.length >= MIN_CLUSTER_SIZE);

  let completed = 0;

  const allResults = await concurrentExecutor(
    clusterData,
    async ({ cluster, clusterAgents }) => {
      const result = await findSkillIdeasForCluster(
        client,
        cluster,
        clusterAgents,
        prompt,
      );

      completed++;
      if (completed % 10 === 0 || completed === clusterData.length) {
        console.log(`Progress: ${completed}/${clusterData.length} clusters`);
      }

      return result;
    },
    { concurrency: PARALLELISM },
  );

  // Filter out clusters with no skill ideas
  const resultsWithIdeas = allResults.filter((r) => r.skill_ideas.length > 0);

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(resultsWithIdeas, null, 2));
  console.log(`\n=== Results ===`);
  console.log(`Skill ideas written to ${outputPath}`);

  // Summary
  const totalIdeas = resultsWithIdeas.reduce(
    (sum, r) => sum + r.skill_ideas.length,
    0,
  );
  console.log(`Total clusters with ideas: ${resultsWithIdeas.length}`);
  console.log(`Total skill ideas generated: ${totalIdeas}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
