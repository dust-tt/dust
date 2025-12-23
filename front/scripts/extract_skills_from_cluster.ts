import { GoogleGenAI } from "@google/genai";

import { makeScript } from "@app/scripts/helpers";
import { dustManagedCredentials } from "@app/types";

interface ClusterAgent {
  agentSid: string;
  agentName: string;
  workspaceName: string;
  instructionsPreview: string;
}

interface Cluster {
  clusterId: number;
  size: number;
  agents: ClusterAgent[];
}

interface ClusterFile {
  metadata: {
    totalAgents: number;
    numClusters: number;
    maxClusterSize: number;
    avgClusterSize: number;
    actualMaxSize: number;
    actualMinSize: number;
  };
  mostSimilarClusterPairs: unknown[];
  clusters: Cluster[];
}

interface ToolInfo {
  sId: string | null;
  name: string | null;
  type: string | null;
  internalMCPServerId: string | null;
  remoteMCPServerUrl: string | null;
  remoteMCPServerName: string | null;
  remoteMCPServerDescription: string | null;
  timeFrame: unknown | null;
  additionalConfiguration: unknown | null;
  descriptionOverride: string | null;
}

interface ParsedAgent {
  workspaceName: string;
  agentSid: string;
  agentName: string;
  description: string | null;
  instructions: string | null;
  instructionsLength: number | null;
  tools: ToolInfo[];
  tableIds: string[];
  childAgents: string[];
}

const SKILL_EXTRACTION_PROMPT = `You are an expert at analyzing AI agent configurations to identify reusable skills.

A **skill** is a reusable set of instructions and tools that can be shared across multiple agents to reduce duplication and improve maintainability.
A skill is not a what or a why, it's a how. It should not be the role of the agent (this stays in the agent). It explains how to do a specific set of tasks using specific tools.

Examples of skills:
- "GitHub Issue Management": Instructions on how to create, update, and manage GitHub issues for a specific repo, combined with GitHub API tools
- "Slack Communication": Guidelines for writing professional Slack messages, combined with Slack messaging tools
- "Code Review": Instructions for reviewing code quality, style, and best practices, combined with code analysis tools
- "Meeting Scheduling": Instructions for finding optimal meeting times and sending invites, combined with calendar tools

Your task is to analyze the following agents from a cluster and identify common skills that could be extracted and reused.

For each skill you identify, provide:
1. **Skill Name**: A concise, descriptive name
2. **Description**: What the skill does and when to use it
3. **Common Instructions**: The shared instruction patterns across agents (be specific, include actual instruction text that should be reused). Instructions must contains all the details to do the tasks and use the tools. It's not just a vague instruction, it's core information of how to do things. The instructions should be self contained and not need the description to be understood.
4. **Required Tools**: Which tools are needed for this skill
5. **Agents Using This Skill**: Which agents from the input would benefit from this skill

Skills should be non-trivial and provide significant value in reducing duplication. Avoid overly generic skills that lack actionable instructions.
Instructions may include the following data points where relevant:
- Objective
- Steps to Follow
- Tool Usage Guidelines
- Examples

Skills which are just "use this tool to do that" without detailed instructions on how to use the tool effectively are not valid.
As a rule of thumb, a skill with less than 5 lines of instructions is likely horse shit.
skills are not about doing the action, but about how to do the action. it should not be "write a poem" but explain how to write a good poem.

CRIICAL: Do not invent anything, use information present in the agent instructions to create skill instructions.

Focus on finding patterns that appear in 3+ agents. Prioritize skills that would provide the most value in terms of reducing duplication.

Generate a confidence score (0.0-1.0) for each skill indicating how certain you are that this is a valid:
 - if it reuseable
 - if it is generic enough
 - if it bring actual information on how to use some tools
 - if it has valuable details shared by mutliple agents
0.4 is an OK valid skill but not perfect
>0.8 is a very very good

Bad examples of skills to avoid
These examples shows the full instructions of the skill with an explanation about why it is bad.

Bad example 1:
You will be given [a company/topic] and you do a search on it to tell me what i need to know.
Search for: [specific information to search].
Put it all in a very detailed summary.
==> this is not valuable and reusable. No specific tools, the instructions are too generic.

Bad example 2:
Analyze the transcript to extract:
Prospect company name
Goals and challenges discussed
Specific use cases mentioned
Tools and systems currently used
==> this is focusing on the what, not on the how not tool usage. It is also too generic.

Bad example 3:
Create a Notion page with all key details, clearly label each section in the Notion page.
If updating, provide a summary of changes at the top of the page.
==> this is just a trivial "use this tool to do that", no detailed instructions on how to do it effectively.

Bad example 4:
You have the ability to search for internal data (GitHub discussions, Slack messages, Google drive etc...) to answer questions that require company knowledge.
This tool should only be used if the query requires company-specific knowledge.
==> too generic, no real value. DOes not explain how to actually do the search with the tools.

Bad example 5:
Web search should be used if the user's query requires general up-to-date knowledge (including for code libraries or engineering topics).
==> really bad, not an actual instruction, does not meet any definition of a skill.

Good examples of skills:
Good example 1:
You are an expert in GitHub issue management at Dust. Your objective is to create and manage GitHub issues effectively for the repository "dust-tasks". 
Steps to follow:
- When given a task related to bug tracking or feature requests, first search for existing issues in the repository to avoid duplicates.
- If an issue already exist, comment on it with relevant information instead of creating a new one using the __github_tool_comment_action__ function. 
- If no issue exists, create a new GitHub issue in the "dust-tasks" repository using the __github_tool_create_issue__ function.
  - For bug tracking, always include steps to reproduce, expected vs actual behavior, and relevant labels such as "bug" or "high priority".
  - For feature requests, provide a clear description, use cases, and tag with appropriate labels like "enhancement" or "discussion".
  - Tags the ticket with relevant components based on the content of the issue.
- Always include link to the original request (from Front, email, Slack, etc.) in the issue description for context.
==> This skills is reusable (any agent who need to handle support ticket), it provides specific instructions on how to do things, it explains how to use specific tools.



Output your analysis as JSON with the following structure:
{
  "skills": [
    {
      "name": "string",
      "description": "string",
      "commonInstructions": "string (the actual reusable instruction text)",
      "requiredTools": ["tool names or types"],
      "agentsUsingSkill": ["agent names"],
      "confidenceScore": 0.0-1.0
    }
  ],
  "analysis": "Brief summary of the cluster characteristics and why these skills were identified"
}

Here are the agents to analyze:

`;

interface Skill {
  name: string;
  description: string;
  commonInstructions: string;
  requiredTools: string[];
  agentsUsingSkill: string[];
  confidenceScore: number;
  clusterId?: number;
}

interface SkillsResponse {
  skills: Skill[];
  analysis: string;
}

function prettyPrintSkill(skill: Skill): void {
  console.log(
    `\n# ${skill.name} (score: ${skill.confidenceScore}, cluster: ${skill.clusterId})`
  );
  console.log(`\n## Description\n`);
  console.log(skill.description);
  console.log(`\n## Instructions\n`);
  console.log(skill.commonInstructions);
  console.log(`\n## Tools\n`);
  for (const tool of skill.requiredTools) {
    console.log(`- ${tool}`);
  }
  console.log(`\n## Agents Using Skill\n`);
  for (const agent of skill.agentsUsingSkill) {
    console.log(`- ${agent}`);
  }
  console.log(`\n---`);
}

function prettyPrintSkills(skills: Skill[]): void {
  for (const skill of skills) {
    prettyPrintSkill(skill);
  }
}

function buildAgentDetailsPrompt(fullAgents: ParsedAgent[]): string {
  let agentDetails = "";
  for (const agent of fullAgents) {
    agentDetails += `\n---\n`;
    agentDetails += `**Agent Name**: ${agent.agentName}\n`;
    agentDetails += `**Workspace**: ${agent.workspaceName}\n`;
    agentDetails += `**Description**: ${agent.description ?? "N/A"}\n`;
    agentDetails += `**Instructions**:\n${agent.instructions ?? "N/A"}\n`;

    if (agent.tools.length > 0) {
      agentDetails += `**Tools**:\n`;
      for (const tool of agent.tools) {
        const toolName =
          tool.name ||
          tool.remoteMCPServerName ||
          tool.internalMCPServerId ||
          "Unknown";
        const toolDesc =
          tool.descriptionOverride || tool.remoteMCPServerDescription || "";
        agentDetails += `- ${toolName}${toolDesc ? `: ${toolDesc}` : ""} (type: ${tool.type})\n`;
      }
    } else {
      agentDetails += `**Tools**: None\n`;
    }
  }
  return agentDetails;
}

makeScript(
  {
    clustersFile: {
      type: "string",
      demandOption: true,
      description: "Path to the clusters JSON file",
    },
    agentsFile: {
      type: "string",
      demandOption: true,
      description:
        "Path to the parsed agents JSON file (with full instructions)",
    },
    model: {
      type: "string",
      default: "gemini-2.0-flash",
      description: "Gemini model to use",
    },
    output: {
      type: "string",
      default: "",
      description: "Output JSON file path (optional)",
    },
    topN: {
      type: "number",
      default: 20,
      description: "Number of top skills to display",
    },
    minClusterSize: {
      type: "number",
      default: 3,
      description: "Minimum cluster size to process",
    },
  },
  async (
    { clustersFile, agentsFile, model, output, topN, minClusterSize },
    logger
  ) => {
    const fs = await import("fs/promises");

    const { GOOGLE_AI_STUDIO_API_KEY } = dustManagedCredentials();
    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        "DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
      );
    }

    const client = new GoogleGenAI({
      apiKey: GOOGLE_AI_STUDIO_API_KEY,
    });

    // Load clusters file
    const clustersContent = await fs.readFile(clustersFile, "utf-8");
    const clustersData = JSON.parse(clustersContent) as ClusterFile;

    // Load full agents data
    const agentsContent = await fs.readFile(agentsFile, "utf-8");
    const allAgents = JSON.parse(agentsContent) as ParsedAgent[];

    // Filter clusters by minimum size
    const clustersToProcess = clustersData.clusters.filter(
      (c) => c.size >= minClusterSize
    );

    logger.info(
      {
        totalClusters: clustersData.clusters.length,
        clustersToProcess: clustersToProcess.length,
        minClusterSize,
      },
      "Starting skill extraction for all clusters"
    );

    const allSkills: Skill[] = [];

    for (let i = 0; i < clustersToProcess.length; i++) {
      const cluster = clustersToProcess[i];

      logger.info(
        {
          progress: `${i + 1}/${clustersToProcess.length}`,
          clusterId: cluster.clusterId,
          clusterSize: cluster.size,
        },
        "Processing cluster"
      );

      // Get full agent data for agents in this cluster
      const clusterAgentSids = new Set(cluster.agents.map((a) => a.agentSid));
      const fullAgents = allAgents.filter((a) =>
        clusterAgentSids.has(a.agentSid)
      );

      if (fullAgents.length === 0) {
        logger.warn({ clusterId: cluster.clusterId }, "No agents found");
        continue;
      }

      // Build the prompt
      const agentDetails = buildAgentDetailsPrompt(fullAgents);
      const fullPrompt = SKILL_EXTRACTION_PROMPT + agentDetails;

      try {
        // Call Gemini
        const response = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          config: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        });

        const responseText =
          response.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
          logger.warn({ clusterId: cluster.clusterId }, "No response");
          continue;
        }

        const skillsData = JSON.parse(responseText) as SkillsResponse;

        // Add cluster ID to each skill and collect
        for (const skill of skillsData.skills) {
          allSkills.push({
            ...skill,
            clusterId: cluster.clusterId,
          });
        }

        logger.info(
          {
            clusterId: cluster.clusterId,
            skillsFound: skillsData.skills.length,
          },
          "Extracted skills from cluster"
        );
      } catch (error) {
        logger.error(
          { clusterId: cluster.clusterId, error: String(error) },
          "Failed to process cluster"
        );
      }
    }

    // Sort all skills by confidence score (descending)
    allSkills.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Get top N skills
    const topSkills = allSkills.slice(0, topN);

    logger.info(
      {
        totalSkillsFound: allSkills.length,
        topN,
      },
      "Skill extraction completed"
    );

    // Write all skills to file if output specified
    if (output) {
      await fs.writeFile(
        output,
        JSON.stringify({ allSkills, topSkills }, null, 2),
        "utf-8"
      );
      logger.info({ outputPath: output }, "JSON written to file");
    }

    // Pretty print top skills to stdout
    console.log(`\n========== TOP ${topN} SKILLS ==========\n`);
    prettyPrintSkills(topSkills);
  }
);
