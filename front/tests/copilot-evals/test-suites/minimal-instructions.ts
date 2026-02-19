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
      expectedToolCalls: ["get_agent_info"],
      judgeCriteria: `Should recognize minimal instructions and expand significantly (3-5x longer). It should ask clarifying questions to understand the user's intent. Given this is an extremely broad ask, provisional recommendations are not required. Score 0-1 if trivial instruction changes are made.`,
    },
    {
      scenarioId: "improve-basic",
      userMessage: "Can you improve the instructions? They feel too basic.",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should expand while keeping core intent (customer support, polite, honest about limitations).
Must add: clear role definition, structured guidelines, examples, escalation procedures, formatting guidelines.`,
    },
    {
      scenarioId: "add-doc-search",
      userMessage:
        "Add the ability to search our documentation to help answer questions",
      mockState: MINIMAL_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should add TARGETED section about documentation usage (when to search, how to cite, fallback behavior).
Should NOT rewrite entire instructions - add to existing.
May suggest adding a documentation tool.
Score 0-1 if copilot rewrites everything.`,
    },
    {
      scenarioId: "add-jira-tickets",
      userMessage:
        "I want it to be able to create Jira tickets when users report bugs",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should add specific bug reporting workflow (when to create ticket, info to collect, format, confirmation flow). Should keep existing instructions intact - add new section.`,
    },
    {
      scenarioId: "tone-formal",
      userMessage: "Make it more formal and professional",
      mockState: MINIMAL_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should add tone guidelines section: professional language patterns, formal greetings, words to use/avoid.
Should NOT change core functionality.
May provide before/after examples.`,
    },
    {
      scenarioId: "tone-friendly",
      userMessage:
        "The responses are too dry. Can you make it sound more friendly and conversational?",
      mockState: SPARSE_INSTRUCTIONS_AGENT,
      expectedToolCalls: ["get_agent_info", "suggest_prompt_edits"],
      judgeCriteria: `Should add/modify tone section: conversational language, contractions, warmth guidelines.
Should maintain existing "polite" directive but expand on it.
Should NOT change agent's core purpose.`,
    },
  ],
};
