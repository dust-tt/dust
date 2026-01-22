import { GoogleGenAI } from "@google/genai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Logger } from "pino";

import { makeScript } from "@app/scripts/helpers";
import type {
  GradedSkill,
  GradeResult,
  GradingExample,
  Skill,
} from "@app/scripts/suggested_skills/types";

const MAX_RETRIES = 3;

function loadSkills(workspaceId: string): Skill[] {
  const inputPath = join(__dirname, workspaceId, "top_skills.json");
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  return JSON.parse(readFileSync(inputPath, "utf-8"));
}

function loadExamples(): GradingExample[] {
  const examplesFile = join(__dirname, "4_examples.json");
  if (!existsSync(examplesFile)) {
    return [];
  }

  try {
    const data = JSON.parse(readFileSync(examplesFile, "utf-8"));
    return data.examples ?? [];
  } catch {
    return [];
  }
}

function loadPrompt(examples: GradingExample[]): string {
  const promptPath = join(__dirname, "4_prompt.txt");
  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }

  const skillDefinitionPath = join(__dirname, "4_skill_definition.md");
  if (!existsSync(skillDefinitionPath)) {
    throw new Error(`Skill definition file not found: ${skillDefinitionPath}`);
  }

  let prompt = readFileSync(promptPath, "utf-8");
  prompt = prompt.replace(
    "[SKILL_DEFINITION]",
    readFileSync(skillDefinitionPath, "utf-8")
  );
  prompt = prompt.replace("[GRADING_EXAMPLES]", formatExamples(examples));
  return prompt;
}

function formatExamples(examples: GradingExample[]): string {
  if (examples.length === 0) {
    return "";
  }

  return examples
    .map((example, index) => {
      const scoreRange =
        example.output.evaluation >= 0.8
          ? "High-quality skill"
          : example.output.evaluation >= 0.5
            ? "Medium-quality skill"
            : "Low-quality skill";

      return `### Example ${index + 1}: ${scoreRange} (Score: ${example.output.evaluation})

**Input Skill**:
- **Name**: ${example.input.name}
- **Description**: ${example.input.description_for_humans}
- **Instructions** (truncated): ${example.input.instructions.slice(0, 500)}...

**Expected Output**:
\`\`\`json
${JSON.stringify(example.output, null, 2)}
\`\`\`
`;
    })
    .join("\n");
}

function sanitizeJsonString(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

async function gradeSkill(
  client: GoogleGenAI,
  skill: Skill,
  prompt: string
): Promise<GradeResult> {
  const skillContext = `
## Skill to Grade

**Name**: ${skill.name}

**Description for Humans**: ${skill.description_for_humans}

**Description for Agents**: ${skill.description_for_agents}

**Instructions**:
${skill.instructions}

**Required Tools**:
${skill.requiredTools?.length ? skill.requiredTools.map((t) => `- ${t.tool_name} (${t.tool_type}): ${t.tool_description}`).join("\n") : "None"}
`;

  const fullPrompt = prompt.replace("[SKILL_TO_GRADE]", skillContext);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
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

      const parsed: GradeResult = JSON.parse(sanitizeJsonString(text));

      if (
        typeof parsed.evaluation !== "number" ||
        parsed.evaluation < 0 ||
        parsed.evaluation > 1
      ) {
        throw new Error(`Invalid evaluation score: ${parsed.evaluation}`);
      }

      if (typeof parsed.comment !== "string") {
        throw new Error("Missing or invalid comment field");
      }

      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  return {
    evaluation: 0,
    comment: `Failed to grade after ${MAX_RETRIES} attempts: ${lastError}`,
    improvement: null,
  };
}

async function gradeAllSkills(
  client: GoogleGenAI,
  skills: Skill[],
  prompt: string,
  logger: Logger
): Promise<GradedSkill[]> {
  const gradedSkills: GradedSkill[] = [];

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    logger.info(
      { index: i + 1, total: skills.length, skillName: skill.name },
      "Grading skill"
    );

    const grade = await gradeSkill(client, skill, prompt);
    gradedSkills.push({ ...skill, grade });

    logger.info(
      {
        skillName: skill.name,
        score: grade.evaluation,
        comment: grade.comment,
      },
      "Graded skill"
    );

    if (i < skills.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return gradedSkills;
}

function writeResults(
  gradedSkills: GradedSkill[],
  topK: number,
  workspaceId: string,
  logger: Logger
): void {
  const sortedSkills = [...gradedSkills].sort(
    (a, b) => b.grade.evaluation - a.grade.evaluation
  );
  const topSkills = sortedSkills.slice(0, topK);

  // Write final skills (without grade metadata)
  const outputSkills = topSkills.map(
    ({ grade: _, confidenceScore: __, ...skill }) => skill
  );
  const outputPath = join(__dirname, workspaceId, "final_skills.json");
  writeFileSync(outputPath, JSON.stringify(outputSkills, null, 2));
  logger.info({ outputPath, count: outputSkills.length }, "Wrote final skills");

  // Write grading report
  const reportPath = join(__dirname, workspaceId, "grading_report.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        workspace_id: workspaceId,
        total_skills: gradedSkills.length,
        graded_at: new Date().toISOString(),
        all_grades: sortedSkills.map((s) => ({
          name: s.name,
          evaluation: s.grade.evaluation,
          comment: s.grade.comment,
          improvement: s.grade.improvement,
        })),
        top_skills: topSkills.map((s) => s.name),
      },
      null,
      2
    )
  );
  logger.info({ reportPath }, "Wrote grading report");
}

function logTopSkills(topSkills: GradedSkill[], logger: Logger): void {
  logger.info("=== Top Skills ===");
  topSkills.forEach((skill, index) => {
    logger.info(
      {
        rank: index + 1,
        name: skill.name,
        score: skill.grade.evaluation,
        comment: skill.grade.comment,
      },
      "Top skill"
    );
  });
}

/**
 * Grades skills using Google Gemini and selects the top N.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/4_grade_skills.ts --workspaceId <workspaceId>
 *
 * Note: Requires 4_examples.json to be downloaded from Notion and placed in this directory.
 */
makeScript(
  {
    workspaceId: {
      type: "string",
    },
    topK: {
      type: "number",
      description: "Number of top skills to select after grading",
      default: 10,
    },
  },
  async ({ workspaceId, topK }, logger) => {
    const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      throw new Error(
        "DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
      );
    }

    const client = new GoogleGenAI({ apiKey });
    const skills = loadSkills(workspaceId);
    const examples = loadExamples();
    const prompt = loadPrompt(examples);

    logger.info(
      { skillCount: skills.length, exampleCount: examples.length },
      "Loaded skills and examples"
    );

    const gradedSkills = await gradeAllSkills(client, skills, prompt, logger);
    writeResults(gradedSkills, topK, workspaceId, logger);

    const sortedSkills = [...gradedSkills].sort(
      (a, b) => b.grade.evaluation - a.grade.evaluation
    );
    logTopSkills(sortedSkills.slice(0, topK), logger);
  }
);
