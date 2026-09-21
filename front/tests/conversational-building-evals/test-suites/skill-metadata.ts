import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

const RELEASE_NOTES_KEY = "release-notes";
const MEETING_RECAP_KEY = "meeting-recap";

const WORKSPACE: WorkspaceSeed = {
  skills: [
    {
      key: RELEASE_NOTES_KEY,
      name: "Release Notes Writer",
      userFacingDescription: "Writes release notes.",
      agentFacingDescription:
        "Use when turning a list of merged pull requests into customer-facing release notes.",
      availability: "editors",
      instructions: [
        "# Release Notes Writer",
        "",
        "Group changes into Features, Improvements and Fixes. One bullet per change.",
      ].join("\n"),
    },
    {
      key: MEETING_RECAP_KEY,
      name: "Meeting Recap",
      userFacingDescription: "Summarizes meetings.",
      agentFacingDescription:
        "Use when summarizing a meeting transcript into decisions and action items.",
      availability: "editors",
      instructions: [
        "# Meeting Recap",
        "",
        "List decisions first, then action items with an owner and a due date.",
      ].join("\n"),
    },
  ],
};

export const skillMetadataSuite: TestSuite = {
  name: "skill-metadata",
  description:
    "The user asks to change a skill's name, availability or user-facing description.",
  testCases: [
    {
      scenarioId: "rename",
      workspaceSeed: WORKSPACE,
      userMessage:
        'Rename the "Release Notes Writer" skill to "Changelog Writer".',
      expectedFinalToolCall: {
        type: "suggestSkillName",
        skillKey: RELEASE_NOTES_KEY,
      },
      judgeCriteria: `
- The suggested name must be exactly "Changelog Writer".
- Score 0-1 if any other change (description, instructions, availability) is suggested, or if
  "Meeting Recap" is targeted.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "publish-to-workspace",
      workspaceSeed: WORKSPACE,
      userMessage:
        "The Meeting Recap skill is ready, make it available to everyone in the workspace so " +
        "people can add it to their agents themselves (but don't let agents pick it on their own).",
      expectedFinalToolCall: {
        type: "suggestSkillAvailability",
        skillKey: MEETING_RECAP_KEY,
        availability: "workspace_users",
      },
      judgeCriteria: `
- The suggested availability must be "workspace_users": members can use it, agents do not
  discover it on their own. "users_and_agents" contradicts the user's explicit request.
- Score 0-1 if "Release Notes Writer" is targeted or if any other change is suggested.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "user-facing-description",
      workspaceSeed: WORKSPACE,
      userMessage:
        "The description people see for the Release Notes Writer skill is too terse. Can you " +
        "make it clearer about what it does and when to use it?",
      expectedFinalToolCall: {
        type: "suggestSkillUserFacingDescription",
        skillKey: RELEASE_NOTES_KEY,
      },
      judgeCriteria: `
- The suggestion must replace the user-facing description (the text members see when browsing
  skills), not the agent-facing description and not the instructions.
- The new description must say what the skill does (turn merged pull requests into
  customer-facing release notes) and when to use it, in one or two clear sentences.
- Score 0-1 if the agent-facing description or the instructions were edited instead, or if
  "Meeting Recap" is targeted.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
