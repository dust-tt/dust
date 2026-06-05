import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

type Skill = {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  agent_name: string;
  icon: string;
  requiredTools?: Array<{
    tool_name: string;
    tool_type: "internal" | "remote";
    tool_description: string;
    mcp_server_view_id: number;
    internal_mcp_server_id?: string;
    remote_mcp_server_id?: string;
    internal_tool_name?: string;
    internal_tool_description?: string;
  }>;
  requiredDatasources?: Array<{
    datasource_id: string;
    datasource_name: string;
    connector_provider: string;
    data_source_view_id: number;
    datasource_description: string;
  }>;
  confidenceScore: number;
  agent_sid: string;
  agent_description: string;
  agent_instructions: string;
};

const argumentSpecs: ArgumentSpecs = {
  workspaceName: {
    type: "string",
    required: true,
    description: "The workspace name to extract top skills from",
  },
};

// Helper function to remove null values from objects
const removeNulls = <T>(obj: T): T => {
  if (Array.isArray(obj)) {
    return obj.map(removeNulls) as T;
  } else if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null) {
        cleaned[key] = removeNulls(value);
      }
    }
    return cleaned as T;
  }
  return obj;
};

// Usage: npx tsx scripts/suggested_skills/2_extract_top.ts --workspaceName <workspace-name>
// Example: npx tsx scripts/suggested_skills/2_extract_top.ts --workspaceName dust
makeScript(argumentSpecs, async (args, scriptLogger) => {
  const workspaceName = args.workspaceName as string;

  // Read suggested skills from <workspaceName>/suggested_skills.json
  const suggestedSkillsPath = join(
    __dirname,
    workspaceName,
    "suggested_skills.json"
  );

  scriptLogger.info(
    { filePath: suggestedSkillsPath },
    "Reading suggested skills file"
  );

  const fileContent = readFileSync(suggestedSkillsPath, "utf-8");
  const allSkills = JSON.parse(fileContent) as Skill[];

  scriptLogger.info(
    { totalSkills: allSkills.length },
    "Loaded suggested skills"
  );

  // Filter and save top 10 skills with no required datasources
  // Format output to be compatible with create_hard_coded_suggested_skills.ts
  const topSkillsWithoutDatasources = allSkills
    .filter((skill) => !skill.requiredDatasources || skill.requiredDatasources.length === 0)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 10)
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

      // Add requiredTools if present
      if (skill.requiredTools && skill.requiredTools.length > 0) {
        cleanedSkill.requiredTools = skill.requiredTools;
      }

      // Add requiredDatasources if present
      if (skill.requiredDatasources && skill.requiredDatasources.length > 0) {
        cleanedSkill.requiredDatasources = skill.requiredDatasources;
      }

      return cleanedSkill;
    });

  const topSkillsFilePath = join(
    __dirname,
    workspaceName,
    "top_suggested_without_datasource.json"
  );

  writeFileSync(
    topSkillsFilePath,
    JSON.stringify(removeNulls(topSkillsWithoutDatasources), null, 2)
  );

  scriptLogger.info(
    {
      totalSkills: allSkills.length,
      topSkillsWithoutDatasources: topSkillsWithoutDatasources.length,
      outputFile: `${workspaceName}/top_suggested_without_datasource.json`,
    },
    "Completed extraction"
  );
});
