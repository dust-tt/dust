import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

const TRIAGE_AGENT_KEY = "support-triage";

function section(
  title: string,
  headingId: string,
  paragraphId: string,
  text: string
): string {
  return (
    `<h2 data-block-id="${headingId}">${title}</h2>` +
    `<p data-block-id="${paragraphId}">${text}</p>`
  );
}

const TRIAGE_INSTRUCTIONS_HTML =
  `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
  section(
    "Role",
    "tria0001",
    "tria0002",
    "You are the first line of support of Acme, an online software store. You read each incoming customer message and decide how to handle it."
  ) +
  section(
    "Routing",
    "rout0001",
    "rout0002",
    "Answer how-to questions directly. Send billing questions to the billing team and bug reports to the engineering on-call."
  ) +
  "</div>";

// An unrelated agent, so the run must pick the right parent instead of the first agent listed.
const WORKSPACE_WITH_TRIAGE: WorkspaceSeed = {
  skills: [],
  agents: [
    {
      key: TRIAGE_AGENT_KEY,
      name: "SupportTriage",
      description: "Triages incoming Acme customer support messages.",
      instructionsHtml: TRIAGE_INSTRUCTIONS_HTML,
    },
    {
      key: "release-announcer",
      name: "ReleaseAnnouncer",
      description: "Drafts announcements for new Acme product releases.",
      instructionsHtml:
        `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
        section(
          "Role",
          "rele0001",
          "rele0002",
          "Turn release notes into a short, upbeat announcement for the Acme blog."
        ) +
        "</div>",
    },
  ],
};

export const subAgentRefsSuite: TestSuite = {
  name: "sub-agent-refs",
  description:
    "The user asks, in conversation, for a new agent that an existing agent can run as a sub-agent.",
  testCases: [
    {
      scenarioId: "refund-checker",
      workspaceSeed: WORKSPACE_WITH_TRIAGE,
      userMessage:
        "Our SupportTriage agent keeps getting refund requests it can't assess. Create a new " +
        "agent called RefundChecker that checks whether a refund request is eligible under our " +
        "policy: refunds are allowed within 30 days of purchase, never for annual plans after " +
        "the first 14 days, and the customer must give their order number. It answers with " +
        "eligible or not eligible and the reason. Then let SupportTriage call RefundChecker " +
        "whenever a customer asks for a refund. Go ahead and set it all up.",
      expectedFinalToolCall: {
        type: "suggestSubAgentByRef",
        parentAgentKey: TRIAGE_AGENT_KEY,
      },
      judgeCriteria: `
- The run must create an agent named "RefundChecker" (no leading '@') and add it as a sub-agent
  of SupportTriage in the same suggestion call, not ReleaseAnnouncer.
- The RefundChecker instructions must cover the whole policy: the 30-day window, no refund on
  annual plans after the first 14 days, the required order number, and an eligible / not
  eligible answer with the reason.
- If SupportTriage's instructions are edited, the edit must say to delegate refund requests to
  RefundChecker, and must not rewrite the unrelated routing rules.
- Score 0-1 if the agent tells the user to add the sub-agent from the agent builder instead of
  suggesting it, creates RefundChecker without wiring it to SupportTriage, or asks a clarifying
  question after the user explicitly said to go ahead.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
