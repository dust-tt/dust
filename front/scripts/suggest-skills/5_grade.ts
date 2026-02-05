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

interface GradeResponse {
  grade: number;
  reasoning: string;
}

interface GradedSkillIdea {
  name: string;
  description: string;
  agent_names: string[];
  grade: number;
  reasoning: string;
  cluster_id: number;
}

interface SkillToGrade {
  skillIdea: SkillIdea;
  clusterId: number;
  skillAgents: AgentData[];
}

const MAX_RETRIES = 3;
const PARALLELISM = 8;
const TOP_SKILLS_COUNT = 10;

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/5_grade.ts --workspace <workspaceId>"
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

function sanitizeJsonString(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

async function gradeSkillIdea(
  client: GoogleGenAI,
  skillIdea: SkillIdea,
  agents: AgentData[],
  promptTemplate: string,
  skillDefinition: string
): Promise<GradeResponse> {
  const agentsContext = agents
    .map((agent, index) => {
      return `================================================================================
AGENT ${index + 1}: ${agent.agent_name}
================================================================================
${agent.instructions}
================================================================================`;
    })
    .join("\n\n");

  const fullPrompt = promptTemplate
    .replace("[SKILL_DEFINITION]", skillDefinition)
    .replace("[SKILL_NAME]", skillIdea.name)
    .replace("[SKILL_DESCRIPTION]", skillIdea.description)
    .replace("[AGENTS_CONTEXT]", agentsContext);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from API");
      }

      const sanitizedText = sanitizeJsonString(text);
      const parsed: GradeResponse = JSON.parse(sanitizedText);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(
    `Failed to grade ${skillIdea.name} after ${MAX_RETRIES} attempts:`,
    lastError
  );
  return { grade: 0, reasoning: "Failed to grade this skill idea." };
}

async function main() {
  const { workspace } = parseArgs();

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const agentsPath = path.join(workspaceDir, "1_agents.json");
  const skillIdeasPath = path.join(workspaceDir, "4_skill_ideas.json");
  const promptPath = path.join(__dirname, "5_prompt.txt");
  const skillDefinitionPath = path.join(__dirname, "5_skill_definition.txt");
  const outputPath = path.join(workspaceDir, "5_graded_skills.json");

  // Check input files exist
  if (!fs.existsSync(agentsPath)) {
    console.error(`Error: Agents file not found: ${agentsPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(skillIdeasPath)) {
    console.error(`Error: Skill ideas file not found: ${skillIdeasPath}`);
    console.error("Please run the skill ideas step first:");
    console.error(
      `  npx tsx scripts/suggest-skills/4_find_skill_ideas.ts --workspace ${workspace}`
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
  const clusterSkillIdeas: ClusterSkillIdeas[] = JSON.parse(
    fs.readFileSync(skillIdeasPath, "utf-8")
  );
  const promptTemplate = fs.readFileSync(promptPath, "utf-8");
  const skillDefinition = fs.readFileSync(skillDefinitionPath, "utf-8");

  // Build agent lookup map by name
  const agentMap = new Map<string, AgentData>();
  for (const agent of agents) {
    agentMap.set(agent.agent_name, agent);
  }

  // Collect all skill ideas with their cluster info and agents
  const skillsToGrade: SkillToGrade[] = [];
  for (const cluster of clusterSkillIdeas) {
    for (const skillIdea of cluster.skill_ideas) {
      const skillAgents: AgentData[] = [];
      for (const agentName of skillIdea.agent_names) {
        const agent = agentMap.get(agentName);
        if (agent) {
          skillAgents.push(agent);
        }
      }

      if (skillAgents.length > 0) {
        skillsToGrade.push({
          skillIdea,
          clusterId: cluster.cluster_id,
          skillAgents,
        });
      }
    }
  }

  console.log(
    `Grading ${skillsToGrade.length} skill ideas (parallelism: ${PARALLELISM})...`
  );

  let completed = 0;

  const gradedSkills = await concurrentExecutor(
    skillsToGrade,
    async ({ skillIdea, clusterId, skillAgents }) => {
      const gradeResponse = await gradeSkillIdea(
        client,
        skillIdea,
        skillAgents,
        promptTemplate,
        skillDefinition
      );

      completed++;
      if (completed % 10 === 0 || completed === skillsToGrade.length) {
        console.log(`Progress: ${completed}/${skillsToGrade.length} skills`);
      }

      return {
        name: skillIdea.name,
        description: skillIdea.description,
        agent_names: skillIdea.agent_names,
        grade: gradeResponse.grade,
        reasoning: gradeResponse.reasoning,
        cluster_id: clusterId,
      };
    },
    { concurrency: PARALLELISM }
  );

  // Sort by grade descending
  gradedSkills.sort((a, b) => b.grade - a.grade);

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(gradedSkills, null, 2));
  console.log(`\n=== Results ===`);
  console.log(`Graded skills written to ${outputPath}`);
  console.log(`Total skills graded: ${gradedSkills.length}`);

  // Print top 10
  console.log(`\n=== Top ${TOP_SKILLS_COUNT} Skill Ideas ===`);
  for (const skill of gradedSkills.slice(0, TOP_SKILLS_COUNT)) {
    console.log(`\n${skill.grade}/5 - ${skill.name}`);
    console.log(`  ${skill.description.slice(0, 100)}...`);
    console.log(
      `  Agents: ${skill.agent_names.slice(0, 3).join(", ")}${skill.agent_names.length > 3 ? "..." : ""}`
    );
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
