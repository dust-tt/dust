import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

const RELEASE_NOTES_AGENT_KEY = "release-notes-agent";
const MEETING_RECAP_AGENT_KEY = "meeting-recap-agent";

const WORKSPACE: WorkspaceSeed = {
  skills: [],
  agents: [
    {
      key: RELEASE_NOTES_AGENT_KEY,
      name: "ReleaseNotesWriter",
      description:
        "Turns a list of merged pull requests into customer-facing release notes.",
      instructionsHtml:
        `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
        `<p data-block-id="rele0001">Group changes into Features, Improvements and Fixes. One bullet per change.</p>` +
        "</div>",
    },
    {
      key: MEETING_RECAP_AGENT_KEY,
      name: "MeetingRecap",
      description:
        "Summarizes a meeting transcript into decisions and action items.",
      instructionsHtml:
        `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
        `<p data-block-id="meet0001">List decisions first, then action items with an owner and a due date.</p>` +
        "</div>",
    },
  ],
};

export const agentManagementSuite: TestSuite = {
  name: "agent-management",
  description: "The user asks to delete or archive an agent.",
  testCases: [
    {
      scenarioId: "delete-agent",
      workspaceSeed: WORKSPACE,
      userMessage:
        "We don't do meeting recaps with Dust anymore, please delete the MeetingRecap agent.",
      expectedFinalToolCall: {
        type: "suggestAgentDeletion",
        agentKey: MEETING_RECAP_AGENT_KEY,
      },
      judgeCriteria: `
- The suggestion must propose deleting "MeetingRecap" and nothing else.
- Score 0-1 if "ReleaseNotesWriter" is targeted, or if the agent edited the agent instead of
  proposing its deletion.
- The closing message must say the deletion is a suggestion for the editors to review, not that
  the agent is gone, and must surface the recorded suggestion directive.
`.trim(),
    },
    {
      scenarioId: "archive-agent",
      workspaceSeed: WORKSPACE,
      userMessage:
        "Nobody uses the MeetingRecap agent anymore, can you archive it?",
      expectedFinalToolCall: {
        type: "suggestAgentDeletion",
        agentKey: MEETING_RECAP_AGENT_KEY,
      },
      judgeCriteria: `
- "Archive" means the deletion suggestion: it must propose deleting "MeetingRecap" and nothing
  else.
- Score 0-1 if "ReleaseNotesWriter" is targeted, if the agent edited the agent instead of
  proposing its deletion, or if it asked the user what archiving means instead of suggesting it.
- The closing message must say the archival is a suggestion for the editors to review, not that
  the agent is gone, and must surface the recorded suggestion directive.
`.trim(),
    },
  ],
};
