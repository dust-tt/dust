import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

import type {InternalMCPServerNameType} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS
} from "@app/lib/actions/mcp_internal_actions/constants";

interface EnrichedToolData {
  sId: string;
  name: string;
  mcpServerViewId: number | null;
  isInternal: boolean;
  remoteMcpServerId: string | null;
}

interface EnrichedAgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
  tools: EnrichedToolData[];
}

interface RequiredTool {
  tool_name: string;
  tool_type: "internal" | "remote";
  tool_description: string;
  mcp_server_view_id?: number;
  internal_mcp_server_id?: string;
  internal_tool_name?: string;
  internal_tool_description?: string;
  remote_mcp_server_id?: string;
}

interface GeneratedSkill {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  agent_name: string;
  icon: string;
  confidenceScore: number;
  requiredTools: RequiredTool[];
}

interface GeminiResponse {
  skill: {
    name: string;
    description_for_agents: string;
    description_for_humans: string;
    instructions: string;
    requiredTools: string[];
    agent_name: string;
    icon: string;
    confidenceScore: number;
  } | null;
}

const MAX_RETRIES = 3;

/**
 * Sanitizes JSON string to fix common escape sequence issues from LLM outputs.
 * LLMs sometimes produce invalid escape sequences like \' or control characters.
 */
function sanitizeJsonString(text: string): string {
  // Fix invalid escape sequences by replacing single backslashes before invalid chars
  // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
  // Invalid: \', \a, \v, etc.
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function generateSkillMarkdown(skill: GeneratedSkill, keyword: string, workspace: string): string {
  const toolsList =
    skill.requiredTools.length > 0
      ? skill.requiredTools.map((t) => {
          const id = t.internal_mcp_server_id || t.remote_mcp_server_id || "unknown";
          return `- ${t.tool_name} (\`${id}\`) - ${t.tool_type}`;
        }).join("\n")
      : "- None";

  return `# ${skill.name}

## Description for Humans

${skill.description_for_humans}

## Description for Agents

${skill.description_for_agents}

## Instructions

${skill.instructions}

## Required Tools

${toolsList}

## Metadata

- **Agent Name**: ${skill.agent_name}
- **Icon**: ${skill.icon}
- **Confidence Score**: ${skill.confidenceScore}
- **Keyword**: ${keyword}
- **Workspace**: ${workspace}
`;
}

function parseArgs(): { workspace: string; keyword: string } {
  const args = process.argv.slice(2);

  const workspaceIndex = args.indexOf("--workspace");
  const keywordIndex = args.indexOf("--keyword");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    process.exit(1);
  }

  if (keywordIndex === -1 || !args[keywordIndex + 1]) {
    console.error("Error: --keyword argument is required");
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
    keyword: args[keywordIndex + 1],
  };
}

async function generateSkillFromAgents(
  client: GoogleGenAI,
  agents: EnrichedAgentData[],
  prompt: string,
  skillDefinition: string,
  topicGuidance: string
): Promise<GeminiResponse> {
  // Build context with all agent prompts
  const agentsContext = agents
    .map((agent, index) => {
      const toolsList = agent.tools.map((t) => t.name).join(", ");
      return `================================================================================
AGENT ${index + 1}: ${agent.agent_name}
Tools: ${toolsList || "None"}
================================================================================
${agent.instructions}
================================================================================`;
    })
    .join("\n\n");

  const fullPrompt = prompt
    .replace("[INCLUD SKILL DEFINITION HERE]", skillDefinition)
    .replace(
      "[INCLUD TOPIC SPECIFIC PROMPT]",
      `${topicGuidance}

Number of agents to analyze: ${agents.length}

${agentsContext}`
    );

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

      // Sanitize the JSON to fix invalid escape sequences from LLM output
      const sanitizedText = sanitizeJsonString(text);
      const parsed: GeminiResponse = JSON.parse(sanitizedText);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        console.warn(`  Attempt ${attempt}/${MAX_RETRIES} failed, retrying...`);
        // Exponential backoff: 500ms, 1000ms
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(`Failed after ${MAX_RETRIES} attempts:`, lastError);
  return { skill: null };
}

async function main() {
  const { workspace, keyword } = parseArgs();

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const keywordDir = path.join(__dirname, "runs", workspace, keyword);
  const inputPath = path.join(keywordDir, "2_filtered_agents.json");
  const promptPath = path.join(__dirname, "3_prompt.txt");
  const skillDefinitionPath = path.join(__dirname, "3_skill_definition.md");
  const topicGuidancePath = path.join(__dirname, "skills", `${keyword}.txt`);
  const outputPath = path.join(keywordDir, "3_generated_skill.json");
  const markdownPath = path.join(keywordDir, "3_generated_skill.md");

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error("Please run the filter step first:");
    console.error(
      `  npx tsx scripts/skills_generation/agent_cluster/2_filter_by_keyword.ts --workspace ${workspace} --keyword ${keyword}`
    );
    process.exit(1);
  }

  // Check topic guidance file exists
  if (!fs.existsSync(topicGuidancePath)) {
    console.error(`Error: Topic guidance file not found: ${topicGuidancePath}`);
    console.error(`Please create a guidance file at: skills/${keyword}.txt`);
    process.exit(1);
  }

  console.log(`Reading filtered agents from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const agents: EnrichedAgentData[] = JSON.parse(rawData);

  if (agents.length <= 2) {
    console.log(`Only ${agents.length} agent(s) found matching keyword "${keyword}". Need more than 2 agents to generate a skill.`);
    return;
  }

  console.log(`Found ${agents.length} agents matching keyword "${keyword}"`);

  console.log(`Reading prompt from ${promptPath}...`);
  const prompt = fs.readFileSync(promptPath, "utf-8");
  const skillDefinition = fs.readFileSync(skillDefinitionPath, "utf-8");

  console.log(`Reading topic guidance from ${topicGuidancePath}...`);
  const topicGuidance = fs.readFileSync(topicGuidancePath, "utf-8");

  console.log(`\nGenerating skill from ${agents.length} agents...`);

  const response = await generateSkillFromAgents(client, agents, prompt, skillDefinition, topicGuidance);

  if (!response.skill) {
    console.log("\nNo skill generated.");

    // Write the response anyway for transparency
    fs.writeFileSync(outputPath, JSON.stringify({ skill: null }, null, 2));
    console.log(`\nResult written to ${outputPath}`);
    return;
  }

  // Build a map of tool names to their full data from all agents
  const toolNameToData = new Map<string, EnrichedToolData>();
  for (const agent of agents) {
    for (const tool of agent.tools) {
      toolNameToData.set(tool.name, tool);
    }
  }

  // Map required tool names to enriched format with full metadata
  const enrichedRequiredTools: RequiredTool[] = response.skill.requiredTools.map((toolName) => {
    const toolData = toolNameToData.get(toolName);
    const sId = toolData?.sId ?? toolName;

    // Check if this is an internal MCP server
    const internalServerResult = getInternalMCPServerNameAndWorkspaceId(sId);

    if (internalServerResult.isOk()) {
      const serverName = internalServerResult.value.name as InternalMCPServerNameType;
      const serverConfig = INTERNAL_MCP_SERVERS[serverName];

      return {
        tool_name: toolName,
        tool_type: "internal" as const,
        tool_description: serverConfig.serverInfo.description,
        mcp_server_view_id: toolData?.mcpServerViewId ?? serverConfig.id,
        internal_mcp_server_id: sId,
        internal_tool_name: serverName,
        internal_tool_description: serverConfig.serverInfo.description,
      };
    } else {
      // Remote MCP server or unknown tool
      return {
        tool_name: toolName,
        tool_type: "remote" as const,
        tool_description: `Tool: ${toolName}`,
        mcp_server_view_id: toolData?.mcpServerViewId ?? undefined,
        remote_mcp_server_id: toolData?.remoteMcpServerId ?? sId,
      };
    }
  });

  const generatedSkill: GeneratedSkill = {
    name: response.skill.name,
    description_for_agents: response.skill.description_for_agents,
    description_for_humans: response.skill.description_for_humans,
    instructions: response.skill.instructions,
    agent_name: response.skill.agent_name,
    icon: response.skill.icon,
    confidenceScore: response.skill.confidenceScore,
    requiredTools: enrichedRequiredTools,
  };

  console.log(`\nGenerated skill: ${generatedSkill.name}`);

  // Write the skill directly without the wrapper object
  fs.writeFileSync(outputPath, JSON.stringify(generatedSkill, null, 2));
  console.log(`\nJSON written to ${outputPath}`);

  // Write markdown file
  const markdown = generateSkillMarkdown(generatedSkill, keyword, workspace);
  fs.writeFileSync(markdownPath, markdown);
  console.log(`Markdown written to ${markdownPath}`);

  // Print skill summary
  console.log("\n=== Generated Skill Summary ===");
  console.log(`Name: ${generatedSkill.name}`);
  console.log(`Description: ${generatedSkill.description_for_humans}`);
  console.log(`Required Tools: ${generatedSkill.requiredTools.map((t) => t.tool_name).join(", ") || "None"}`);
  console.log(`Confidence: ${generatedSkill.confidenceScore}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
