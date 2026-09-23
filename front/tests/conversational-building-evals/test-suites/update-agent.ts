import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

const CONCIERGE_AGENT_KEY = "support-concierge";

// Block ids are hand-picked so the scenario can assert on which blocks the edit targets. The
// instructions are a flat sequence of sections, each a heading followed by a paragraph, inside
// the `instructions-root` div the editor stores.
const TONE_HEADING_ID = "tone0001";
const TONE_PARAGRAPH_ID = "tone0002";

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

const CONCIERGE_INSTRUCTIONS_HTML =
  `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
  section(
    "Role",
    "role0001",
    "role0002",
    "You are the support concierge of Acme, a B2B invoicing SaaS. You answer customer questions about invoices, payments and account settings."
  ) +
  section(
    "Tone",
    TONE_HEADING_ID,
    TONE_PARAGRAPH_ID,
    "Be upbeat and casual! Use the customer's first name, feel free to add an emoji or two, and keep the energy high."
  ) +
  section(
    "Escalation",
    "esca0001",
    "esca0002",
    "Escalate to a human agent when the customer mentions a legal dispute, a chargeback, or asks to close their account."
  ) +
  section(
    "Formatting",
    "form0001",
    "form0002",
    "Answer in at most three short paragraphs. Use a numbered list for step-by-step instructions."
  ) +
  "</div>";

const WORKSPACE_WITH_CONCIERGE: WorkspaceSeed = {
  skills: [],
  agents: [
    {
      key: CONCIERGE_AGENT_KEY,
      name: "SupportConcierge",
      description:
        "Answers customer questions about Acme invoices and payments.",
      instructionsHtml: CONCIERGE_INSTRUCTIONS_HTML,
    },
  ],
};

export const updateAgentSuite: TestSuite = {
  name: "update-agent",
  description:
    "The user asks for a change that lives in one section of an agent's instructions.",
  testCases: [
    {
      scenarioId: "formal-tone",
      workspaceSeed: WORKSPACE_WITH_CONCIERGE,
      userMessage:
        "Our enterprise customers find SupportConcierge too casual. Make its tone formal: no " +
        "exclamation marks, no emojis, and address customers by their last name.",
      expectedFinalToolCall: {
        type: "suggestAgentInstructionsChange",
        agentKey: CONCIERGE_AGENT_KEY,
        allowedTargetBlockIds: [TONE_PARAGRAPH_ID],
      },
      judgeCriteria: `
- The request only concerns the Tone section, so the edit must target the Tone paragraph and
  nothing else: the Role, Escalation and Formatting sections must not be touched, the "Tone"
  heading must stay, and the root must not be rewritten.
- The new tone must be formal: no exclamation marks, no emojis, and customers addressed by last
  name. The upbeat/casual/first-name/emoji guidance must be gone.
- The agent must have read the agent's instructions (describe_agent) before editing, since
  block ids come from there.
- Score 0-1 if any block other than the Tone paragraph is targeted, or if the whole instructions
  are rewritten.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
