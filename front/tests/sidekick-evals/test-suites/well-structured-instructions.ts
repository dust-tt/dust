import type { TestSuite } from "../lib/types";
import {
  AGENT_WITH_GREETING,
  WELL_STRUCTURED_AGENT,
} from "../shared-mock-states/index";

export const wellStructuredInstructionsSuite: TestSuite = {
  name: "well-structured",
  description: "Targeted edits to comprehensive, well-organized instructions",
  testCases: [
    {
      scenarioId: "vague-improve-this",
      userMessage: "Can you help me improve this?",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is vague ("improve this"). Instructions are already well-structured. Per new workflow should ask what specific aspect to improve, OR identify 1-2 minor improvements. Should NOT suggest full rewrite. Score 0-1 if copilot suggests rewriting everything.`,
    },
    {
      scenarioId: "vague-make-better",
      userMessage: "Make it better",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is vague ("make it better"). Per new workflow should ask what "better" means. Should NOT rewrite well-organized instructions. May suggest complementary tools/skills. Score 0-1 if rewrites without asking.`,
    },
    {
      scenarioId: "edit-greeting-casual",
      userMessage: "Change the greeting to be more casual",
      mockState: AGENT_WITH_GREETING,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: casual greeting. Must call suggest_prompt_edits for greeting only (1-3 lines). Should NOT rewrite other sections. Score 0-1 if rewrites unrelated sections.`,
    },
    {
      scenarioId: "edit-add-followup-step",
      userMessage:
        "In the response format section, add a step to ask follow-up questions before providing detailed answers",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: add step to response_format. Must call suggest_prompt_edits (scoped to that section, keep list format). Score 0-1 if touches other sections or no suggestion.`,
    },
    {
      scenarioId: "multi-three-changes",
      userMessage:
        "I want to add error handling, change the tone to be more casual, and add a section about when to escalate to humans",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: 3 changes. Must call suggest_prompt_edits (multiple or one at a time). Each suggestion scoped. Score 0-1 if one massive edit or no suggestion.`,
    },
    {
      scenarioId: "multi-two-sections",
      userMessage:
        "Update the constraints section to be stricter, and also add some example responses to the response format section",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: two sections. Must call suggest_prompt_edits for stricter constraints and for example responses (separate or sequential). Score 0-1 if no suggestion or wrong scope.`,
    },
    {
      scenarioId: "fix-from-feedback",
      userMessage:
        "Users have been complaining. Can you look at the feedback and suggest improvements?",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: [
        "get_agent_config",
        "get_agent_feedback",
        "suggest_prompt_edits",
      ],
      judgeCriteria: `Intent is clear: feedback → fixes. Must call get_agent_feedback then suggest_prompt_edits addressing feedback themes. Cite feedback in explanation. Score 0-1 if no feedback call or no fixes suggested.`,
    },
    {
      scenarioId: "conflict-verbose-vs-concise",
      userMessage:
        "Add instructions to always provide comprehensive, detailed responses with lots of context",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should notice conflict: existing tone says "Be concise" vs requested "comprehensive, detailed".
Must surface the conflict and ask for clarification.
Should NOT silently override existing instructions.
Score 0-1 if copilot ignores the contradiction.`,
    },
    {
      scenarioId: "conflict-never-admit-unknown",
      userMessage:
        "The agent should never admit when it doesn't know something - always provide an answer",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should identify conflict with existing guidelines about honesty and constraints about not making things up.
Should flag as problematic (hallucination risk) and ask clarifying questions.
Should NOT blindly implement instructions that contradict best practices.`,
    },
  ],
};
