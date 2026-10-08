import type {
  SeedSkill,
  SeedTool,
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import skillPrompts from "@app/tests/conversational-building-evals/test-suites/assets/skill_prompts.json";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

type SkillPromptKey = keyof typeof skillPrompts;

// The asset key doubles as the seed key: the scenario picks the name, which is what it tests.
function seedSkill(key: SkillPromptKey, name: string): SeedSkill {
  return { key, name, ...skillPrompts[key] };
}

const GITHUB_TOOL_KEY = "github";
const JIRA_TOOL_KEY = "jira";
const BUG_TRIAGE_AGENT_KEY = "bug-triage";

const GITHUB_TOOL: SeedTool = {
  key: GITHUB_TOOL_KEY,
  name: "Github",
  description: "Search, create and comment on GitHub issues and pull requests.",
  functions: [
    { name: "search_issues", description: "Search issues and pull requests." },
    { name: "create_issue", description: "Create an issue." },
    {
      name: "add_comment",
      description: "Comment on an issue or a pull request.",
    },
  ],
};

const JIRA_TOOL: SeedTool = {
  key: JIRA_TOOL_KEY,
  name: "Jira",
  description: "Search, create and comment on Jira issues.",
  functions: [
    { name: "search_issues", description: "Search issues with JQL." },
    { name: "create_issue", description: "Create an issue in a project." },
    { name: "add_comment", description: "Comment on an issue." },
  ],
};

// Shared by the scenarios: each one only acts on the entities its request covers.
const WORKSPACE: WorkspaceSeed = {
  // Github is cited by the [eng] skills and equipped on BugTriage.
  tools: [GITHUB_TOOL, JIRA_TOOL],
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
  agents: [
    {
      key: BUG_TRIAGE_AGENT_KEY,
      name: "BugTriage",
      description: "Triages incoming bug reports into engineering issues.",
      instructionsHtml:
        `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
        `<h2 data-block-id="role0001">Role</h2>` +
        `<p data-block-id="role0002">You triage the bug reports the support team forwards to engineering.</p>` +
        `<h2 data-block-id="proc0001">Process</h2>` +
        `<p data-block-id="proc0002">Search GitHub for an existing issue first. Comment on it if there is one, otherwise create a new GitHub issue with the steps to reproduce.</p>` +
        "</div>",
      toolKeys: [GITHUB_TOOL_KEY],
    },
    // Uses no tool.
    {
      key: "meeting-recap",
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

export const batchEditSuite: TestSuite = {
  name: "batch-edit",
  description:
    "The user asks for the same kind of change on several entities at once.",
  testCases: [
    {
      scenarioId: "rename-skills-to-naming-policy",
      workspaceSeed: WORKSPACE,
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
- The closing message must surface the recorded suggestion directives without listing every
  renamed skill: the suggestion cards show them.
`.trim(),
    },
    {
      scenarioId: "replace-github-with-jira",
      workspaceSeed: WORKSPACE,
      userMessage:
        "We're moving our issue tracking from GitHub to Jira. Update every skill and agent " +
        "that uses the GitHub tool so they use the Jira tool instead.",
      expectedFinalToolCall: {
        type: "suggestToolReplacement",
        fromToolKey: GITHUB_TOOL_KEY,
        toToolKey: JIRA_TOOL_KEY,
        skillKeys: ["review-pull-request", "create-support-issue"],
        agentKeys: [BUG_TRIAGE_AGENT_KEY],
      },
      judgeCriteria: `
- Exactly three entities must be edited: the "[eng] ReviewPullRequest" and
  "[eng]CreateSupportIssue" skills, and the "BugTriage" agent. They are the only ones using the
  GitHub tool; the other skills and agents must not be touched, and no skill is renamed.
- Each skill edit must swap the GitHub <tool/> tag for the Jira tool's, with the Jira tool id
  taken from the workspace tools, not invented, and must no longer cite GitHub. Rewording other
  parts of the instructions to fit Jira is fine; unrelated changes are not.
- The agent edit must remove the GitHub tool and add the Jira tool. Updating the agent's
  instructions to say Jira instead of GitHub is fine, and is expected for the block naming GitHub.
- Score 0-1 if an entity using GitHub is left out, an entity not using it is edited, or the
  GitHub tool is kept alongside Jira.
- The closing message must surface the recorded suggestion directives without listing every
  edited skill and agent: the suggestion cards show them.
`.trim(),
    },
  ],
};
