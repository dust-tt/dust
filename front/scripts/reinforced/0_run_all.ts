import { makeScript } from "@app/scripts/helpers";

import { runEvaluateAgentConversations } from "./2_evaluate_agent_conversations";
import { runSuggestPromptEdits } from "./3_suggest_prompt_edits";

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
    suggestionModel: {
      type: "string",
      default: "claude-sonnet-4-20250514",
      description: "Model ID to use for generating suggestions",
    },
    limit: {
      type: "number",
      default: 0,
      description:
        "Limit the number of conversations to evaluate (0 = no limit)",
    },
  },
  async (
    {
      workspaceId,
      agentName,
      evaluatorModel,
      suggestionModel,
      limit,
      execute,
    },
    logger
  ) => {
    logger.info(
      {
        workspaceId,
        agentName,
        evaluatorModel,
        suggestionModel,
        limit,
        execute,
      },
      "Starting full pipeline"
    );

    // Step 1: Run evaluation
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: EVALUATE AGENT CONVERSATIONS");
    console.log("=".repeat(80));

    await runEvaluateAgentConversations(
      {
        workspaceId,
        agentName,
        evaluatorModel,
        limit,
        execute,
      },
      logger
    );

    // Step 2: Run suggestion generation
    console.log("\n" + "=".repeat(80));
    console.log("STEP 3: SUGGEST PROMPT EDITS");
    console.log("=".repeat(80));

    await runSuggestPromptEdits(
      {
        workspaceId,
        agentName,
        suggestionModel,
        execute,
      },
      logger
    );

    console.log("\n" + "=".repeat(80));
    console.log("PIPELINE COMPLETE");
    console.log("=".repeat(80));
    console.log(`Results saved to: scripts/reinforced/runs/${workspaceId}/${agentName}/`);
  }
);
