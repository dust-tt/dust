import type { TestSuite } from "../lib/types";
import { PRODUCTION_AGENT } from "../shared-mock-states/index";

export const instructionsWithFeedbackSuite: TestSuite = {
  name: "with-feedback",
  description: "Production agents with user feedback data",
  testCases: [
    {
      scenarioId: "performance-overview",
      userMessage: "How's my agent doing?",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Should provide concise summary using pre-injected feedback and insights data: usage stats, feedback ratio, key themes.
Should highlight both strengths and areas for improvement.
Score 0-1 if copilot ignores the pre-injected data.`,
    },
    {
      scenarioId: "performance-detailed",
      userMessage: "Give me an overview of how this agent is performing",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Should present balanced report using pre-injected data: engagement metrics, satisfaction, feedback themes.
Should identify patterns ("Users appreciate X but struggle with Y").
Should suggest next steps based on data.`,
    },
    {
      scenarioId: "diagnose-unhappy-users",
      userMessage: "Why are users unhappy with this agent? Fix it.",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should analyze pre-injected feedback and IMMEDIATELY suggest fixes - not ask permission first.
Must cite specific feedback patterns and propose targeted instruction changes.
Score 0-1 if copilot only diagnoses without suggesting fixes, or asks "want me to...".`,
    },
    {
      scenarioId: "fix-complaints",
      userMessage: "Users keep complaining. What's wrong and how do we fix it?",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should identify specific issues from pre-injected feedback (tone, context missing).
For each issue, should suggest a targeted fix.
Should NOT suggest unrelated improvements.`,
    },
    {
      scenarioId: "session-start-proactive",
      userMessage: "I'm back to work on my agent. What should I focus on?",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Should check for pending suggestions and surface them.
If none, should offer to analyze feedback or review performance.
Should provide clear starting point for the session.`,
    },
  ],
};
