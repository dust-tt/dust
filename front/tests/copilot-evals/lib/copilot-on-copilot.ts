import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { executeCopilot } from "@app/tests/copilot-evals/lib/copilot-executor";
import type {
  CopilotConfig,
  EvalResult,
  MockAgentState,
} from "@app/tests/copilot-evals/lib/types";

const MAX_SCENARIOS = 10;

const ANALYSIS_PROMPT = `I've been running evaluations on the Agent Builder Copilot and some test scenarios are failing. I need your help analyzing the failures and suggesting improvements to the copilot's system instructions.

## Current Copilot Instructions

{{CURRENT_INSTRUCTIONS}}

## Failed Test Scenarios

The following scenarios received low scores from the judge:

{{FAILED_SCENARIOS}}

Based on the failure patterns above, please analyze the issues and suggest specific improvements to the copilot's instructions. Focus on:

1. **Patterns in failures** - What common issues do you see across the failed scenarios?
2. **Missing guidance** - What instructions are missing that would have helped?
3. **Unclear directives** - What existing instructions might be ambiguous or misleading?
4. **Specific additions** - Provide concrete instruction text to add or modify.

Be specific and actionable. Provide exact text that could be added to the instructions.`;

interface FailedScenario {
  scenarioId: string;
  userMessage: string;
  copilotResponse: string;
  judgeReasoning: string;
  score: number;
}

export interface CopilotOnCopilotReport {
  failedScenarios: FailedScenario[];
  suggestion: string | null;
  error?: string;
}

function formatScenario(scenario: FailedScenario, index: number): string {
  return `### Scenario ${index + 1}: ${scenario.scenarioId}
**User message:** ${scenario.userMessage}
**Copilot response:** ${scenario.copilotResponse}
**Judge reasoning:** ${scenario.judgeReasoning}
**Score:** ${scenario.score}/3`;
}

function createCopilotSelfState(config: CopilotConfig): MockAgentState {
  return {
    name: "Agent Builder Copilot",
    description: "The copilot that helps users build and improve agents",
    instructions: config.instructions,
    model: {
      modelId: config.model.modelId,
      temperature: config.model.temperature,
      reasoningEffort: config.model.reasoningEffort,
    },
    tools: config.tools.map((t) => ({
      sId: t.name,
      name: t.name,
      description: t.description,
    })),
    skills: [],
  };
}

export async function generateCopilotImprovementSuggestions(
  auth: Authenticator,
  copilotConfig: CopilotConfig,
  results: EvalResult[]
): Promise<CopilotOnCopilotReport> {
  const failedResults = results.filter((r) => !r.passed);

  if (failedResults.length === 0) {
    return { failedScenarios: [], suggestion: null };
  }

  logger.info(
    {},
    `[copilot-on-copilot] Analyzing ${failedResults.length} failed scenario(s)...`
  );

  const failedScenarios = failedResults.map((r) => ({
    scenarioId: r.testCase.scenarioId,
    userMessage: r.testCase.userMessage,
    copilotResponse: r.responseText,
    judgeReasoning: r.judgeResult.reasoning,
    score: r.judgeResult.finalScore,
  }));

  const scenariosToAnalyze = failedScenarios.slice(0, MAX_SCENARIOS);
  const remaining = failedScenarios.length - scenariosToAnalyze.length;

  let scenariosText = scenariosToAnalyze
    .map((s, i) => formatScenario(s, i))
    .join("\n\n");
  if (remaining > 0) {
    scenariosText += `\n\n(${remaining} additional failed scenarios not shown)`;
  }

  const instructions = copilotConfig.instructions;
  const truncatedInstructions =
    instructions.length > 4000
      ? instructions.substring(0, 4000) + "\n...(truncated)"
      : instructions;

  const userMessage = ANALYSIS_PROMPT.replace(
    "{{CURRENT_INSTRUCTIONS}}",
    truncatedInstructions
  ).replace("{{FAILED_SCENARIOS}}", scenariosText);

  try {
    const { responseText } = await executeCopilot(
      auth,
      copilotConfig,
      userMessage,
      createCopilotSelfState(copilotConfig)
    );

    logger.info({}, "[copilot-on-copilot] Analysis complete");
    logger.info({}, "-".repeat(60));
    logger.info({}, responseText);
    logger.info({}, "-".repeat(60));

    return { failedScenarios, suggestion: responseText };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error }, `[copilot-on-copilot] Analysis failed: ${msg}`);
    return { failedScenarios, suggestion: null, error: msg };
  }
}
