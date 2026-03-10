import type { TestSuite } from "../lib/types";
import {
  MINIMAL_INSTRUCTIONS_AGENT,
  SPARSE_INSTRUCTIONS_AGENT,
} from "../shared-mock-states/index";

export const minimalInstructionsSuite: TestSuite = {
  name: "minimal-instructions",
  description: "Improving agents with basic/incomplete instructions",
  testCases: [
    {
      scenarioId: "make-it-better",
      userMessage: "Make it better",
      mockState: MINIMAL_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is vague ("make it better"). Per new workflow: do NOT suggest until intent is clear. Should ask clarifying questions about purpose, audience, use case. Score 0-1 if sidekick suggests without clarifying.`,
    },
    {
      scenarioId: "improve-basic",
      userMessage: "Can you improve the instructions? They feel too basic.",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: improve basic instructions. Must call suggest_prompt_edits to expand (role, guidelines, examples, escalation). Score 0-1 if no suggestion or expansion is trivial.`,
    },
    {
      scenarioId: "add-doc-search",
      userMessage:
        "Add the ability to search our documentation to help answer questions",
      mockState: MINIMAL_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Intent is clear: add doc search. Should suggest knowledge/tool and/or suggest_prompt_edits for doc usage. Should NOT rewrite entire instructions. Per new workflow may ask one question. Score 0-1 if rewrites everything or ignores request.`,
    },
    {
      scenarioId: "add-jira-tickets",
      userMessage:
        "I want it to be able to create Jira tickets when users report bugs",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config"],
      judgeCriteria: `Should address the Jira integration request. If Jira tool is unavailable, should acknowledge this and suggest alternatives or add bug-reporting workflow instructions. Should keep existing instructions intact.`,
    },
    {
      scenarioId: "tone-formal",
      userMessage: "Make it more formal and professional",
      mockState: MINIMAL_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: formal tone. Must call suggest_prompt_edits (tone section, professional language). Should NOT change core functionality. Score 0-1 if no suggestion.`,
    },
    {
      scenarioId: "tone-friendly",
      userMessage:
        "The responses are too dry. Can you make it sound more friendly and conversational?",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: friendly tone. Must call suggest_prompt_edits (tone section, conversational). Maintain existing "polite"; don't change core purpose. Score 0-1 if no suggestion.`,
    },
    {
      scenarioId: "add-cite-sources-constraint",
      userMessage:
        "Add a constraint to the instructions: the agent must always cite its sources when giving answers.",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: add citation constraint. Must call suggest_prompt_edits adding a clear constraint (cite sources). Should NOT rewrite entire instructions. Score 0-1 if no suggestion or constraint is vague.`,
    },
    {
      scenarioId: "add-error-handling-section",
      userMessage:
        "Add a short section to the instructions about what the agent should do when an error occurs or something goes wrong.",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_config", "suggest_prompt_edits"],
      judgeCriteria: `Intent is clear: add error-handling guidance. Must call suggest_prompt_edits with a section on errors (e.g. acknowledge, retry, escalate). Should NOT rewrite unrelated parts. Score 0-1 if no suggestion.`,
    },
  ],
};
