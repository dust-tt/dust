import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

import type {InternalMCPServerNameType} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  getInternalMCPServerNameFromSId,
  INTERNAL_MCP_SERVERS
} from "@app/lib/actions/mcp_internal_actions/constants";

interface ToolData {
  sId: string;
  name: string;
  mcpServerViewId: number | null;
  isInternal: boolean;
  remoteMcpServerId: string | null;
}

interface AgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
  tools: string; // JSON string array of tool objects
}

interface EnrichedToolData {
  sId: string;
  name: string;
  mcpServerViewId: number | null;
  isInternal: boolean;
  remoteMcpServerId: string | null;
}

interface EnrichedAgentData extends Omit<AgentData, "tools"> {
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

function resolveToolName(toolSId: string | null): string {
  if (!toolSId) {
    return "unknown";
  }
  if (toolSId.startsWith("ims_")) {
    const name = getInternalMCPServerNameFromSId(toolSId);
    if (name) {
      return name;
    }
  }
  return toolSId;
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

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

function filterAgentsByKeyword(agents: AgentData[], keyword: string): EnrichedAgentData[] {
  const keywordLower = keyword.toLowerCase();

  return agents
    .filter((agent) => {
      if (!agent.instructions) {
        return false;
      }
      return agent.instructions.toLowerCase().includes(keywordLower);
    })
    .map((agent) => {
      // Parse the tools JSON string (array of tool objects)
      const parsedTools: ToolData[] = JSON.parse(agent.tools);

      // Resolve internal MCP server names (ims_xxx -> human-readable name)
      const enrichedTools: EnrichedToolData[] = parsedTools.map((tool) => ({
        sId: tool.sId,
        name: resolveToolName(tool.sId),
        mcpServerViewId: tool.mcpServerViewId,
        isInternal: tool.isInternal,
        remoteMcpServerId: tool.remoteMcpServerId,
      }));

      return {
        ...agent,
        tools: enrichedTools,
      };
    });
}

async function generateSkillFromAgents(
  client: GoogleGenAI,
  agents: EnrichedAgentData[],
  prompt: string,
  skillDefinition: string,
  topicGuidance: string
): Promise<GeminiResponse> {
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
        console.warn(`    Attempt ${attempt}/${MAX_RETRIES} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(`    Failed after ${MAX_RETRIES} attempts:`, lastError);
  return { skill: null };
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

  const skillsDir = path.join(__dirname, "skills");
  const workspaceDir = path.join(__dirname, "runs", workspace);
  const agentsPath = path.join(workspaceDir, "1_agents.json");
  const promptPath = path.join(__dirname, "3_prompt.txt");
  const skillDefinitionPath = path.join(__dirname, "3_skill_definition.md");

  // Check agents file exists
  if (!fs.existsSync(agentsPath)) {
    console.error(`Error: Agents file not found: ${agentsPath}`);
    console.error(`Please export agents from Metabase to: runs/${workspace}/1_agents.json`);
    process.exit(1);
  }

  // Get all keywords from skills folder
  const skillFiles = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".txt"));
  const keywords = skillFiles.map((f) => f.replace(".txt", ""));

  if (keywords.length === 0) {
    console.error("Error: No skill guidance files found in skills/ folder");
    process.exit(1);
  }

  console.log(`Found ${keywords.length} skill keywords: ${keywords.join(", ")}`);

  // Read agents and prompt once
  console.log(`\nReading agents from ${agentsPath}...`);
  const agentsData = fs.readFileSync(agentsPath, "utf-8");
  const allAgents: AgentData[] = JSON.parse(agentsData);
  console.log(`Total agents: ${allAgents.length}`);

  const prompt = fs.readFileSync(promptPath, "utf-8");
  const skillDefinition = fs.readFileSync(skillDefinitionPath, "utf-8");

  // Process each keyword
  for (const keyword of keywords) {
    console.log(`\n${keyword}`);

    const keywordDir = path.join(workspaceDir, keyword);
    const outputPath = path.join(keywordDir, "3_generated_skill.json");
    const markdownPath = path.join(keywordDir, "3_generated_skill.md");
    const filteredAgentsPath = path.join(keywordDir, "2_filtered_agents.json");
    const topicGuidancePath = path.join(skillsDir, `${keyword}.txt`);

    // Create keyword directory
    if (!fs.existsSync(keywordDir)) {
      fs.mkdirSync(keywordDir, { recursive: true });
    }

    // Filter agents
    const filteredAgents = filterAgentsByKeyword(allAgents, keyword);
    console.log(`  agents: ${filteredAgents.length}`);

    // Save filtered agents
    fs.writeFileSync(filteredAgentsPath, JSON.stringify(filteredAgents, null, 2));

    // Check minimum agent count
    if (filteredAgents.length <= 2) {
      console.log(`  skipped`);
      // Remove keyword directory since no skill will be generated
      fs.rmSync(keywordDir, { recursive: true });
      continue;
    }

    // Read topic guidance
    const topicGuidance = fs.readFileSync(topicGuidancePath, "utf-8");

    // Generate skill
    console.log(`  generating...`);
    const response = await generateSkillFromAgents(client, filteredAgents, prompt, skillDefinition, topicGuidance);

    if (!response.skill) {
      console.log(`  failed`);
      // Remove keyword directory since no skill was generated
      fs.rmSync(keywordDir, { recursive: true });
      continue;
    }

    // Build a map of tool names to their full data from all filtered agents
    const toolNameToData = new Map<string, EnrichedToolData>();
    for (const agent of filteredAgents) {
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

    // Save outputs - write skill directly without wrapper object
    fs.writeFileSync(
      outputPath,
      JSON.stringify(generatedSkill, null, 2)
    );
    const markdown = generateSkillMarkdown(generatedSkill, keyword, workspace);
    fs.writeFileSync(markdownPath, markdown);

    console.log(`  generated: ${generatedSkill.name}`);

    // Small delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
