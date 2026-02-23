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
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Instructions are already well-structured. Should either:
a) Ask what specific aspect to improve, OR
b) Identify 1-2 minor incremental improvements (not overhauls).
Should acknowledge instructions are comprehensive.
Score 0-1 if copilot suggests rewriting everything.`,
    },
    {
      scenarioId: "vague-make-better",
      userMessage: "Make it better",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Should recognize well-organized instructions and ask clarifying questions about what "better" means.
Should NOT default to rewriting good instructions.
May suggest tools/skills that complement existing instructions.`,
    },
    {
      scenarioId: "edit-greeting-casual",
      userMessage: "Change the greeting to be more casual",
      mockState: AGENT_WITH_GREETING,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should make SMALL, TARGETED edit to greeting section only (1-3 lines).
Should NOT rewrite sections beyond the greeting.
Score 0-1 if copilot rewrites unrelated sections.`,
    },
    {
      scenarioId: "edit-add-followup-step",
      userMessage:
        "In the response format section, add a step to ask follow-up questions before providing detailed answers",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should make precise, scoped edit to response_format section only (2-4 lines).
Should maintain existing numbered list format.
Should NOT touch other sections.`,
    },
    {
      scenarioId: "multi-three-changes",
      userMessage:
        "I want to add error handling, change the tone to be more casual, and add a section about when to escalate to humans",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Multi-part request (3 changes). Should either:
a) Create multiple suggest_prompt_edits calls, OR
b) Explain addressing one at a time.
Each suggestion should be self-contained and labeled.
Should NOT bundle all into one massive edit.`,
    },
    {
      scenarioId: "multi-two-sections",
      userMessage:
        "Update the constraints section to be stricter, and also add some example responses to the response format section",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Two separate sections need changes. Should create separate suggestions for:
a) Stricter constraints with specific new rules
b) Example responses in format section
Each edit should be scoped to its section.`,
    },
    {
      scenarioId: "fix-from-feedback",
      userMessage:
        "Users have been complaining. Can you look at the feedback and suggest improvements?",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: [
        "get_agent_info",
        "get_agent_feedback",
        "suggest_prompt_edits",
      ],
      judgeCriteria: `Should call get_agent_feedback and generate fixes that address specific feedback themes.
Must cite feedback in explanations ("Based on feedback about...").
Should NOT make changes unrelated to the feedback.`,
    },
    {
      scenarioId: "conflict-verbose-vs-concise",
      userMessage:
        "Add instructions to always provide comprehensive, detailed responses with lots of context",
      mockState: WELL_STRUCTURED_AGENT,
      expectedToolCalls: ["get_agent_info"],
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
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Should identify conflict with existing guidelines about honesty and constraints about not making things up.
Should flag as problematic (hallucination risk) and ask clarifying questions.
Should NOT blindly implement instructions that contradict best practices.`,
    },
  ],
};
