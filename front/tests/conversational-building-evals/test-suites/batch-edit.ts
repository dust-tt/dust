import type {
  SeedSkill,
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import skillPrompts from "@app/tests/conversational-building-evals/test-suites/assets/skill_prompts.json";

type SkillPromptKey = keyof typeof skillPrompts;

// The asset key doubles as the seed key: the scenario picks the name, which is what it tests.
function seedSkill(key: SkillPromptKey, name: string): SeedSkill {
  return { key, name, ...skillPrompts[key] };
}

const NAMING_POLICY_WORKSPACE: WorkspaceSeed = {
  skills: [
    // No prefix.
    seedSkill("prepare-sales-meeting", "Prepare Sales Meeting"),
    seedSkill("write-job-description", "Write Job Description"),
    seedSkill("draft-launch-announcement", "DraftLaunchAnnouncement"),
    // Already compliant.
    seedSkill("review-pull-request", "[eng] ReviewPullRequest"),
    seedSkill("qualify-inbound-lead", "[sales] QualifyInboundLead"),
    seedSkill("answer-policy-question", "[hr] AnswerPolicyQuestion"),
    // Upper-case prefix.
    seedSkill("onboard-new-hire", "[HR] OnboardNewHire"),
    // No space after the prefix.
    seedSkill("create-support-issue", "[eng]CreateSupportIssue"),
  ],
};

export const batchEditSuite: TestSuite = {
  name: "batch-edit",
  description:
    "The user asks for the same kind of change on several entities at once.",
  testCases: [
    {
      scenarioId: "rename-skills-to-naming-policy",
      workspaceSeed: NAMING_POLICY_WORKSPACE,
      userMessage:
        "Rename all the skills to follow the workspace naming policy: the name starts with the " +
        "team managing the skill, in lower case between brackets, then a space, then the name of " +
        "the skill in PascalCase. Teams are [eng], [sales], [gtm] and [hr]. " +
        "Ex: [sales] PrepareSalesMeeting",
      expectedFinalToolCall: {
        type: "separateSuggestions",
        suggestions: [
          {
            kind: "edit_skill",
            skillKey: "prepare-sales-meeting",
            fields: { name: "[sales] PrepareSalesMeeting" },
          },
          {
            kind: "edit_skill",
            skillKey: "write-job-description",
            fields: { name: "[hr] WriteJobDescription" },
          },
          {
            kind: "edit_skill",
            skillKey: "draft-launch-announcement",
            fields: { name: "[gtm] DraftLaunchAnnouncement" },
          },
          {
            kind: "edit_skill",
            skillKey: "onboard-new-hire",
            fields: { name: "[hr] OnboardNewHire" },
          },
          {
            kind: "edit_skill",
            skillKey: "create-support-issue",
            fields: { name: "[eng] CreateSupportIssue" },
          },
        ],
      },
      judgeCriteria: `
- Exactly five skills must be renamed: "Prepare Sales Meeting" to "[sales] PrepareSalesMeeting",
  "Write Job Description" to "[hr] WriteJobDescription", "DraftLaunchAnnouncement" to
  "[gtm] DraftLaunchAnnouncement", "[HR] OnboardNewHire" to "[hr] OnboardNewHire" and
  "[eng]CreateSupportIssue" to "[eng] CreateSupportIssue". The team is inferred from what each
  skill does.
- "[eng] ReviewPullRequest", "[sales] QualifyInboundLead" and "[hr] AnswerPolicyQuestion" already
  follow the policy and must not be touched.
- The renames are independent, so they must be five separate suggest calls, each carrying one
  rename, not one call batching the five together. Issuing them in parallel is best; retrying a
  rejected call in a later round is fine.
- Each suggestion must only change the name: no description, instructions or availability change.
- Score 0-1 if a compliant skill is renamed, a non-compliant one is left out, a skill gets the
  wrong team, or the renames are batched into a single call.
- Score 3 if the five renames are correct and recorded by exactly five suggest calls, with no call
  rejected by the tool.
- Score 2 if the five renames are correct and recorded one per call, but some intermediate calls
  were rejected by the tool (e.g. a title that is too long, or an attempt to rename an already
  compliant skill) before being retried or dropped.
- The closing message must surface the recorded suggestion directives and mention every renamed
  skill.
`.trim(),
    },
  ],
};
