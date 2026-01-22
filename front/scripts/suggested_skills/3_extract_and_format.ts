import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { makeScript } from "@app/scripts/helpers";
import type { Skill } from "@app/scripts/suggested_skills/types";
import { removeNulls } from "@app/types";

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
      description: "The workspace ID to extract skills from",
    },
    topK: {
      type: "number",
      description: "Number of top skills to extract (default: 10)",
      default: 10,
    },
  },
  async ({ workspaceId, topK }, scriptLogger) => {
    // Read suggested skills from <workspaceId>/suggested_skills.json
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

    scriptLogger.info(
      { filePath: suggestedSkillsPath },
      "Reading suggested skills"
    );

    const fileContent = readFileSync(suggestedSkillsPath, "utf-8");
    const allSkills = JSON.parse(fileContent) as Skill[];

    scriptLogger.info(
      { totalSkills: allSkills.length },
      "Loaded suggested skills"
    );

    // Sort by confidence score and take top N
    const topSkills = allSkills
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, topK)
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

        return cleanedSkill;
      });

    // Write JSON output
    const topSkillsFilePath = join(__dirname, workspaceId, "top_skills.json");
    writeFileSync(
      topSkillsFilePath,
      JSON.stringify(removeNulls(topSkills), null, 2)
    );

    scriptLogger.info(
      { outputFile: topSkillsFilePath, count: topSkills.length },
      "Wrote top skills JSON"
    );

    // Create formatted_skills directory
    const formattedSkillsDir = join(__dirname, workspaceId, "formatted_skills");
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
        outputSkills: topSkills.length,
        jsonFile: `${workspaceId}/top_skills.json`,
        textDir: `${workspaceId}/formatted_skills`,
      },
      "Completed extraction and formatting"
    );
  }
);
