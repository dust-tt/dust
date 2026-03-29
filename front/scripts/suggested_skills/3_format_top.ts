import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

type Skill = {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  agent_name: string;
  requiredTools?: Array<{
    tool_sid?: string;
    tool_name: string;
  }>;
  requiredDatasources?: Array<{
    datasource_name: string;
    connector_provider: string;
    parents_in: string[];
  }>;
  confidenceScore: number;
  agent_sid?: string;
  agent_description?: string;
  agent_instructions?: string;
};

const argumentSpecs: ArgumentSpecs = {
  workspaceName: {
    description: "The workspace name to extract skills from",
    type: "string",
  },
};

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
      (tool) => `- ${tool.tool_name} (${tool.tool_sid})`
    ),
    "",
    "",
    "",
    "DATASOURCES USED",
    "-".repeat(80),
    ...(skill.requiredDatasources ?? []).map((ds) => {
      const parentsInfo =
        ds.parents_in.length > 0
          ? ` [Parents: ${ds.parents_in.join(", ")}]`
          : "";
      return `- ${ds.datasource_name}${parentsInfo}`;
    }),
    "",
  ];

  return sections.join("\n");
}

function sanitizeFileName(name: string): string {
  // Replace special characters with underscores and remove any problematic characters
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Usage: npx tsx scripts/suggested_skills/3_format_top.ts --workspaceName <workspace_name>
makeScript(argumentSpecs, async ({ workspaceName }, scriptLogger) => {
  // Read suggested skills from workspaceName/top_suggested_without_datasource.json
  const suggestedSkillsPath = join(
    __dirname,
    workspaceName,
    "top_suggested_without_datasource.json"
  );

  if (!existsSync(suggestedSkillsPath)) {
    throw new Error(
      `Suggested skills file not found at ${suggestedSkillsPath}`
    );
  }

  const fileContent = readFileSync(suggestedSkillsPath, "utf-8");
  const allSkills = JSON.parse(fileContent) as Skill[];

  scriptLogger.info(
    { totalSkills: allSkills.length },
    "Loaded suggested skills"
  );

  scriptLogger.info({ skillsCount: allSkills.length }, "Extracting all skills");

  // Create formatted_skills directory if it doesn't exist
  const formattedSkillsDir = join(__dirname, workspaceName, "formatted_skills");
  if (!existsSync(formattedSkillsDir)) {
    mkdirSync(formattedSkillsDir, { recursive: true });
    scriptLogger.info(
      { directory: formattedSkillsDir },
      "Created formatted_skills directory"
    );
  }

  // Create a text file for each skill
  allSkills.forEach((skill, index) => {
    const fileName = sanitizeFileName(skill.name) + ".txt";
    const filePath = join(formattedSkillsDir, fileName);
    const formattedContent = formatSkillToText(skill);

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
      totalFilesCreated: allSkills.length,
      outputDirectory: `${workspaceName}/formatted_skills`,
    },
    "Completed extraction"
  );
});
