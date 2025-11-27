import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import type { Logger } from "pino";

import { makeScript } from "@app/scripts/helpers";

import type {
  AgentPromptInput,
  EvaluationResponse,
  EvaluationResult,
  FeedbackInput,
  RawMessageInput,
  StepContent,
} from "./types";
import { DATA_FILES, PROMPT_TEMPLATES } from "./types";

function getRunsDir(workspaceId: string, agentName: string): string {
  return path.join(__dirname, "runs", workspaceId, agentName);
}

function ensureRunsDir(workspaceId: string, agentName: string): string {
  const runsDir = getRunsDir(workspaceId, agentName);
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }
  return runsDir;
}

function parseStepContents(raw: string): StepContent[] | null {
  if (!raw || raw === "") {
    return null;
  }
  try {
    return JSON.parse(raw) as StepContent[];
  } catch {
    return null;
  }
}

function formatConversationForEvaluation(messages: RawMessageInput[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    if (msg.messageType === "user" && msg.userMessageContent) {
      const userName =
        msg.userContextFullName || msg.userContextUsername || "User";
      lines.push(`[USER - ${userName}]`);
      lines.push(msg.userMessageContent);
      lines.push("");
    } else if (msg.messageType === "agent") {
      const stepContents = parseStepContents(msg.stepContents);
      if (stepContents && stepContents.length > 0) {
        lines.push(`[AGENT]`);

        for (const step of stepContents) {
          if (step.type === "text_content") {
            // Handle nested value structure
            const text =
              typeof step.value.value === "string"
                ? step.value.value
                : step.value.text;
            if (text) {
              lines.push(text);
            }
          } else if (step.type === "function_call") {
            // Handle nested value structure for function calls
            const funcValue = step.value.value;
            if (typeof funcValue === "object" && funcValue !== null) {
              const funcData = funcValue as {
                id: string;
                name: string;
                arguments: string;
              };
              lines.push(`[TOOL CALL: ${funcData.name}]`);
              if (funcData.arguments) {
                try {
                  const args = JSON.parse(funcData.arguments);
                  lines.push(`Arguments: ${JSON.stringify(args, null, 2)}`);
                } catch {
                  lines.push(`Arguments: ${funcData.arguments}`);
                }
              }
            } else {
              lines.push(`[TOOL CALL: ${step.value.name}]`);
              if (step.value.arguments) {
                lines.push(
                  `Arguments: ${JSON.stringify(step.value.arguments, null, 2)}`
                );
              }
            }
            if (step.value.result !== undefined) {
              const resultStr =
                typeof step.value.result === "string"
                  ? step.value.result
                  : JSON.stringify(step.value.result, null, 2);
              // Truncate very long results
              const truncatedResult =
                resultStr.length > 2000
                  ? resultStr.substring(0, 2000) + "\n... [truncated]"
                  : resultStr;
              lines.push(`Result: ${truncatedResult}`);
            }
            lines.push(`[END TOOL CALL]`);
          } else if (step.type === "error") {
            lines.push(`[ERROR: ${JSON.stringify(step.value)}]`);
          }
        }

        if (msg.errorCode || msg.errorMessage) {
          lines.push(`[AGENT ERROR: ${msg.errorCode} - ${msg.errorMessage}]`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function formatFeedbackForEvaluation(feedbacks: FeedbackInput[]): string {
  if (feedbacks.length === 0) {
    return "No feedback provided for this conversation.";
  }

  return feedbacks
    .map((f) => {
      const direction =
        f.thumbDirection === "up" ? "Thumbs Up" : "Thumbs Down";
      const userName = f.userName ?? f.userEmail ?? "Anonymous";
      const comment = f.feedbackContent
        ? `\n   Comment: "${f.feedbackContent}"`
        : "";
      return `- Message: ${f.messageSId}\n   User: ${userName}\n   Feedback: ${direction}${comment}`;
    })
    .join("\n\n");
}

function buildEvaluationPrompt(
  promptTemplate: string,
  agentPrompt: string,
  conversationText: string,
  feedbackText: string
): string {
  // The template expects sections to be injected after the markers
  // We'll replace the placeholder sections with actual content

  let result = promptTemplate;

  // Replace the AGENT PROMPT section
  result = result.replace(
    /-----------\nAGENT PROMPT\n-----------\n\[actual agent prompt\]/,
    `-----------\nAGENT PROMPT\n-----------\n${agentPrompt}`
  );

  // Replace the CONVERSATION section
  result = result.replace(
    /-----------\nCONVERSATION\n-----------\n\[Actual conversation\]/,
    `-----------\nCONVERSATION\n-----------\n${conversationText}`
  );

  // Replace the FEEDBACK section
  result = result.replace(
    /-----------\nFEEDBACK\n-----------\n\[Actual feedback\]/,
    `-----------\nFEEDBACK\n-----------\n${feedbackText}`
  );

  return result;
}

function parseEvaluationResponse(text: string): EvaluationResponse {
  // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
  let jsonStr = text;

  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as unknown;

  // Validate the structure
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Response is not an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.result !== "Yes" && obj.result !== "No") {
    throw new Error(
      `Invalid result field: expected "Yes" or "No", got "${obj.result}"`
    );
  }

  if (typeof obj.summary !== "string") {
    throw new Error(
      `Invalid summary field: expected string, got ${typeof obj.summary}`
    );
  }

  if (typeof obj.suggestion !== "string") {
    throw new Error(
      `Invalid suggestion field: expected string, got ${typeof obj.suggestion}`
    );
  }

  return {
    result: obj.result,
    summary: obj.summary,
    suggestion: obj.suggestion,
  };
}

const MAX_RETRIES = 3;

async function callEvaluator(
  anthropic: Anthropic,
  prompt: string,
  modelId: string
): Promise<{ evaluation: EvaluationResponse | null; error?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: modelId,
        max_tokens: 4096,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        lastError = "No text content in response";
        continue;
      }

      // Parse and validate the JSON response
      const evaluation = parseEvaluationResponse(textBlock.text);

      return { evaluation };
    } catch (error) {
      lastError = `Attempt ${attempt}/${MAX_RETRIES}: ${error instanceof Error ? error.message : String(error)}`;
      if (attempt < MAX_RETRIES) {
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  return {
    evaluation: null,
    error: lastError,
  };
}

export interface EvaluateAgentConversationsParams {
  workspaceId: string;
  agentName: string;
  evaluatorModel: string;
  limit: number;
  execute: boolean;
}

export async function runEvaluateAgentConversations(
  params: EvaluateAgentConversationsParams,
  logger: Logger
): Promise<void> {
  const { workspaceId, agentName, evaluatorModel, limit, execute } = params;
  const scriptDir = __dirname;
  const runsDir = ensureRunsDir(workspaceId, agentName);

  // Create Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.DUST_MANAGED_ANTHROPIC_API_KEY,
  });

  // Load the evaluator prompt template
  const templatePath = path.join(scriptDir, PROMPT_TEMPLATES.EVALUATOR);
  const promptTemplate = fs.readFileSync(templatePath, "utf-8");

  // Load agent prompt from JSON file (it's an array with one element)
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

  // Load conversations from JSON file
  const conversationsPath = path.join(runsDir, DATA_FILES.CONVERSATIONS);
  const conversationsJson = fs.readFileSync(conversationsPath, "utf-8");
  const allMessages: RawMessageInput[] = JSON.parse(conversationsJson);

  if (!allMessages || allMessages.length === 0) {
    throw new Error(
      `No conversations found in ${conversationsPath}. Ensure the SQL query returned results.`
    );
  }

  // Group messages by conversation
  const messagesByConversation = new Map<string, RawMessageInput[]>();
  for (const msg of allMessages) {
    const existing = messagesByConversation.get(msg.conversationSId) ?? [];
    existing.push(msg);
    messagesByConversation.set(msg.conversationSId, existing);
  }

  // Load feedback from JSON file
  const feedbackPath = path.join(runsDir, DATA_FILES.FEEDBACK);
  const feedbackJson = fs.readFileSync(feedbackPath, "utf-8");
  const allFeedback: FeedbackInput[] = JSON.parse(feedbackJson);

  // Group feedback by conversation sId
  const feedbackByConversation = new Map<string, FeedbackInput[]>();
  if (allFeedback) {
    for (const fb of allFeedback) {
      const existing = feedbackByConversation.get(fb.conversationSId) ?? [];
      existing.push(fb);
      feedbackByConversation.set(fb.conversationSId, existing);
    }
  }

  const allConversationIds = Array.from(messagesByConversation.keys());
  const conversationIds =
    limit > 0 ? allConversationIds.slice(0, limit) : allConversationIds;

  logger.info(
    {
      workspaceId,
      agentName,
      evaluatorModel,
      agentSId: agentPromptData.agentSId,
      numConversations: conversationIds.length,
      totalConversations: allConversationIds.length,
      numFeedbackEntries: allFeedback?.length || 0,
      limit: limit > 0 ? limit : "none",
    },
    "Starting evaluation"
  );

  const results: EvaluationResult[] = [];
  let totalAnalyzed = 0;
  const outputPath = path.join(runsDir, DATA_FILES.EVALUATION);

  // Helper function to write results to file
  const writeResults = () => {
    const outputData = {
      metadata: {
        evaluatorModel,
        agentSId: agentPromptData.agentSId,
        agentName: agentPromptData.agentName,
        numConversations: conversationIds.length,
        timestamp: new Date().toISOString(),
        execute,
      },
      results,
    };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  };

  for (const conversationId of conversationIds) {
    const messages = messagesByConversation.get(conversationId) ?? [];
    const feedbacks = feedbackByConversation.get(conversationId) ?? [];

    logger.info(
      {
        conversationId,
        messageCount: messages.length,
        feedbackCount: feedbacks.length,
      },
      "Processing conversation"
    );

    // Format conversation and feedback
    const conversationText = formatConversationForEvaluation(messages);
    const feedbackText = formatFeedbackForEvaluation(feedbacks);

    // Build the full evaluation prompt
    const evaluationPrompt = buildEvaluationPrompt(
      promptTemplate,
      agentPrompt,
      conversationText,
      feedbackText
    );

    if (!execute) {
      logger.info(
        {
          conversationId,
          messageCount: messages.length,
          feedbackCount: feedbacks.length,
          promptLength: evaluationPrompt.length,
        },
        "Would evaluate conversation (dry run)"
      );
      results.push({
        conversationId,
        evaluation: {
          result: "Yes",
          summary: "[DRY RUN - no evaluation performed]",
          suggestion: "",
        },
      });
      continue;
    }

    // Call the evaluator
    const evalResult = await callEvaluator(
      anthropic,
      evaluationPrompt,
      evaluatorModel
    );

    totalAnalyzed++;

    // Skip adding to results if the evaluation result is "Yes"
    if (evalResult.evaluation?.result === "Yes") {
      logger.info(
        { conversationId },
        "Skipping conversation (result is 'Yes')"
      );
      continue;
    }

    const result: EvaluationResult = {
      conversationId,
      evaluation: evalResult.evaluation,
      error: evalResult.error,
    };

    results.push(result);

    // Write results to file after each evaluation
    writeResults();

    // Print to console
    console.log("\n" + "=".repeat(80));
    console.log(`Conversation: ${conversationId}`);
    console.log("=".repeat(80));
    if (evalResult.error) {
      console.log(`Error: ${evalResult.error}`);
    } else if (evalResult.evaluation) {
      console.log(`Result: ${evalResult.evaluation.result}`);
      console.log(`Summary: ${evalResult.evaluation.summary}`);
      if (evalResult.evaluation.suggestion) {
        console.log(`Suggestion:\n${evalResult.evaluation.suggestion}`);
      }
    }
  }

  // Final write to ensure all results are saved
  writeResults();
  logger.info({ outputFile: outputPath }, "Results written to file");

  // Summary
  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.filter((r) => r.error).length;

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total conversations analysed: ${totalAnalyzed}`);
  console.log(`Conversations with issues: ${results.length}`);
  console.log(`Successful evaluations: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
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
      evaluatorModel: {
        type: "string",
        default: "claude-sonnet-4-20250514",
        description: "Model ID to use for evaluation",
      },
      limit: {
        type: "number",
        default: 0,
        description:
          "Limit the number of conversations to evaluate (0 = no limit)",
      },
    },
    async ({ workspaceId, agentName, evaluatorModel, limit, execute }, logger) => {
      await runEvaluateAgentConversations(
        { workspaceId, agentName, evaluatorModel, limit, execute },
        logger
      );
    }
  );
}
