import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

const INCIDENT_REPORT_SKILL_KEY = "incident-report";

const WORKSPACE_WITHOUT_SKILLS: WorkspaceSeed = {
  skills: [],
};

const WORKSPACE_WITH_INCIDENT_REPORT: WorkspaceSeed = {
  skills: [
    {
      key: INCIDENT_REPORT_SKILL_KEY,
      name: "Incident Report",
      agentFacingDescription:
        "Use when writing the report of a production incident after it is resolved.",
      instructions: [
        "# Incident Report",
        "",
        "## Structure",
        "",
        "Write a summary, a timeline in UTC, the root cause and the follow-up actions with an owner.",
        "",
        "## Tone",
        "",
        "Stay factual and blameless. Never name the person who caused the incident.",
      ].join("\n"),
    },
  ],
};

export const skillRefsSuite: TestSuite = {
  name: "skill-refs",
  description:
    "The user asks, in conversation, for a new skill that another skill must use.",
  testCases: [
    {
      scenarioId: "onboarding-uses-laptop-setup",
      workspaceSeed: WORKSPACE_WITHOUT_SKILLS,
      userMessage:
        "Create two skills. The first, Laptop Setup, lists the steps to set up a new laptop: " +
        "install Okta Verify, enroll the laptop in Jamf, then turn on FileVault. The second, " +
        "New Hire Onboarding, walks a new hire through their first day: a welcome message, then " +
        "the laptop setup using the Laptop Setup skill, then booking their HR intro call. Go " +
        "ahead and create both.",
      expectedFinalToolCall: { type: "suggestSkillCitingNewSkill" },
      judgeCriteria: `
- The run must create both skills in the same suggestion call, and the New Hire Onboarding
  instructions must cite Laptop Setup as a skill reference instead of copying its steps.
- The Laptop Setup instructions must list the three steps in order: Okta Verify, Jamf
  enrollment, FileVault.
- The New Hire Onboarding instructions must keep the order of the first day: welcome message,
  laptop setup, HR intro call.
- Score 0-1 if the run creates only one skill, merges both into a single skill, or asks a
  clarifying question after the user explicitly said to go ahead.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "incident-report-uses-severity",
      workspaceSeed: WORKSPACE_WITH_INCIDENT_REPORT,
      userMessage:
        "Create a skill called Severity Classification: SEV1 is a customer-facing outage, SEV2 " +
        "is a feature degraded for many customers, SEV3 is everything else. Then update the " +
        "Incident Report skill so it uses Severity Classification to set the severity before " +
        "writing the report. Go ahead.",
      expectedFinalToolCall: {
        type: "suggestSkillCitingNewSkill",
        skillKey: INCIDENT_REPORT_SKILL_KEY,
      },
      judgeCriteria: `
- The run must create Severity Classification and edit Incident Report in the same suggestion
  call, the edit citing the new skill as a skill reference.
- The Severity Classification instructions must define SEV1, SEV2 and SEV3 as the user did.
- The Incident Report edit must only add the severity step before the report, and must keep the
  structure and the blameless tone sections.
- Score 0-1 if the run copies the severity levels into Incident Report instead of citing the new
  skill, skips the Incident Report edit, or asks a clarifying question after the user explicitly
  said to go ahead.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
