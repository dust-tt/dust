import { GoogleGenAI } from "@google/genai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

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

interface Skill {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  agent_name: string;
  icon: string;
  confidenceScore?: number;
  requiredTools: RequiredTool[];
}

interface GradeResult {
  evaluation: number;
  comment: string;
  improvement: string | null;
}

interface GradedSkill extends Skill {
  grade: GradeResult;
}

interface Example {
  input: Skill;
  output: GradeResult;
}

const MAX_RETRIES = 3;

const argumentSpecs: ArgumentSpecs = {
  workspaceSId: {
    type: "string",
    required: true,
    description: "The workspace sId to grade skills for",
  },
  topN: {
    type: "number",
    description: "Number of top skills to select after grading (default: 3)",
  },
};

function sanitizeJsonString(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function loadExamples(examplesFile: string): Example[] {
  if (!existsSync(examplesFile)) {
    return [];
  }

  try {
    const data = JSON.parse(readFileSync(examplesFile, "utf-8"));
    return data.examples || [];
  } catch {
    return [];
  }
}

function formatExamples(examples: Example[]): string {
  if (examples.length === 0) {
    return "";
  }

  const formattedExamples = examples.map((example, index) => {
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
  });

  return formattedExamples.join("\n");
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
${(skill.requiredTools || []).length > 0 ? skill.requiredTools.map((t) => `- ${t.tool_name} (${t.tool_type}): ${t.tool_description}`).join("\n") : "None"}
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

      const sanitizedText = sanitizeJsonString(text);
      const parsed: GradeResult = JSON.parse(sanitizedText);

      if (
        typeof parsed.evaluation !== "number" ||
        parsed.evaluation < 0 ||
        parsed.evaluation > 1
      ) {
        throw new Error(
          `Invalid evaluation score: ${parsed.evaluation}. Must be between 0 and 1.`
        );
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

/**
 * Grades skills using Google Gemini and selects the top N.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/4_grade_skills.ts --workspaceSId <workspaceSId>
 *
 * Note: Requires 4_examples.json to be downloaded from Notion and placed in this directory.
 */
makeScript(argumentSpecs, async (args, scriptLogger) => {
  const workspaceSId = args.workspaceSId as string;
  const topN = (args.topN as number) || 3;

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
    );
  }

  const client = new GoogleGenAI({ apiKey });

  // Read skills from top_skills.json
  const inputPath = join(__dirname, workspaceSId, "top_skills.json");
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Read prompt file
  const promptPath = join(__dirname, "4_prompt.txt");
  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }

  scriptLogger.info({ inputPath }, "Reading skills");
  const skills: Skill[] = JSON.parse(readFileSync(inputPath, "utf-8"));
  scriptLogger.info({ skillCount: skills.length }, "Found skills to grade");

  // Load examples
  const examplesFile = join(__dirname, "4_examples.json");
  const examples = loadExamples(examplesFile);
  scriptLogger.info({ exampleCount: examples.length }, "Loaded grading examples");

  // Read skill definition file
  const skillDefinitionPath = join(__dirname, "4_skill_definition.md");
  if (!existsSync(skillDefinitionPath)) {
    throw new Error(`Skill definition file not found: ${skillDefinitionPath}`);
  }
  const skillDefinition = readFileSync(skillDefinitionPath, "utf-8");

  // Read and prepare prompt
  let prompt = readFileSync(promptPath, "utf-8");
  prompt = prompt.replace("[SKILL_DEFINITION]", skillDefinition);
  prompt = prompt.replace("[GRADING_EXAMPLES]", formatExamples(examples));

  // Grade each skill
  const gradedSkills: GradedSkill[] = [];

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    scriptLogger.info(
      { index: i + 1, total: skills.length, skillName: skill.name },
      "Grading skill"
    );

    const grade = await gradeSkill(client, skill, prompt);
    gradedSkills.push({ ...skill, grade });

    scriptLogger.info(
      { skillName: skill.name, score: grade.evaluation, comment: grade.comment },
      "Graded skill"
    );

    // Small delay between API calls
    if (i < skills.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Sort by evaluation score and take top N
  const sortedSkills = gradedSkills.sort(
    (a, b) => b.grade.evaluation - a.grade.evaluation
  );
  const topSkills = sortedSkills.slice(0, topN);

  // Remove grade wrapper and confidenceScore for output
  const outputSkills = topSkills.map(
    ({ grade: _, confidenceScore: __, ...skill }) => skill
  );

  // Write output
  const outputPath = join(__dirname, workspaceSId, "final_skills.json");
  writeFileSync(outputPath, JSON.stringify(outputSkills, null, 2));
  scriptLogger.info({ outputPath, count: outputSkills.length }, "Wrote final skills");

  // Write grading report
  const reportPath = join(__dirname, workspaceSId, "grading_report.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        workspace_sId: workspaceSId,
        total_skills: skills.length,
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
  scriptLogger.info({ reportPath }, "Wrote grading report");

  // Print summary
  scriptLogger.info("=== Top Skills ===");
  topSkills.forEach((skill, index) => {
    scriptLogger.info(
      {
        rank: index + 1,
        name: skill.name,
        score: skill.grade.evaluation,
        comment: skill.grade.comment,
      },
      "Top skill"
    );
  });
});
