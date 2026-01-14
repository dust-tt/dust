import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

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
  confidenceScore?: number; // Optional - excluded from grading
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

const MAX_RETRIES = 3;

interface Example {
  input: Skill;
  output: GradeResult;
}

/**
 * Sanitizes JSON string to fix common escape sequence issues from LLM outputs.
 */
function sanitizeJsonString(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

/**
 * Loads examples from a JSON file containing an "examples" array.
 */
function loadExamples(examplesFile: string): Example[] {
  if (!fs.existsSync(examplesFile)) {
    console.warn(`Examples file not found: ${examplesFile}`);
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(examplesFile, "utf-8"));
    return data.examples || [];
  } catch (error) {
    console.warn(`Failed to parse examples file:`, error);
    return [];
  }
}

/**
 * Formats examples into a string to be inserted into the prompt.
 */
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

function parseArgs(): { inputFile: string; outputFile?: string } {
  const args = process.argv.slice(2);

  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--output");

  if (inputIndex === -1 || !args[inputIndex + 1]) {
    console.error("Error: --input argument is required");
    console.error(
      "Usage: npx tsx grade_skills.ts --input <path_to_json> [--output <output_path>]"
    );
    process.exit(1);
  }

  return {
    inputFile: args[inputIndex + 1],
    outputFile: outputIndex !== -1 ? args[outputIndex + 1] : undefined,
  };
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

      // Validate the response structure
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
        console.warn(
          `  Attempt ${attempt}/${MAX_RETRIES} failed for skill "${skill.name}", retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(
    `Failed to grade skill "${skill.name}" after ${MAX_RETRIES} attempts:`,
    lastError
  );
  // Return a default low grade on failure
  return {
    evaluation: 0,
    comment: "Failed to grade due to API error",
    improvement: null,
  };
}

async function main() {
  const { inputFile, outputFile } = parseArgs();

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  // Resolve input path
  const inputPath = path.isAbsolute(inputFile)
    ? inputFile
    : path.resolve(process.cwd(), inputFile);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Read prompt file
  const promptPath = path.join(__dirname, "4_prompt.txt");
  if (!fs.existsSync(promptPath)) {
    console.error(`Error: Prompt file not found: ${promptPath}`);
    process.exit(1);
  }

  console.log(`Reading skills from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const skills: Skill[] = JSON.parse(rawData);

  console.log(`Found ${skills.length} skills to grade`);

  // Load examples from the examples file
  const examplesFile = path.join(__dirname, "4_examples.json");
  const examples = loadExamples(examplesFile);
  console.log(`Loaded ${examples.length} grading examples`);

  // Read skill definition file
  const skillDefinitionPath = path.join(__dirname, "4_skill_definition.md");
  if (!fs.existsSync(skillDefinitionPath)) {
    console.error(
      `Error: Skill definition file not found: ${skillDefinitionPath}`
    );
    process.exit(1);
  }
  const skillDefinition = fs.readFileSync(skillDefinitionPath, "utf-8");

  // Read and prepare prompt with skill definition and examples
  let prompt = fs.readFileSync(promptPath, "utf-8");

  // Replace placeholders
  prompt = prompt.replace("[SKILL_DEFINITION]", skillDefinition);
  prompt = prompt.replace("[GRADING_EXAMPLES]", formatExamples(examples));

  // Grade each skill
  const gradedSkills: GradedSkill[] = [];

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    console.log(`\nGrading skill ${i + 1}/${skills.length}: ${skill.name}...`);

    const grade = await gradeSkill(client, skill, prompt);
    gradedSkills.push({ ...skill, grade });

    console.log(`  Score: ${grade.evaluation.toFixed(2)} - ${grade.comment}`);

    // Small delay between API calls to avoid rate limiting
    if (i < skills.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Sort by evaluation score (descending) and take top 3
  const sortedSkills = gradedSkills.sort(
    (a, b) => b.grade.evaluation - a.grade.evaluation
  );
  const top3Skills = sortedSkills.slice(0, 3);

  // Remove the grade wrapper and confidenceScore, output in the same format as input
  const outputSkills = top3Skills.map(
    ({ grade: _, confidenceScore: __, ...skill }) => skill
  );

  // Determine output path
  const resolvedOutputPath = outputFile
    ? path.isAbsolute(outputFile)
      ? outputFile
      : path.resolve(process.cwd(), outputFile)
    : path.join(
        path.dirname(inputPath),
        `${path.basename(inputPath, ".json")}_top3.json`
      );

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });

  // Write output
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(outputSkills, null, 2));
  console.log(`\nTop 3 skills written to ${resolvedOutputPath}`);

  // Print summary
  console.log("\n=== Top 3 Skills ===");
  top3Skills.forEach((skill, index) => {
    console.log(
      `\n${index + 1}. ${skill.name} (Score: ${skill.grade.evaluation.toFixed(2)})`
    );
    console.log(`   Comment: ${skill.grade.comment}`);
    if (skill.grade.improvement) {
      console.log(`   Improvement: ${skill.grade.improvement}`);
    }
  });

  // Also write a detailed grading report
  const reportPath = path.join(
    path.dirname(resolvedOutputPath),
    `${path.basename(inputPath, ".json")}_grading_report.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        input_file: inputPath,
        total_skills: skills.length,
        graded_at: new Date().toISOString(),
        all_grades: sortedSkills.map((s) => ({
          name: s.name,
          evaluation: s.grade.evaluation,
          comment: s.grade.comment,
          improvement: s.grade.improvement,
        })),
        top_3: top3Skills.map((s) => s.name),
      },
      null,
      2
    )
  );
  console.log(`\nDetailed grading report written to ${reportPath}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
