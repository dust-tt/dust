import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

const SUPPORT_REPLY_SKILL_KEY = "support-reply";

const WORKSPACE_WITH_SUPPORT_SKILLS: WorkspaceSeed = {
  skills: [
    {
      key: SUPPORT_REPLY_SKILL_KEY,
      name: "Customer Support Reply",
      agentFacingDescription:
        "Use when drafting a reply to a customer support ticket or email.",
      instructions: [
        "# Customer Support Reply",
        "",
        "Draft replies to customer support requests.",
        "",
        "## Tone",
        "",
        "Be warm, concise and professional. Never blame the customer.",
        "",
        "## Structure",
        "",
        "1. Acknowledge the issue in one sentence.",
        "2. Explain the cause or the next step.",
        "3. Close with an offer to help further.",
        "",
        "## Sign-off",
        "",
        'Sign every reply with "The Acme Support Team".',
      ].join("\n"),
    },
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

export const updateSkillSuite: TestSuite = {
  name: "update-skill",
  description:
    "The user asks, in conversation, for a targeted change to an existing custom skill.",
  testCases: [
    {
      scenarioId: "add-ticket-number-check",
      workspaceSeed: WORKSPACE_WITH_SUPPORT_SKILLS,
      userMessage:
        "Can you update the Customer Support Reply skill? Before drafting anything it should " +
        "check that the ticket number is present in the request, and if it isn't, ask the " +
        "customer for it instead of drafting a reply.",
      expectedFinalToolCall: {
        type: "suggestSkillUpdate",
        skillKey: SUPPORT_REPLY_SKILL_KEY,
        edits: ["instructionEdits"],
      },
      judgeCriteria: `
- The suggested instructions must add a step that checks for a ticket number before drafting, and
  say to ask the customer for it (rather than drafting a reply) when it is missing.
- The Tone, Structure and Sign-off sections must be kept as they are unless the edit targets a
  block that necessarily contains them, in which case their content must be carried over intact.
- Score 0-1 if the suggestion targets any skill other than "Customer Support Reply", or if the
  agent-facing description is rewritten (the user did not ask for it).
- The closing message must surface the recorded suggestion (the tool output) to the user.
`.trim(),
    },
  ],
};
