import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_FAST_MODEL_ID,
} from "@app/types/assistant/models/auto";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

const TAGGER_AGENT_KEY = "ticket-tagger";

// A single-purpose classifier with sound instructions, so the over-sized model is the one obvious
// improvement.
const TAGGER_INSTRUCTIONS_HTML =
  `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
  `<h2 data-block-id="tagr0001">Role</h2>` +
  `<p data-block-id="tagr0002">You receive one support ticket and answer with exactly one tag: billing, bug or feature_request.</p>` +
  `<h2 data-block-id="tagr0003">Rules</h2>` +
  `<p data-block-id="tagr0004">Answer with the tag only, in lowercase, without any other text. When the ticket fits several tags, pick the one the customer needs solved first.</p>` +
  "</div>";

const WORKSPACE_WITH_OVERSIZED_TAGGER: WorkspaceSeed = {
  skills: [],
  agents: [
    {
      key: TAGGER_AGENT_KEY,
      name: "TicketTagger",
      description:
        "Tags each support ticket as billing, bug or feature_request.",
      instructionsHtml: TAGGER_INSTRUCTIONS_HTML,
      model: {
        providerId: AUTO_COMPLEX_MODEL_CONFIG.providerId,
        modelId: AUTO_COMPLEX_MODEL_CONFIG.modelId,
      },
    },
  ],
};

const REPORT_AGENT_KEY = "weekly-report";

const WORKSPACE_WITH_WEEKLY_REPORT: WorkspaceSeed = {
  skills: [],
  agents: [
    {
      key: REPORT_AGENT_KEY,
      name: "WeeklyReport",
      description: "Writes the weekly sales report for the leadership team.",
      instructionsHtml:
        `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
        `<p data-block-id="wrep0001">Write the weekly sales report: a three-sentence summary, then one table per region.</p>` +
        "</div>",
    },
  ],
};

export const architectureSuite: TestSuite = {
  name: "architecture",
  description:
    "The builder must steer the user toward the leanest setup: cheapest fitting model, skills over sub-agents.",
  testCases: [
    {
      scenarioId: "review-simple-agent-downgrades-model",
      workspaceSeed: WORKSPACE_WITH_OVERSIZED_TAGGER,
      userMessage: "Review TicketTagger and suggest improvements.",
      expectedFinalToolCall: {
        type: "suggestAgentModelChange",
        agentKey: TAGGER_AGENT_KEY,
        modelId: AUTO_FAST_MODEL_ID,
      },
      judgeCriteria: `
- TicketTagger is a single-purpose classifier on the Complex tier: the main improvement is moving
  it to the Basic tier (modelId ${AUTO_FAST_MODEL_ID}), explained by cost and speed.
- The tier modelId is given in the builder's instructions, so listing the workspace models
  (list_models) is unnecessary.
- The instructions are already sound: any instruction edit must be minor and keep the three tags
  and the tag-only answer rule.
- Score 0-1 if no model change to the Basic tier is suggested, or if a concrete model (e.g. Haiku)
  is suggested instead of the tier.
`.trim(),
    },
    {
      scenarioId: "subagent-request-becomes-skill",
      workspaceSeed: WORKSPACE_WITH_WEEKLY_REPORT,
      userMessage:
        "WeeklyReport's tables are inconsistent. Create a sub-agent that WeeklyReport can call " +
        "to format its tables in our house style: left-aligned columns, a bold header row and " +
        "a totals row at the bottom.",
      expectedFinalToolCall: { type: "suggestSkillCreation" },
      judgeCriteria: `
- The sub-agent would only bring formatting instructions, with no model, tools or data of its
  own: the builder must suggest creating a skill instead, and briefly tell the user why a skill
  fits better than a sub-agent.
- The skill instructions must cover the three formatting rules: left-aligned columns, a bold
  header row, and a totals row at the bottom.
- Score 0-1 if the builder creates an agent meant to be called as a sub-agent, or creates the
  skill without telling the user it chose a skill over a sub-agent.
`.trim(),
    },
  ],
};
