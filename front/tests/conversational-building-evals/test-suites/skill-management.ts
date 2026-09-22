import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

const RELEASE_NOTES_KEY = "release-notes";
const MEETING_RECAP_KEY = "meeting-recap";
const ALFRED_KEY = "alfred";

const WORKSPACE: WorkspaceSeed = {
  members: [{ key: ALFRED_KEY, firstName: "Alfred", lastName: "Pennyworth" }],
  skills: [
    {
      key: RELEASE_NOTES_KEY,
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
      key: MEETING_RECAP_KEY,
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

export const skillManagementSuite: TestSuite = {
  name: "skill-management",
  description:
    "The user asks to change who can edit a skill, or to delete a skill.",
  testCases: [
    {
      scenarioId: "add-editor",
      workspaceSeed: WORKSPACE,
      userMessage:
        "Please add Alfred as an editor of the Release Notes Writer skill.",
      expectedFinalToolCall: {
        type: "suggestSkillEditors",
        skillKey: RELEASE_NOTES_KEY,
        addMemberKeys: [ALFRED_KEY],
      },
      judgeCriteria: `
- The suggestion must add exactly the workspace member named Alfred (looked up by id through the
  members tool, not guessed) as an editor of "Release Notes Writer", and must not remove anyone.
- Score 0-1 if the suggestion targets "Meeting Recap", removes an editor, or if the agent
  invented a user id instead of resolving Alfred through the workspace members.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "delete-skill",
      workspaceSeed: WORKSPACE,
      userMessage:
        "We don't do meeting recaps with Dust anymore, please delete the Meeting Recap skill.",
      expectedFinalToolCall: {
        type: "suggestSkillDeletion",
        skillKey: MEETING_RECAP_KEY,
      },
      judgeCriteria: `
- The suggestion must propose deleting "Meeting Recap" and nothing else.
- Score 0-1 if "Release Notes Writer" is targeted, or if the agent edited the skill instead of
  proposing its deletion.
- The closing message must say the deletion is a suggestion for the editors to review, not that
  the skill is gone, and must surface the recorded suggestion directive.
`.trim(),
    },
  ],
};
