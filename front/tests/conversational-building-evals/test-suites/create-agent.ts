import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

// A couple of unrelated skills so the agent has something to discover and must not confuse an
// agent creation with a skill change.
const WORKSPACE_WITH_UNRELATED_SKILLS: WorkspaceSeed = {
  skills: [
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
  ],
};

export const createAgentSuite: TestSuite = {
  name: "create-agent",
  description:
    "The user asks, in conversation, for a new agent to be created for their team.",
  testCases: [
    {
      scenarioId: "onboarding-buddy",
      workspaceSeed: WORKSPACE_WITH_UNRELATED_SKILLS,
      userMessage:
        "I'd like a new agent called OnboardingBuddy for new hires in the sales team. It should " +
        "answer their questions about our sales process during their first month, always point " +
        "them to their manager for anything about compensation or contracts, and keep a " +
        "friendly, encouraging tone. Please go ahead and create it.",
      expectedFinalToolCall: { type: "suggestAgentCreation" },
      judgeCriteria: `
- The suggested agent must be named "OnboardingBuddy" (no leading '@') with a description that
  says it is for new hires in the sales team.
- The instructions must cover the three explicit requirements: answering sales-process questions
  for new hires, redirecting compensation or contract questions to the manager, and a friendly,
  encouraging tone.
- The instructions must not reference tools, skills or knowledge sources the agent did not
  verify exist in the workspace (the workspace has no relevant ones).
- Score 0-1 if the agent suggested a skill change instead of an agent creation, or asked a
  clarifying question instead of creating the agent after the user explicitly said to go ahead.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
