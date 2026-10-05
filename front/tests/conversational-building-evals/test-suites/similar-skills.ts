import { TOOL } from "@app/tests/conversational-building-evals/lib/tool-runner";
import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

const GITHUB_ISSUES_SKILL_KEY = "github-issues";

const WORKSPACE_WITH_GITHUB_ISSUES_SKILL: WorkspaceSeed = {
  skills: [
    {
      key: GITHUB_ISSUES_SKILL_KEY,
      name: "GitHub Issue Creator",
      agentFacingDescription:
        "Use when the user wants to report a bug or a feature request as a GitHub issue.",
      instructions: [
        "# GitHub Issue Creator",
        "",
        "Turn the user's report into a GitHub issue: a short title, the steps to reproduce, the " +
          "expected and actual behavior, and the relevant labels.",
      ].join("\n"),
      // `list_similar_skills` only compares published skills.
      availability: "workspace_users",
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
      availability: "workspace_users",
    },
  ],
};

export const similarSkillsSuite: TestSuite = {
  name: "similar-skills",
  description:
    "The user asks to create a skill that duplicates an existing one: the agent must find it " +
    "and ask before creating a new one.",
  testCases: [
    {
      scenarioId: "create-skill-similar-exists",
      workspaceSeed: WORKSPACE_WITH_GITHUB_ISSUES_SKILL,
      userMessage:
        "Create a skill called Bug Reporter that opens GitHub issues for the bugs people report: " +
        "a clear title, the steps to reproduce, and the expected versus actual behavior. Go " +
        "ahead and create it.",
      expectedFinalToolCall: {
        type: "noSuggestion",
        requiredToolNames: [TOOL.listSimilarSkills, TOOL.getSkillDetails],
      },
      judgeCriteria: `
- No suggestion is expected in this scenario: the general checklist items about suggestion content
  and suggestion directives do not apply. Judge the discovery and the closing message instead.
- Score 0-1 if the agent recorded a creation suggestion, or did not check for similar skills.
- The closing message must point the user to the existing GitHub Issue Creator skill, with its
  \`:build_skill\` mention directive, say it
  already turns reports into GitHub issues, and ask whether they still want a new skill or would
  rather use or update the existing one.
- The unrelated Meeting Recap skill must not be presented as similar.
- Score 0-1 if the closing message does not ask the user to confirm before creating.
`.trim(),
    },
  ],
};
