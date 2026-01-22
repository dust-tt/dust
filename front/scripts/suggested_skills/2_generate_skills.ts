import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Logger } from "pino";

import { makeScript } from "@app/scripts/helpers";
import type {
  Agent,
  AgentTool,
  SkillWithAgentMetadata,
} from "@app/scripts/suggested_skills/types";
import { GeneratedSkillsOutputSchema } from "@app/scripts/suggested_skills/types";
import { dustManagedCredentials } from "@app/types";

const PROMPT = `You are an advanced AI system designed to analyze an agent capabilities and propose relevant skills.


## Input
You will receive the following inputs:
- agent_name: The name of the agent.
- agent_description: A short description of the agent's general purpose.
- agent_prompt: The agent's core instructions.
- agent_tools: An array, where each element contains:
- tool_name: The name of a tool the agent can use.
- tool_description: What this tool does.
- tool_id (sId): The unique identifier of the tool.
- agent_datasources: An array of datasources (knowledge bases, documents, etc.) that the agent has access to. Each datasource contains:
- datasource_name: The name of the datasource.
- datasource_description: What this datasource contains.
- datasource_id: The unique identifier of the datasource.


## Your task:
Based on the agent's instructions, available tools, and datasources, propose 0-2 skills that the agent could use. Each skill description should be a useful capability that leverages one or more of the agent's tools and/or datasources.

For each skill, you must also select the most appropriate icon from the following list that best represents the skill's purpose:
- ActionCommandIcon: Executable capabilities and workflows
- ActionRocketIcon: Launching into action and achieving goals efficiently
- ActionSparklesIcon: Enhancement and special capabilities
- ActionBracesIcon: Structured blocks of logic and code-like workflows
- ActionListCheckIcon: Step-by-step workflows and checklists
- ActionCubeIcon: Modular, reusable components
- ActionLightbulbIcon: Ideas, solutions, and know-how
- ActionBriefcaseIcon: Professional tools and domain expertise
- ActionMagicIcon: Special abilities and complex workflow automation
- ActionBrainIcon: Knowledge and learned capabilities

Choose the icon that best captures the essence of what the skill accomplishes.

Guidelines:
- If no coherent skills are possible with the provided tools and datasources, return an empty array.
- Never invent tools that are not in the agent_tools list.
- **CRITICAL**: Never invent datasources that are not in the agent_datasources list. Only attach datasources that are EXPLICITLY mentioned in the skill's instructions or description.
- You may propose up to 2 skills, but do not force 2 if it doesn't make sense. Always output the most relevant skills.
- If the agent's instructions are extremely narrow, propose only those skills that strictly match and are reusable.
- **CRITICAL**: If multiple skills are identified within a single agent, they MUST NOT overlap. Each skill should be dedicated to an isolated, distinct task with no overlap with other skills. Skills should handle separate concerns and use different subsets of tools when possible.
- When attaching datasources to a skill, only include those that are specifically mentioned or directly referenced in the skill's instructions or description. DO NOT attach datasources just because they exist in the agent's datasources list.

If you are unsure or the instructions conflict, return an empty array.

Think step-by-step, and only use the information provided.


## Skill definition

### What is a skill (non exclusive)

**Name** (WHAT)

Represents what the skills helps achieving, with a very few words (less than 6). For example:

- "Retrieve prospect company information",
- "Create <some_project> GitHub issue"

**Description for humans** (WHAT)

Human readable, intended to quickly grasp what the skill does

- Should be concise, 100 characters and 1 - 2 small sentences max.

**Description for agents** (WHAT, WHEN, WHY)

Intended for agent so they can chose to use the skill based on a conversation turn

- Should explain what the skill does, how is it useful and in what situation it should be used.
- Typically consists in a WHAT block (up to 2 sentences) and a WHEN block (up to 2 sentences) separated by a line break
- Should be concise but specific enough so the agent knows in which situation it can enable it and expand the skill's instructions

**Instructions** (HOW)

- Steps to follow (HOW) to achieve the skill's goal using the available tools
- Specific guidelines on:
- Workflows: when and how to use tools specifically in the context of the skill
- Encoding company or team-specific knowledge (e.g., which data sources to query, which repositories to target, what filters to apply)
- What exact source to update or search into (e.g. specific Github repository or Jira project)
- Can include good and / or bad examples tied to required tools
- Can include a list of values to use with the tools (list of IDs, list of project names, list of search filters…)
- **CRITICAL**: Skills should NEVER have a final step that specifies an output format. Skills are intermediary steps for agents - the agent can specify output format in its own instructions, not the skill. Instructions should focus ONLY on **how to use tools** to achieve the goal, NOT on how to format or present results. Do NOT include steps like:
  - "Return the data with this JSON schema"
  - "Format the output as..."
  - "Present the results in the following format..."
  - "Output should be structured as..."
- **Format**: Instructions are intended for agents, but should be human-readable with clear formatting:
- Use markdown formatting (headers, bullet points, code blocks)
- Break complex workflows into numbered steps
- Use clear section headers to organize different aspects
- Make the structure easy to scan and understand at a glance


## Additional informations about skills

There is no input/output to a skill as it is not "called", it is a guide explaining how to accomplish an action, which can be used as an intermediary step inside an agent instructions, and which can be reusable across multiple agents.

Some examples of actions accomplished by a skills:

- create a ticket in in a specific Jira project (given the id or the name, depending on the underlying tool) by following a template
- classify an entity from an input (e.g. an id, a name etc.) based on evaluation criteria after conducting data retrieval from specific sources

### What does NOT represent a skill:

- Broad instructions with conditions based on datasource or input
- bad example: "If the input looks like a CRM inquiry, fetch information in Salesforce, otherwise look in Google"
- Instructions whose output is intended for humans
- bad example: "ScoreLead" that classifies lead after a search in internal documents based on the lead email adress. This is intended for humans.
- good example: "LeadInformationGetter" which can be reused across multiple agents as an intermediary step for different end purposes (e.g. write results in a Notion page, send a marketing email to the lead etc.)
- Skills should not be used as a prompt library in the more classical sense of the term, e.g. "Analyze the following reports and extract the key insights into a single memo.", "Help me write a feedback for a candidate". These examples are not skills because their outputs are more intended for humans than agents. They do not represent an intermediary step of an agent instructions.


You should also attach a confidenceScore (between 0 and 1) to each skill, representing how confident you are that the skill is relevant and useful given the agent's instructions and tools.

Evaluation criteria:

- **Specificity**: Does it provide actual, actionable information on how to use tools effectively? Not just vague instructions.
- **Tool Integration**: Does it explain how to use specific tools properly with concrete guidelines?
- **Value**: Does it have valuable details that would benefit multiple agents? Is it non-trivial?
- **Completeness**: Are the instructions self-contained and comprehensive enough to follow?

Scoring guidelines:

- 0.0-0.3: Poor skill - too generic, no real value, trivial "use this tool" instructions, or not reusable
- 0.4-0.5: OK skill - has some value but lacks detail or specificity
- 0.6-0.7: Good skill - provides useful instructions but could be more comprehensive
- 0.8-0.9: Very good skill - detailed, reusable, provides clear value with specific tool usage guidelines
- 1.0: Exceptional skill - comprehensive, highly reusable, excellent tool integration, and clear examples
You can use up to 2 decimal in you evaluation, like 0.35 or 0.78

Output your analysis as JSON with the following structure:
{
  "skills": [
    {
      "name": "string - the generated skill name",
      "agent_name": "string - the agent name it comes from",
      "description_for_agents": "string - the generated description intended for agents using the skill",
      "description_for_humans": "string - the generated description optimized for human understanding",
      "instructions": "string - generated instructions of the skill",
      "icon": "string - one of: ActionCommandIcon, ActionRocketIcon, ActionSparklesIcon, ActionBracesIcon, ActionListCheckIcon, ActionCubeIcon, ActionLightbulbIcon, ActionBriefcaseIcon, ActionMagicIcon, ActionBrainIcon",
      "requiredTools": [
        {
          "tool_name": "string - the name of the tool",
          "tool_type": "internal" | "remote",
          "tool_description": "string - what the tool does",
          "mcp_server_view_id": number - the MCP server view ID
        }
      ], - An array of tools needed for this skill (must be a subset of the provided agent_tools). Include tool_name, tool_type, tool_description, and mcp_server_view_id.
      "requiredDatasources": [
        {
          "datasource_id": "string",
          "datasource_name": "string",
          "connector_provider": "string",
          "data_source_view_id": number,
          "datasource_description": "string"
        }
      ], - An array of datasources needed for this skill. ONLY include datasources that are EXPLICITLY mentioned in the skill's instructions or description. If no datasources are explicitly mentioned, use an empty array [].
      "confidenceScore": 0.0-1.0
      }
      ]
      }`;

const OUTPUT_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description_for_agents: { type: "string" },
            description_for_humans: { type: "string" },
            instructions: { type: "string" },
            icon: {
              type: "string",
              enum: [
                "ActionCommandIcon",
                "ActionRocketIcon",
                "ActionSparklesIcon",
                "ActionBracesIcon",
                "ActionListCheckIcon",
                "ActionCubeIcon",
                "ActionLightbulbIcon",
                "ActionBriefcaseIcon",
                "ActionMagicIcon",
                "ActionBrainIcon",
              ],
            },
            requiredTools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tool_name: { type: "string" },
                  tool_type: { type: "string", enum: ["internal", "remote"] },
                  tool_description: { type: "string" },
                  mcp_server_view_id: { type: "number" },
                  internal_mcp_server_id: { type: "string" },
                  remote_mcp_server_id: { type: "string" },
                  internal_tool_name: { type: "string" },
                  internal_tool_description: { type: "string" },
                },
                required: [
                  "tool_name",
                  "tool_type",
                  "tool_description",
                  "mcp_server_view_id",
                ],
                additionalProperties: false,
              },
            },
            agent_name: { type: "string" },
            confidenceScore: { type: "number" },
          },
          required: [
            "name",
            "description_for_agents",
            "description_for_humans",
            "instructions",
            "icon",
            "requiredTools",
            "confidenceScore",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["skills"],
    additionalProperties: false,
  },
} as const;

function formatAgentAsMarkdown(agent: Agent): string {
  const toolsList = agent.tools
    .map((tool) => {
      const lines = [`- **${tool.tool_name ?? "Unnamed tool"}** (${tool.tool_type})`];
      if (tool.tool_description) {
        lines.push(`  - Description: ${tool.tool_description}`);
      }
      lines.push(`  - MCP Server View ID: ${tool.mcp_server_view_id}`);
      if (tool.internal_mcp_server_id) {
        lines.push(`  - Internal MCP Server ID: ${tool.internal_mcp_server_id}`);
      }
      if (tool.remote_mcp_server_id) {
        lines.push(`  - Remote MCP Server ID: ${tool.remote_mcp_server_id}`);
      }
      return lines.join("\n");
    })
    .join("\n");

  const dataSourcesList = agent.dataSources
    .map((ds) => {
      const lines = [`- **${ds.connector_provider}**`];
      if (ds.datasource_description) {
        lines.push(`  - Description: ${ds.datasource_description}`);
      }
      return lines.join("\n");
    })
    .join("\n");

  return `## Agent: ${agent.agent_name}

### Description
${agent.description}

### Instructions
${agent.instructions ?? "No instructions provided."}

### Tools
${toolsList || "No tools configured."}

### Data Sources
${dataSourcesList || "No data sources configured."}`;
}

function loadAgents(workspaceId: string): Agent[] {
  const agentsFilePath = join(__dirname, workspaceId, "agents.json");
  const fileContent = readFileSync(agentsFilePath, "utf-8");
  return JSON.parse(fileContent);
}

function createAnthropicClient(): Anthropic {
  const { ANTHROPIC_API_KEY } = dustManagedCredentials();
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "DUST_MANAGED_ANTHROPIC_API_KEY environment variable is required"
    );
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

async function generateSkillsForAgent(
  client: Anthropic,
  agent: Agent,
  logger: Logger
): Promise<SkillWithAgentMetadata[]> {
  logger.info(
    { agentSid: agent.agent_sid, agentName: agent.agent_name },
    "Processing agent"
  );

  try {
    const message = await client.beta.messages.create({
      max_tokens: 4096,
      betas: ["structured-outputs-2025-11-13"],
      system: [
        {
          type: "text",
          text: PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: formatAgentAsMarkdown(agent),
        },
      ],
      model: "claude-sonnet-4-5-20250929",
      output_format: OUTPUT_FORMAT,
    });

    const content = message.content[0];
    if (content.type !== "text") {
      logger.error(
        { agentSid: agent.agent_sid, contentType: content.type },
        "Unexpected content type"
      );
      return [];
    }

    const parsed = GeneratedSkillsOutputSchema.parse(JSON.parse(content.text));
    return parsed.skills.map((skill) => ({
      ...skill,
      agent_sid: agent.agent_sid,
      agent_name: agent.agent_name,
      agent_description: agent.description,
      agent_instructions: agent.instructions,
    }));
  } catch (error) {
    logger.error(
      { agentSid: agent.agent_sid, agentName: agent.agent_name, error },
      "Failed to process agent"
    );
    return [];
  }
}

async function processAgentsInBatches(
  client: Anthropic,
  agents: Agent[],
  batchSize: number,
  logger: Logger
): Promise<SkillWithAgentMetadata[]> {
  const batches: Agent[][] = [];
  for (let i = 0; i < agents.length; i += batchSize) {
    batches.push(agents.slice(i, i + batchSize));
  }

  logger.info(
    { totalBatches: batches.length, batchSize },
    "Processing agents in batches"
  );

  const allSkills: SkillWithAgentMetadata[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logger.info(
      { batchIndex: batchIndex + 1, totalBatches: batches.length },
      "Processing batch"
    );

    const batchPromises = batch.map((agent) =>
      generateSkillsForAgent(client, agent, logger)
    );
    const batchResults = await Promise.all(batchPromises);
    allSkills.push(...batchResults.flat());

    logger.info(
      { batchIndex: batchIndex + 1, totalSkillsSoFar: allSkills.length },
      "Completed batch"
    );
  }

  return allSkills;
}

function augmentSkillsWithToolData(
  skills: SkillWithAgentMetadata[],
  agents: Agent[],
  logger: Logger
): SkillWithAgentMetadata[] {
  const agentsById = new Map(agents.map((a) => [a.agent_sid, a]));

  return skills.map((skill) => {
    const agent = agentsById.get(skill.agent_sid);
    if (!agent) {
      logger.warn(
        { skillName: skill.name, agentSid: skill.agent_sid },
        "Agent not found"
      );
      return skill;
    }

    const toolsByMcpViewId = new Map<number, AgentTool>(
      agent.tools.map((t) => [t.mcp_server_view_id, t])
    );

    const augmentedRequiredTools = skill.requiredTools.map((skillTool) => {
      const fullToolData = toolsByMcpViewId.get(skillTool.mcp_server_view_id);
      if (!fullToolData) {
        return skillTool;
      }

      return {
        ...skillTool,
        remote_mcp_server_id: fullToolData.remote_mcp_server_id,
        internal_mcp_server_id: fullToolData.internal_mcp_server_id,
        ...(fullToolData.internal_tool_name && {
          internal_tool_name: fullToolData.internal_tool_name,
        }),
        ...(fullToolData.internal_tool_description && {
          internal_tool_description: fullToolData.internal_tool_description,
        }),
      };
    });

    return { ...skill, requiredTools: augmentedRequiredTools };
  });
}

function writeSkillsToFile(
  skills: SkillWithAgentMetadata[],
  workspaceId: string
): string {
  const resultsFilePath = join(__dirname, workspaceId, "suggested_skills.json");
  const sortedSkills = [...skills].sort(
    (a, b) => b.confidenceScore - a.confidenceScore
  );
  writeFileSync(resultsFilePath, JSON.stringify(sortedSkills, null, 2));
  return resultsFilePath;
}

/**
 * Generates skill suggestions for agents using the Anthropic API.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/2_generate_skills.ts --workspaceId <workspaceId>
 */
makeScript(
  {
    workspaceId: {
      type: "string",
    },
  },
  async ({ workspaceId }, logger) => {
    const agents = loadAgents(workspaceId);
    const client = createAnthropicClient();

    logger.info({ totalAgents: agents.length }, "Starting to process agents");

    const skills = await processAgentsInBatches(client, agents, 15, logger);
    const augmentedSkills = augmentSkillsWithToolData(skills, agents, logger);
    const outputFilePath = writeSkillsToFile(augmentedSkills, workspaceId);

    logger.info(
      {
        processedAgents: agents.length,
        totalSkills: skills.length,
        outputFile: outputFilePath,
      },
      "Done"
    );
  }
);
