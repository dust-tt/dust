import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

type RequiredTool = {
  tool_name: string;
  tool_type: "internal" | "remote";
  tool_description: string;
  mcp_server_view_id: number;
  internal_mcp_server_id?: string;
  remote_mcp_server_id?: string;
  internal_tool_name?: string;
  internal_tool_description?: string;
};

type RequiredDatasource = {
  datasource_id: string;
  datasource_name: string;
  connector_provider: string;
  data_source_view_id: number;
  datasource_description: string;
};

type Skill = {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  agent_name: string;
  icon: string;
  requiredTools?: RequiredTool[];
  requiredDatasources?: RequiredDatasource[];
  confidenceScore: number;
  agent_sid?: string;
  agent_description?: string;
  agent_instructions?: string;
};

const argumentSpecs: ArgumentSpecs = {
  workspaceSId: {
    type: "string",
    required: true,
    description: "The workspace sId to extract skills from",
  },
  topN: {
    type: "number",
    description: "Number of top skills to extract (default: 10)",
  },
  withDatasources: {
    type: "boolean",
    description: "Include skills with datasources (default: false)",
  },
};

// Helper function to remove null values from objects
function removeNulls<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeNulls) as T;
  } else if (obj !== null && typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null) {
        cleaned[key] = removeNulls(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

function formatSkillToText(skill: Skill): string {
  const sections = [
    "=" + "=".repeat(skill.name.length + 2) + "=",
    `  ${skill.name}`,
    "=" + "=".repeat(skill.name.length + 2) + "=",
    "",
    "",
    "",
    "CONFIDENCE SCORE",
    "-".repeat(80),
    `${skill.confidenceScore}`,
    "",
    "",
    "",
    "AGENT NAME",
    "-".repeat(80),
    skill.agent_name,
    "",
    "",
    "",
    "SKILL DESCRIPTION FOR HUMANS",
    "-".repeat(80),
    skill.description_for_humans,
    "",
    "",
    "",
    "SKILL DESCRIPTION FOR AGENTS",
    "-".repeat(80),
    skill.description_for_agents,
    "",
    "",
    "",
    "INSTRUCTIONS",
    "-".repeat(80),
    skill.instructions,
    "",
    "",
    "",
    "TOOLS USED",
    "-".repeat(80),
    ...(skill.requiredTools ?? []).map(
      (tool) => `- ${tool.tool_name} (${tool.mcp_server_view_id})`
    ),
    "",
    "",
    "",
    "DATASOURCES USED",
    "-".repeat(80),
    ...(skill.requiredDatasources ?? []).map((ds) => `- ${ds.datasource_name}`),
    "",
  ];

  return sections.join("\n");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Extracts top skills and formats them into text files for review.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/3_extract_and_format.ts --workspaceSId <workspaceSId>
 */
makeScript(argumentSpecs, async (args, scriptLogger) => {
  const workspaceSId = args.workspaceSId as string;
  const topN = (args.topN as number) || 10;
  const withDatasources = args.withDatasources === true;

  // Read suggested skills from <workspaceSId>/suggested_skills.json
  const suggestedSkillsPath = join(
    __dirname,
    workspaceSId,
    "suggested_skills.json"
  );

  if (!existsSync(suggestedSkillsPath)) {
    throw new Error(
      `Suggested skills file not found at ${suggestedSkillsPath}`
    );
  }

  scriptLogger.info({ filePath: suggestedSkillsPath }, "Reading suggested skills");

  const fileContent = readFileSync(suggestedSkillsPath, "utf-8");
  const allSkills = JSON.parse(fileContent) as Skill[];

  scriptLogger.info({ totalSkills: allSkills.length }, "Loaded suggested skills");

  // Filter skills based on datasource preference
  let filteredSkills = allSkills;
  if (!withDatasources) {
    filteredSkills = allSkills.filter(
      (skill) =>
        !skill.requiredDatasources || skill.requiredDatasources.length === 0
    );
    scriptLogger.info(
      { filteredCount: filteredSkills.length },
      "Filtered to skills without datasources"
    );
  }

  // Sort by confidence score and take top N
  const topSkills = filteredSkills
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, topN)
    .map((skill) => {
      // Only keep fields expected by create_hard_coded_suggested_skills.ts, plus confidenceScore
      const cleanedSkill: Record<string, unknown> = {
        name: skill.name,
        description_for_agents: skill.description_for_agents,
        description_for_humans: skill.description_for_humans,
        instructions: skill.instructions,
        agent_name: skill.agent_name,
        icon: skill.icon,
        confidenceScore: skill.confidenceScore,
      };

      if (skill.requiredTools && skill.requiredTools.length > 0) {
        cleanedSkill.requiredTools = skill.requiredTools;
      }

      if (skill.requiredDatasources && skill.requiredDatasources.length > 0) {
        cleanedSkill.requiredDatasources = skill.requiredDatasources;
      }

      return cleanedSkill;
    });

  // Write JSON output
  const topSkillsFilePath = join(__dirname, workspaceSId, "top_skills.json");
  writeFileSync(
    topSkillsFilePath,
    JSON.stringify(removeNulls(topSkills), null, 2)
  );

  scriptLogger.info(
    { outputFile: topSkillsFilePath, count: topSkills.length },
    "Wrote top skills JSON"
  );

  // Create formatted_skills directory
  const formattedSkillsDir = join(__dirname, workspaceSId, "formatted_skills");
  if (!existsSync(formattedSkillsDir)) {
    mkdirSync(formattedSkillsDir, { recursive: true });
    scriptLogger.info(
      { directory: formattedSkillsDir },
      "Created formatted_skills directory"
    );
  }

  // Create a text file for each skill
  topSkills.forEach((skill, index) => {
    const fileName = sanitizeFileName(skill.name as string) + ".txt";
    const filePath = join(formattedSkillsDir, fileName);
    const formattedContent = formatSkillToText(skill as Skill);

    writeFileSync(filePath, formattedContent, "utf-8");

    scriptLogger.info(
      {
        rank: index + 1,
        skillName: skill.name,
        confidenceScore: skill.confidenceScore,
        filePath: fileName,
      },
      "Created formatted skill file"
    );
  });

  scriptLogger.info(
    {
      totalSkills: allSkills.length,
      filteredSkills: filteredSkills.length,
      outputSkills: topSkills.length,
      jsonFile: `${workspaceSId}/top_skills.json`,
      textDir: `${workspaceSId}/formatted_skills`,
    },
    "Completed extraction and formatting"
  );
});
