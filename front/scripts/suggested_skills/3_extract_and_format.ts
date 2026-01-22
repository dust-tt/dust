import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Logger } from "pino";

import { makeScript } from "@app/scripts/helpers";
import type { Skill } from "@app/scripts/suggested_skills/types";
import { removeNulls } from "@app/types";

function loadSuggestedSkills(workspaceId: string): Skill[] {
  const suggestedSkillsPath = join(
    __dirname,
    workspaceId,
    "suggested_skills.json"
  );

  if (!existsSync(suggestedSkillsPath)) {
    throw new Error(
      `Suggested skills file not found at ${suggestedSkillsPath}`
    );
  }

  const fileContent = readFileSync(suggestedSkillsPath, "utf-8");
  return JSON.parse(fileContent);
}

function extractTopSkills(skills: Skill[], topK: number): Skill[] {
  return skills
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, topK)
    .map((skill) => {
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

      return cleanedSkill as Skill;
    });
}

function writeTopSkillsJson(
  skills: Skill[],
  workspaceId: string,
  logger: Logger
): string {
  const topSkillsFilePath = join(__dirname, workspaceId, "top_skills.json");
  writeFileSync(
    topSkillsFilePath,
    JSON.stringify(removeNulls(skills), null, 2)
  );
  logger.info(
    { outputFile: topSkillsFilePath, count: skills.length },
    "Wrote top skills JSON"
  );
  return topSkillsFilePath;
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
  ];

  return sections.join("\n");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function writeFormattedSkillFiles(
  skills: Skill[],
  workspaceId: string,
  logger: Logger
): void {
  const formattedSkillsDir = join(__dirname, workspaceId, "formatted_skills");
  if (!existsSync(formattedSkillsDir)) {
    mkdirSync(formattedSkillsDir, { recursive: true });
    logger.info(
      { directory: formattedSkillsDir },
      "Created formatted_skills directory"
    );
  }

  skills.forEach((skill, index) => {
    const fileName = sanitizeFileName(skill.name) + ".txt";
    const filePath = join(formattedSkillsDir, fileName);
    const formattedContent = formatSkillToText(skill);

    writeFileSync(filePath, formattedContent, "utf-8");

    logger.info(
      {
        rank: index + 1,
        skillName: skill.name,
        confidenceScore: skill.confidenceScore,
        filePath: fileName,
      },
      "Created formatted skill file"
    );
  });
}

/**
 * Extracts top skills and formats them into text files for review.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/3_extract_and_format.ts --workspaceId <workspaceId>
 */
makeScript(
  {
    workspaceId: {
      type: "string",
    },
    topK: {
      type: "number",
      description: "Number of top skills to extract",
      default: 10,
    },
  },
  async ({ workspaceId, topK }, logger) => {
    const allSkills = loadSuggestedSkills(workspaceId);
    logger.info({ totalSkills: allSkills.length }, "Loaded suggested skills");

    const topSkills = extractTopSkills(allSkills, topK);
    writeTopSkillsJson(topSkills, workspaceId, logger);
    writeFormattedSkillFiles(topSkills, workspaceId, logger);

    logger.info(
      {
        totalSkills: allSkills.length,
        outputSkills: topSkills.length,
        jsonFile: `${workspaceId}/top_skills.json`,
        textDir: `${workspaceId}/formatted_skills`,
      },
      "Done"
    );
  }
);
