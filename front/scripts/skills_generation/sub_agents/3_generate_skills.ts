import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

interface ParentAgentInfo {
  sId: string;
  name: string;
  instructions: string;
}

interface EnrichedAgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
  tools: Array<{
    sId: string;
    name: string;
  }>;
  agents_using_it: string;
}

interface Skill {
  name: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  instructions: string;
  requiredTools: string[];
  agentsUsingSkill: string[];
  confidenceScore: number;
  sourceAgent: {
    agentId: string;
    agentName: string;
    workspaceSid: string;
  };
}

interface GeminiResponse {
  skills: Array<{
    name: string;
    userFacingDescription: string;
    agentFacingDescription: string;
    instructions: string;
    requiredTools: string[];
    agentsUsingSkill: string[];
    confidenceScore: number;
  }>;
}

const MAX_RETRIES = 3;

interface ParentAgentPrompt {
  name: string;
  sId: string;
  instructions: string;
}

async function generateSkillsForAgent(
  client: GoogleGenAI,
  agent: EnrichedAgentData,
  prompt: string,
  parentAgentPrompts: ParentAgentPrompt[]
): Promise<Skill[]> {
  // Build parent agents context section
  let parentAgentsContext = "";
  if (parentAgentPrompts.length > 0) {
    const parentSections = parentAgentPrompts.map((parent) => {
      return `
-------------------------------------------------------------------------------
PARENT AGENT: ${parent.name} (${parent.sId})
-------------------------------------------------------------------------------
${parent.instructions}
-------------------------------------------------------------------------------`;
    });
    parentAgentsContext = `

================================================================================
CONTEXT: PARENT AGENTS USING THIS CHILD AGENT
================================================================================
The following agents call this child agent as a sub-agent. These prompts provide
CONTEXT ONLY about HOW the parent agents intend to use this child agent.

IMPORTANT: The skill should be generated based on the CHILD AGENT's prompt below,
NOT the parent agents' prompts. Use the parent agents' prompts only as context
to understand how this child agent is being used in practice.
================================================================================
${parentSections.join("\n")}
================================================================================
END OF PARENT AGENTS CONTEXT
================================================================================

`;
  }

  const agentContext = `
================================================================================
CHILD AGENT TO ANALYZE (GENERATE SKILLS FROM THIS AGENT'S PROMPT)
================================================================================
Agent Name: ${agent.agent_name}
Agent ID: ${agent.agent_id}
Workspace SID: ${agent.workspace_sid}

Instructions:
${agent.instructions}

Tools:
${agent.tools.map((t) => `- ${t.name} (${t.sId})`).join("\n")}

Agents using this sub-agent:
${agent.agents_using_it}
================================================================================
END OF CHILD AGENT
================================================================================
`;

  const fullPrompt = prompt + parentAgentsContext + agentContext;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from API");
      }

      const parsed: GeminiResponse = JSON.parse(text);

      return parsed.skills.map((skill) => ({
        ...skill,
        sourceAgent: {
          agentId: agent.agent_id,
          agentName: agent.agent_name,
          workspaceSid: agent.workspace_sid,
        },
      }));
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        console.warn(
          `  Attempt ${attempt}/${MAX_RETRIES} failed for agent ${agent.agent_name}, retrying...`
        );
        // Exponential backoff: 500ms, 1000ms
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(
    `Failed after ${MAX_RETRIES} attempts for agent ${agent.agent_name}:`,
    lastError
  );
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let skip = 0;

  // Parse --limit argument
  const limitIndex = args.indexOf("--limit");
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit <= 0) {
      console.error("Error: --limit must be a positive number");
      process.exit(1);
    }
  }

  // Parse --skip argument
  const skipIndex = args.indexOf("--skip");
  if (skipIndex !== -1 && args[skipIndex + 1]) {
    skip = parseInt(args[skipIndex + 1], 10);
    if (isNaN(skip) || skip < 0) {
      console.error("Error: --skip must be a non-negative number");
      process.exit(1);
    }
  }

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const inputPath = path.join(__dirname, "2_agents_enriched.json");
  const promptPath = path.join(__dirname, "3_prompt.txt");
  const outputPath = path.join(__dirname, "3_generated_skills.json");

  console.log(`Reading agents from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  let agents: EnrichedAgentData[] = JSON.parse(rawData);
  const totalAgents = agents.length;

  if (skip > 0) {
    console.log(`Skipping first ${skip} agents`);
    agents = agents.slice(skip);
  }

  if (limit) {
    console.log(`Limiting to ${limit} agents`);
    agents = agents.slice(0, limit);
  }

  console.log(`Processing agents ${skip + 1} to ${skip + agents.length} of ${totalAgents}`);

  console.log(`Reading prompt from ${promptPath}...`);
  const prompt = fs.readFileSync(promptPath, "utf-8");

  console.log(`Processing ${agents.length} agents...`);

  const allSkills: Skill[] = [];
  let processed = 0;

  for (const agent of agents) {
    processed++;
    console.log(
      `[${processed}/${agents.length}] Processing agent: ${agent.agent_name}`
    );

    // Parse parent agents from agents_using_it field
    let parentAgentPrompts: ParentAgentPrompt[] = [];
    try {
      const parentAgents: ParentAgentInfo[] = JSON.parse(agent.agents_using_it);
      parentAgentPrompts = parentAgents
        .filter((p) => p.instructions) // Only include parents with instructions
        .map((p) => ({
          sId: p.sId,
          name: p.name,
          instructions: p.instructions,
        }));
    } catch {
      console.warn(
        `  Warning: Could not parse agents_using_it for ${agent.agent_name}`
      );
    }

    if (parentAgentPrompts.length > 0) {
      console.log(
        `  -> Found ${parentAgentPrompts.length} parent agent(s) with prompts`
      );
    }

    const skills = await generateSkillsForAgent(
      client,
      agent,
      prompt,
      parentAgentPrompts
    );
    allSkills.push(...skills);

    console.log(`  -> Generated ${skills.length} skill(s)`);

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Sort by confidence score (descending)
  allSkills.sort((a, b) => b.confidenceScore - a.confidenceScore);

  console.log(`\nTotal skills generated: ${allSkills.length}`);
  console.log(`Writing results to ${outputPath}...`);

  fs.writeFileSync(outputPath, JSON.stringify(allSkills, null, 2));

  console.log("Done!");

  // Print summary
  console.log("\nSkills summary by confidence score:");
  const highConfidence = allSkills.filter((s) => s.confidenceScore >= 0.8);
  const mediumConfidence = allSkills.filter(
    (s) => s.confidenceScore >= 0.5 && s.confidenceScore < 0.8
  );
  const lowConfidence = allSkills.filter((s) => s.confidenceScore < 0.5);

  console.log(`  High (>=0.8): ${highConfidence.length}`);
  console.log(`  Medium (0.5-0.8): ${mediumConfidence.length}`);
  console.log(`  Low (<0.5): ${lowConfidence.length}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
