import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";
import { CLAUDE_SONNET_5_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { AUTO_FAST_MODEL_ID } from "@app/types/assistant/models/auto";
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

const CITY_GUIDE_AGENT_KEY = "city-guide";

const CITY_GUIDE_INSTRUCTIONS_HTML =
  `<div data-type="instructions-root" data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">` +
  section(
    "Role",
    "city0001",
    "city0002",
    "The user gives you the name of a city. Identify the city, its main postal code and the country it is in."
  ) +
  section(
    "Answer",
    "city0003",
    "city0004",
    'Answer in one friendly sentence, e.g. "Lyon is in France, and its main postal code is 69000."'
  ) +
  "</div>";

const WORKSPACE_WITH_CITY_GUIDE: WorkspaceSeed = {
  skills: [],
  agents: [
    {
      key: CITY_GUIDE_AGENT_KEY,
      name: "CityGuide",
      description: "Finds the postal code and country of a city.",
      instructionsHtml: CITY_GUIDE_INSTRUCTIONS_HTML,
    },
  ],
};

export const updateAgentSuite: TestSuite = {
  name: "update-agent",
  description:
    "The user asks for a change to an existing agent: one section of its instructions, its model, or its structured output.",
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
    {
      scenarioId: "switch-model-to-sonnet",
      workspaceSeed: WORKSPACE_WITH_CONCIERGE,
      userMessage: "Update the model of SupportConcierge to be Sonnet 5.0.",
      expectedFinalToolCall: {
        type: "suggestAgentModelChange",
        agentKey: CONCIERGE_AGENT_KEY,
        modelId: CLAUDE_SONNET_5_MODEL_ID,
      },
      judgeCriteria: `
- The agent must have listed the workspace models (list_models) to resolve "Sonnet 5.0" to its
  exact modelId, instead of guessing it.
- The suggestion must only change the model: no instruction edits, name, description, scope,
  skills or tools changes.
- Score 0-1 if the suggested model is not Claude Sonnet 5, or if the instructions are edited.
`.trim(),
    },
    {
      scenarioId: "switch-model-to-basic-tier",
      workspaceSeed: WORKSPACE_WITH_CONCIERGE,
      userMessage: "Set the model of SupportConcierge to the basics tier.",
      expectedFinalToolCall: {
        type: "suggestAgentModelChange",
        agentKey: CONCIERGE_AGENT_KEY,
        modelId: AUTO_FAST_MODEL_ID,
      },
      judgeCriteria: `
- "Basics tier" names the Basic auto-routing model, not a concrete model: the suggestion must set
  the model to it (modelId ${AUTO_FAST_MODEL_ID}), not to a specific cheap model such as Haiku.
- The suggestion must only change the model: no instruction edits, name, description, scope,
  skills or tools changes.
- Score 0-1 if the suggested model is not the Basic tier, or if the instructions are edited.
`.trim(),
    },
    {
      scenarioId: "cheaper-model-uses-basic-tier",
      workspaceSeed: WORKSPACE_WITH_CONCIERGE,
      userMessage: "Change the model of SupportConcierge to be cheaper.",
      expectedFinalToolCall: {
        type: "suggestAgentModelChange",
        agentKey: CONCIERGE_AGENT_KEY,
        modelId: AUTO_FAST_MODEL_ID,
      },
      judgeCriteria: `
- The user names no specific model, so the suggestion must use the Basic tier model
  (modelId ${AUTO_FAST_MODEL_ID}), not a concrete cheap model such as Haiku or a mini model.
- The suggestion must only change the model: no instruction edits, name, description, scope,
  skills or tools changes.
- Score 0-1 if the suggested model is not the Basic tier, or if the instructions are edited.
`.trim(),
    },
    {
      scenarioId: "city-guide-structured-output",
      workspaceSeed: WORKSPACE_WITH_CITY_GUIDE,
      userMessage:
        "CityGuide's answers are read by our CRM import. Instead of a sentence, make it return " +
        "a structured JSON with the city, its zipcode and its country.",
      expectedFinalToolCall: {
        type: "suggestAgentStructuredOutput",
        agentKey: CITY_GUIDE_AGENT_KEY,
        requiredProperties: [/city/i, /zip|postal/i, /country/i],
      },
      judgeCriteria: `
- The change must set the agent's structured output (structuredOutput on edit_agent) to a JSON
  schema with a city, a zipcode (or postal code) and a country property, all strings and all
  required, with additionalProperties false.
- The "Answer" paragraph asks for a friendly sentence, which contradicts a JSON answer: it should
  be edited in the same suggest call so the instructions no longer ask for a sentence. The Role
  section must not be removed.
- The agent must have read the agent (describe_agent) before suggesting.
- Score 0-1 if no structured output is suggested (e.g. only the instructions ask for JSON), or if
  the schema misses the city, zipcode or country.
`.trim(),
    },
  ],
};
