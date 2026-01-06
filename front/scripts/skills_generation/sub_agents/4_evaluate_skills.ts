import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

interface SourceAgent {
  agentId: string;
  agentName: string;
  workspaceSid: string;
}

interface Skill {
  name: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  instructions: string;
  requiredTools: string[];
  agentsUsingSkill: string[];
  confidenceScore: number;
  sourceAgent: SourceAgent;
}

interface EvaluatedSkill extends Skill {
  evaluatedConfidenceScore: number;
  evaluationReasoning: string;
}

interface GeminiEvaluationResponse {
  confidenceScore: number;
  reasoning: string;
}

async function evaluateSkill(
  client: GoogleGenAI,
  skill: Skill,
  prompt: string
): Promise<{ confidenceScore: number; reasoning: string }> {
  const skillContext = `
Skill Name: ${skill.name}

User-facing Description: ${skill.userFacingDescription}

Agent-facing Description: ${skill.agentFacingDescription}

Instructions:
${skill.instructions}

Required Tools: ${skill.requiredTools.join(", ")}

Agents Using This Skill: ${skill.agentsUsingSkill.join(", ")}
`;

  const fullPrompt = prompt + skillContext;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      console.error(`Empty response for skill ${skill.name}`);
      return { confidenceScore: skill.confidenceScore, reasoning: "No response from evaluator" };
    }

    const parsed: GeminiEvaluationResponse = JSON.parse(text);
    return {
      confidenceScore: parsed.confidenceScore,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error(`Error evaluating skill ${skill.name}:`, error);
    return { confidenceScore: skill.confidenceScore, reasoning: "Evaluation failed" };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  const appendMode = args.includes("--append");

  // Parse --limit argument
  const limitIndex = args.indexOf("--limit");
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit <= 0) {
      console.error("Error: --limit must be a positive number");
      process.exit(1);
    }
  }

  const apiKey = process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const inputPath = path.join(__dirname, "3_generated_skills.json");
  const promptPath = path.join(__dirname, "4_prompt.txt");
  const outputPath = path.join(__dirname, "4_evaluated_skills.json");

  console.log(`Reading skills from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  let skills: Skill[] = JSON.parse(rawData);

  if (limit) {
    console.log(`Limiting to first ${limit} skills`);
    skills = skills.slice(0, limit);
  }

  console.log(`Reading prompt from ${promptPath}...`);
  const prompt = fs.readFileSync(promptPath, "utf-8");

  // Load existing evaluated skills if in append mode
  let existingSkills: EvaluatedSkill[] = [];
  if (appendMode && fs.existsSync(outputPath)) {
    console.log(`Append mode: loading existing results from ${outputPath}...`);
    const existingData = fs.readFileSync(outputPath, "utf-8");
    existingSkills = JSON.parse(existingData);
    console.log(`Found ${existingSkills.length} existing evaluated skills`);

    // Filter out skills that have already been evaluated
    const existingSkillKeys = new Set(
      existingSkills.map((s) => `${s.sourceAgent.agentId}-${s.name}`)
    );
    const originalCount = skills.length;
    skills = skills.filter(
      (s) => !existingSkillKeys.has(`${s.sourceAgent.agentId}-${s.name}`)
    );
    console.log(
      `Skipping ${originalCount - skills.length} already evaluated skills`
    );
  }

  console.log(`Evaluating ${skills.length} skills...`);

  const evaluatedSkills: EvaluatedSkill[] = [];
  let processed = 0;

  for (const skill of skills) {
    processed++;
    console.log(
      `[${processed}/${skills.length}] Evaluating skill: ${skill.name}`
    );

    const evaluation = await evaluateSkill(client, skill, prompt);

    evaluatedSkills.push({
      ...skill,
      evaluatedConfidenceScore: evaluation.confidenceScore,
      evaluationReasoning: evaluation.reasoning,
    });

    console.log(
      `  -> Original: ${skill.confidenceScore.toFixed(2)}, Evaluated: ${evaluation.confidenceScore.toFixed(2)}`
    );

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Combine with existing skills if in append mode
  const allEvaluatedSkills = [...existingSkills, ...evaluatedSkills];

  // Sort by evaluated confidence score (descending)
  allEvaluatedSkills.sort((a, b) => b.evaluatedConfidenceScore - a.evaluatedConfidenceScore);

  console.log(`\nTotal skills evaluated: ${evaluatedSkills.length}`);
  if (appendMode) {
    console.log(`Total skills in output (including existing): ${allEvaluatedSkills.length}`);
  }
  console.log(`Writing results to ${outputPath}...`);

  fs.writeFileSync(outputPath, JSON.stringify(allEvaluatedSkills, null, 2));

  console.log("Done!");

  // Print summary (use all skills for summary)
  console.log("\nEvaluated skills summary by confidence score:");
  const highConfidence = allEvaluatedSkills.filter((s) => s.evaluatedConfidenceScore >= 0.8);
  const mediumConfidence = allEvaluatedSkills.filter(
    (s) => s.evaluatedConfidenceScore >= 0.5 && s.evaluatedConfidenceScore < 0.8
  );
  const lowConfidence = allEvaluatedSkills.filter((s) => s.evaluatedConfidenceScore < 0.5);

  console.log(`  High (>=0.8): ${highConfidence.length}`);
  console.log(`  Medium (0.5-0.8): ${mediumConfidence.length}`);
  console.log(`  Low (<0.5): ${lowConfidence.length}`);

  // Score comparison (only for newly evaluated skills)
  if (evaluatedSkills.length > 0) {
    console.log("\nScore comparison (original vs evaluated) for new evaluations:");
    let scoreIncreased = 0;
    let scoreDecreased = 0;
    let scoreUnchanged = 0;
    let totalDiff = 0;

    for (const skill of evaluatedSkills) {
      const diff = skill.evaluatedConfidenceScore - skill.confidenceScore;
      totalDiff += diff;
      if (diff > 0.05) {
        scoreIncreased++;
      } else if (diff < -0.05) {
        scoreDecreased++;
      } else {
        scoreUnchanged++;
      }
    }

    console.log(`  Increased (>0.05 diff): ${scoreIncreased}`);
    console.log(`  Decreased (<-0.05 diff): ${scoreDecreased}`);
    console.log(`  Unchanged: ${scoreUnchanged}`);
    console.log(`  Average difference: ${(totalDiff / evaluatedSkills.length).toFixed(3)}`);
  }

  if (highConfidence.length > 0) {
    console.log("\nTop 5 highest evaluated confidence skills:");
    for (const skill of highConfidence.slice(0, 5)) {
      console.log(
        `  - ${skill.name} (${skill.evaluatedConfidenceScore.toFixed(2)}) from ${skill.sourceAgent.agentName}`
      );
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
