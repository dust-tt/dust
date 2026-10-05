import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

const FINANCE_AGENT_KEY = "finance-helper";

// Unrelated skills, so the run must create the requested skill instead of reusing one.
const UNRELATED_SKILLS: WorkspaceSeed["skills"] = [
  {
    key: "release-notes",
    name: "Release Notes Writer",
    agentFacingDescription:
      "Use when turning a list of merged pull requests into customer-facing release notes.",
    instructions: [
      "# Release Notes Writer",
      "",
      "Group changes into Features, Improvements and Fixes. One bullet per change.",
    ].join("\n"),
  },
  {
    key: "meeting-recap",
    name: "Meeting Recap",
    agentFacingDescription:
      "Use when summarizing a meeting transcript into decisions and action items.",
    instructions: [
      "# Meeting Recap",
      "",
      "List decisions first, then action items with an owner and a due date.",
    ].join("\n"),
  },
];

const WORKSPACE_WITH_UNRELATED_SKILLS: WorkspaceSeed = {
  skills: UNRELATED_SKILLS,
};

const WORKSPACE_WITH_FINANCE_AGENT: WorkspaceSeed = {
  skills: UNRELATED_SKILLS,
  agents: [
    {
      key: FINANCE_AGENT_KEY,
      name: "FinanceHelper",
      description: "Answers Acme employees' questions about finance processes.",
      instructionsHtml:
        `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
        '<h2 data-block-id="fina0001">Role</h2>' +
        '<p data-block-id="fina0002">You answer Acme employees\' questions about invoices, purchase orders and budgets. Point them to the finance team for anything you cannot answer.</p>' +
        "</div>",
    },
  ],
};

export const agentSkillRefsSuite: TestSuite = {
  name: "agent-skill-refs",
  description:
    "The user asks, in conversation, for a new skill to be created and given to an agent.",
  testCases: [
    {
      scenarioId: "legal-desk-nda-review",
      workspaceSeed: WORKSPACE_WITH_UNRELATED_SKILLS,
      userMessage:
        "Create a skill called NDA Review that checks an NDA for these points: the obligations " +
        "must be mutual, the term must be at most 3 years, the governing law must be French " +
        "law, and any non-solicitation clause must be flagged. Then create a LegalDesk agent " +
        "for the legal team that answers contract questions and uses that skill whenever " +
        "someone shares an NDA. Go ahead and set it all up.",
      expectedFinalToolCall: { type: "suggestAgentSkillByRef" },
      judgeCriteria: `
- The run must create a skill named "NDA Review" and an agent named "LegalDesk" (no leading
  '@'), and give the skill to the agent in the same suggestion call.
- The skill instructions must cover the four checks: mutual obligations, a term of at most 3
  years, French governing law, and a flag on any non-solicitation clause.
- The agent instructions must say to use the skill when someone shares an NDA.
- Score 0-1 if the run reuses Release Notes Writer or Meeting Recap, creates the skill and the
  agent without giving the skill to the agent, or asks a clarifying question after the user
  explicitly said to go ahead.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "finance-expense-policy",
      workspaceSeed: WORKSPACE_WITH_FINANCE_AGENT,
      userMessage:
        "Create a skill called Expense Policy Check that reviews an expense report against our " +
        "policy: a receipt is required above 50 euros, alcohol is never reimbursed, hotels are " +
        "capped at 180 euros per night in Paris, and anything submitted more than 60 days " +
        "after the expense must be flagged. Add it to FinanceHelper. Go ahead.",
      expectedFinalToolCall: {
        type: "suggestAgentSkillByRef",
        agentKey: FINANCE_AGENT_KEY,
      },
      judgeCriteria: `
- The run must create a skill named "Expense Policy Check" and add it to the existing
  FinanceHelper agent in the same suggestion call, without creating a new agent.
- The skill instructions must cover the four rules: a receipt above 50 euros, no alcohol, a 180
  euros per night hotel cap in Paris, and a flag on submissions more than 60 days late.
- If FinanceHelper's instructions are edited, the edit must only say when to use the skill and
  must keep its current role.
- Score 0-1 if the run reuses Release Notes Writer or Meeting Recap, creates the skill without
  adding it to FinanceHelper, or asks a clarifying question after the user explicitly said to
  go ahead.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
