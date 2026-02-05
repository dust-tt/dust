import * as fs from "fs";
import * as path from "path";

import OpenAI from "openai";

import { concurrentExecutor } from "@app/lib/utils/async_utils";

interface AgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_TEXT_LENGTH = 10000; // ~8K tokens conservative estimate
const PARALLELISM = 16; 

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/2_embed_prompts.ts --workspace <workspaceId>",
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

async function embedText(client: OpenAI, text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

async function main() {
  const { workspace } = parseArgs();

  const apiKey = process.env.DUST_MANAGED_OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_OPENAI_API_KEY environment variable is required",
    );
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const inputPath = path.join(workspaceDir, "1_agents.json");
  const outputPath = path.join(workspaceDir, "2_embeddings.json");

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error("Please run the SQL query first and save the output as:");
    console.error(`  ${inputPath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  console.log(`Reading agents from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const agents: AgentData[] = JSON.parse(rawData);

  console.log(
    `Found ${agents.length} agents to embed (parallelism: ${PARALLELISM})`,
  );

  let completed = 0;

  const embeddedAgents = await concurrentExecutor(
    agents,
    async (agent) => {
      const text = `${agent.agent_name}\n\n${agent.instructions}`.slice(
        0,
        MAX_TEXT_LENGTH,
      );

      const embedding = await embedText(client, text);

      completed++;
      if (completed % 50 === 0) {
        console.log(`Processing agent ${completed}/${agents.length}...`);
      }

      return {
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        embedding,
      };
    },
    { concurrency: PARALLELISM },
  );

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(embeddedAgents, null, 2));
  console.log(`\nEmbeddings written to ${outputPath}`);
  console.log(`Total agents embedded: ${embeddedAgents.length}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
