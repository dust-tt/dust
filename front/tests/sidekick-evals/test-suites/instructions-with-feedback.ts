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
      expectedToolCalls: [
        "get_agent_config",
        "get_agent_insights",
        "get_agent_feedback",
      ],
      judgeCriteria: `Intent is clear: performance summary. Must call get_agent_insights and get_agent_feedback to answer. Should summarize usage, feedback ratio, themes. Score 0-1 if skips insights or feedback.`,
    },
    {
      scenarioId: "performance-detailed",
      userMessage: "Give me an overview of how this agent is performing",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: [
        "get_agent_config",
        "get_agent_insights",
        "get_agent_feedback",
      ],
      judgeCriteria: `Intent is clear: performance report. Must use insights and feedback. Present metrics, patterns, next steps. Score 0-1 if missing data or no actionable summary.`,
    },
    {
      scenarioId: "diagnose-unhappy-users",
      userMessage: "Why are users unhappy with this agent? Fix it.",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: [
        "get_agent_config",
        "get_agent_feedback",
        "suggest_prompt_edits",
      ],
      judgeCriteria: `Intent is clear: diagnose and fix. Must call get_agent_feedback then suggest_prompt_edits (cite feedback). Score 0-1 if only diagnoses without suggesting fixes.`,
    },
    {
      scenarioId: "fix-complaints",
      userMessage: "Users keep complaining. What's wrong and how do we fix it?",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: [
        "get_agent_config",
        "get_agent_feedback",
        "suggest_prompt_edits",
      ],
      judgeCriteria: `Intent is clear: what's wrong + fix. Must call get_agent_feedback then suggest_prompt_edits. Should NOT suggest unrelated improvements. Score 0-1 if no fixes suggested.`,
    },
    {
      scenarioId: "session-start-proactive",
      userMessage: "I'm back to work on my agent. What should I focus on?",
      mockState: PRODUCTION_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should check for pending suggestions and surface them.
If none, should offer to analyze feedback or review performance.
Should provide clear starting point for the session.`,
    },
  ],
};
