import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import type { Logger } from "pino";

import { makeScript } from "@app/scripts/helpers";

import type {
  AgentPromptInput,
  EvaluationOutput,
  EvaluationResult,
} from "./types";
import { DATA_FILES, PROMPT_TEMPLATES } from "./types";

function getRunsDir(workspaceId: string, agentName: string): string {
  return path.join(__dirname, "runs", workspaceId, agentName);
}

function buildSuggestionPrompt(
  promptTemplate: string,
  agentPrompt: string,
  workspaceId: string,
  evaluationResults: EvaluationResult[]
): string {
  // Build the comments and suggestions section
  const commentsAndSuggestions = evaluationResults
    .filter((r) => r.evaluation && r.evaluation.result === "No")
    .map((r, index) => {
      const conversationLink = `https://dust.tt/w/${workspaceId}/assistant/${r.conversationId}`;
      const lines = [
        `### Issue ${index + 1} (${conversationLink})`,
        `Summary: ${r.evaluation!.summary}`,
      ];
      if (r.evaluation!.suggestion) {
        lines.push(`Suggestion: ${r.evaluation!.suggestion}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  // Build the full prompt
  return `${promptTemplate}

-------- Agent Prompt --------
${agentPrompt}

-------- Comments and suggestions --------
${commentsAndSuggestions}
`;
}

const MAX_RETRIES = 3;

async function callSuggestionAgent(
  anthropic: Anthropic,
  prompt: string,
  modelId: string
): Promise<{ response: string | null; error?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: modelId,
        max_tokens: 8192,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        lastError = "No text content in response";
        continue;
      }

      return { response: textBlock.text };
    } catch (error) {
      lastError = `Attempt ${attempt}/${MAX_RETRIES}: ${error instanceof Error ? error.message : String(error)}`;
      if (attempt < MAX_RETRIES) {
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  return {
    response: null,
    error: lastError,
  };
}

export interface SuggestPromptEditsParams {
  workspaceId: string;
  agentName: string;
  suggestionModel: string;
  execute: boolean;
}

export async function runSuggestPromptEdits(
  params: SuggestPromptEditsParams,
  logger: Logger
): Promise<void> {
  const { workspaceId, agentName, suggestionModel, execute } = params;
  const scriptDir = __dirname;
  const runsDir = getRunsDir(workspaceId, agentName);

  // Create Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.DUST_MANAGED_ANTHROPIC_API_KEY,
  });

  // Load the suggestion prompt template
  const templatePath = path.join(scriptDir, PROMPT_TEMPLATES.SUGGESTION);
  const promptTemplate = fs.readFileSync(templatePath, "utf-8");

  // Load agent prompt from JSON file
  const promptPath = path.join(runsDir, DATA_FILES.PROMPT);
  const promptJson = fs.readFileSync(promptPath, "utf-8");
  const agentPromptArray: AgentPromptInput[] = JSON.parse(promptJson);

  if (!agentPromptArray || agentPromptArray.length === 0) {
    throw new Error(
      `No agent prompt found in ${promptPath}. Ensure the SQL query returned results.`
    );
  }

  const agentPromptData = agentPromptArray[0];
  const agentPrompt =
    agentPromptData.instructions ?? "(No instructions defined)";

  // Load evaluation results from JSON file
  const evaluationPath = path.join(runsDir, DATA_FILES.EVALUATION);
  const evaluationJson = fs.readFileSync(evaluationPath, "utf-8");
  const evaluationOutput: EvaluationOutput = JSON.parse(evaluationJson);

  // Filter to only include results with issues (result === "No")
  const issueResults = evaluationOutput.results.filter(
    (r) => r.evaluation && r.evaluation.result === "No"
  );

  logger.info(
    {
      workspaceId,
      agentName,
      suggestionModel,
      agentSId: agentPromptData.agentSId,
      totalResults: evaluationOutput.results.length,
      issueCount: issueResults.length,
    },
    "Starting suggestion generation"
  );

  if (issueResults.length === 0) {
    logger.info("No issues found in evaluation results. Nothing to suggest.");
    return;
  }

  // Build the full prompt
  const suggestionPrompt = buildSuggestionPrompt(
    promptTemplate,
    agentPrompt,
    workspaceId,
    issueResults
  );

  if (!execute) {
    logger.info(
      {
        promptLength: suggestionPrompt.length,
        issueCount: issueResults.length,
      },
      "Would generate suggestions (dry run)"
    );
    console.log("\n" + "=".repeat(80));
    console.log("DRY RUN - Prompt that would be sent:");
    console.log("=".repeat(80));
    console.log(suggestionPrompt);
    return;
  }

  // Call the suggestion agent
  const result = await callSuggestionAgent(
    anthropic,
    suggestionPrompt,
    suggestionModel
  );

  if (result.error) {
    logger.error({ error: result.error }, "Failed to generate suggestions");
    return;
  }

  // Write results to file
  const outputPath = path.join(runsDir, DATA_FILES.SUGGESTION);
  fs.writeFileSync(outputPath, result.response ?? "");
  logger.info({ outputFile: outputPath }, "Suggestion written to file");

  // Print to console
  console.log("\n" + "=".repeat(80));
  console.log("SUGGESTION RESULT");
  console.log("=".repeat(80));
  console.log(result.response);
  console.log("\n" + "=".repeat(80));
  console.log(`Results saved to: ${outputPath}`);
}

// CLI entry point
if (require.main === module) {
  makeScript(
    {
      workspaceId: {
        type: "string",
        demandOption: true,
        description: "Workspace sId",
      },
      agentName: {
        type: "string",
        demandOption: true,
        description: "Agent name (used for folder structure)",
      },
      suggestionModel: {
        type: "string",
        default: "claude-sonnet-4-20250514",
        description: "Model ID to use for generating suggestions",
      },
    },
    async ({ workspaceId, agentName, suggestionModel, execute }, logger) => {
      await runSuggestPromptEdits(
        { workspaceId, agentName, suggestionModel, execute },
        logger
      );
    }
  );
}
