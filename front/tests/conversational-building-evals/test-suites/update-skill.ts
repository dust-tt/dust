import type {
  TestSuite,
  WorkspaceSeed,
} from "@app/tests/conversational-building-evals/lib/types";

const SUPPORT_REPLY_SKILL_KEY = "support-reply";
const BUG_TRIAGE_SKILL_KEY = "bug-triage";
const LINEAR_TOOL_KEY = "linear";
const TICKET_FILER_SKILL_KEY = "ticket-filer";
const REFUND_POLICY_KEY = "refund-policy";

const BUG_TRIAGE_SKILL = {
  key: BUG_TRIAGE_SKILL_KEY,
  name: "Bug Triage",
  agentFacingDescription:
    "Use when a user reports a bug to classify its severity and component.",
  instructions: [
    "# Bug Triage",
    "",
    "Classify each reported bug.",
    "",
    "## Steps",
    "",
    "1. Ask for reproduction steps if they are missing.",
    "2. Assign a severity: critical, high, medium or low.",
    "3. Identify the affected component.",
  ].join("\n"),
};

const WORKSPACE_WITH_LINEAR: WorkspaceSeed = {
  skills: [BUG_TRIAGE_SKILL],
  tools: [
    {
      key: LINEAR_TOOL_KEY,
      name: "Linear",
      description: "Create and update issues in Linear.",
      functions: [
        { name: "create_issue", description: "Create a Linear issue." },
        { name: "update_issue", description: "Update a Linear issue." },
      ],
    },
    {
      key: "zendesk",
      name: "Zendesk",
      description: "Read and reply to Zendesk support tickets.",
      functions: [
        { name: "get_ticket", description: "Fetch a Zendesk ticket." },
      ],
    },
  ],
};

const WORKSPACE_WITH_SUPPORT_HANDBOOK: WorkspaceSeed = {
  skills: [],
  knowledge: [
    {
      name: "Support Handbook",
      documents: [
        {
          key: REFUND_POLICY_KEY,
          title: "Refund Policy",
          text: "Refunds are granted within 30 days of purchase for annual plans. Monthly plans are not refundable.",
        },
        {
          key: "escalation-matrix",
          title: "Escalation Matrix",
          text: "Severity 1 incidents go to the on-call engineer. Billing disputes go to finance.",
        },
      ],
    },
  ],
};

const WORKSPACE_WITH_SUPPORT_SKILLS: WorkspaceSeed = {
  skills: [
    {
      key: SUPPORT_REPLY_SKILL_KEY,
      name: "Customer Support Reply",
      agentFacingDescription:
        "Use when drafting a reply to a customer support ticket or email.",
      instructions: [
        "# Customer Support Reply",
        "",
        "Draft replies to customer support requests.",
        "",
        "## Tone",
        "",
        "Be warm, concise and professional. Never blame the customer.",
        "",
        "## Structure",
        "",
        "1. Acknowledge the issue in one sentence.",
        "2. Explain the cause or the next step.",
        "3. Close with an offer to help further.",
        "",
        "## Sign-off",
        "",
        'Sign every reply with "The Acme Support Team".',
      ].join("\n"),
    },
    {
      key: "release-notes",
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
      key: "meeting-recap",
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

// The parent skill needs a capability a second skill already owns, so the right fix is a
// sub-skill reference rather than restating that skill's rules (or re-adding its tool).
const WORKSPACE_WITH_TICKET_FILER: WorkspaceSeed = {
  skills: [
    BUG_TRIAGE_SKILL,
    {
      key: TICKET_FILER_SKILL_KEY,
      name: "Support Ticket Filer",
      agentFacingDescription:
        "Use when filing an issue in the support tracker, with the severity, component and reproduction details the support team requires.",
      instructions: [
        "# Support Ticket Filer",
        "",
        "File an issue in the support tracker.",
        "",
        "## Required fields",
        "",
        "1. A title of the form `<component>: <symptom>`.",
        "2. The affected component.",
        "3. A severity: sev1 (outage), sev2 (degraded), sev3 (cosmetic).",
        "4. Reproduction steps, the expected result and the observed result.",
        "",
        "Never file an issue with only a one-line description: the support team bounces those back.",
        "Report the issue reference back to whoever asked for it.",
      ].join("\n"),
    },
  ],
};

export const updateSkillSuite: TestSuite = {
  name: "update-skill",
  description:
    "The user asks, in conversation, for a targeted change to an existing custom skill.",
  testCases: [
    {
      scenarioId: "inline-tool",
      workspaceSeed: WORKSPACE_WITH_LINEAR,
      userMessage:
        "Update the Bug Triage skill: once the bug is classified, it should create a Linear " +
        "issue with the severity and component, using our Linear tool.",
      expectedFinalToolCall: {
        type: "suggestSkillUpdate",
        skillKey: BUG_TRIAGE_SKILL_KEY,
        edits: ["instructionEdits"],
        references: { toolKeys: [LINEAR_TOOL_KEY] },
      },
      judgeCriteria: `
- The edit must add a step that creates a Linear issue after classification, carrying the
  severity and component, and reference the Linear tool inline with a \`<tool id=... name=.../>\`
  tag whose id is the seeded Linear tool id.
- The agent must have looked the tool up (list_tools and/or get_tool_details) rather than
  guessing an id; referencing Zendesk is wrong.
- The existing steps (reproduction steps, severity, component) must be preserved.
- Score 0-1 if the tool is not referenced with a <tool> tag, if the id is invented, or if the
  suggestion targets another skill.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "inline-knowledge",
      workspaceSeed: {
        ...WORKSPACE_WITH_SUPPORT_HANDBOOK,
        skills: WORKSPACE_WITH_SUPPORT_SKILLS.skills,
      },
      userMessage:
        "Update the Customer Support Reply skill so that when a customer asks about refunds, it " +
        "bases its answer on our Refund Policy document from the knowledge base.",
      expectedFinalToolCall: {
        type: "suggestSkillUpdate",
        skillKey: SUPPORT_REPLY_SKILL_KEY,
        edits: ["instructionEdits"],
        references: { knowledgeKeys: [REFUND_POLICY_KEY] },
      },
      judgeCriteria: `
- The edit must add guidance for refund questions that inlines the "Refund Policy" document
  with a \`<knowledge .../>\` tag whose id, title, space and dsv are exactly those returned by
  search_knowledge for that document. The "Escalation Matrix" document is not relevant here.
- The agent must have called search_knowledge to find the document rather than inventing a
  reference.
- The Tone, Structure and Sign-off sections must be preserved.
- Score 0-1 if the knowledge tag is missing or points at anything other than the seeded Refund
  Policy document, or if the suggestion targets another skill.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
    {
      scenarioId: "add-ticket-number-check",
      workspaceSeed: WORKSPACE_WITH_SUPPORT_SKILLS,
      userMessage:
        "Can you update the Customer Support Reply skill? Before drafting anything it should " +
        "check that the ticket number is present in the request, and if it isn't, ask the " +
        "customer for it instead of drafting a reply.",
      expectedFinalToolCall: {
        type: "suggestSkillUpdate",
        skillKey: SUPPORT_REPLY_SKILL_KEY,
        edits: ["instructionEdits"],
      },
      judgeCriteria: `
- The suggested instructions must add a step that checks for a ticket number before drafting, and
  say to ask the customer for it (rather than drafting a reply) when it is missing.
- The Tone, Structure and Sign-off sections must be kept as they are unless the edit targets a
  block that necessarily contains them, in which case their content must be carried over intact.
- Score 0-1 if the suggestion targets any skill other than "Customer Support Reply", or if the
  agent-facing description is rewritten (the user did not ask for it).
- The closing message must surface the recorded suggestion (the tool output) to the user.
`.trim(),
    },
    {
      scenarioId: "inline-sub-skill",
      workspaceSeed: WORKSPACE_WITH_TICKET_FILER,
      userMessage:
        "Update the Bug Triage skill so that once a bug is classified it files a ticket for it. " +
        "We already have a Support Ticket Filer skill that knows how we want tickets written — " +
        "use that rather than spelling the rules out again.",
      expectedFinalToolCall: {
        type: "suggestSkillUpdate",
        skillKey: BUG_TRIAGE_SKILL_KEY,
        edits: ["instructionEdits"],
        references: { skillKeys: [TICKET_FILER_SKILL_KEY] },
      },
      judgeCriteria: `
- The edit must add a step, after classification, that delegates the filing to the
  "Support Ticket Filer" skill, referenced inline with a \`<skill id=... name=.../>\` tag whose
  id is the seeded Support Ticket Filer id.
- The agent must have looked the skill up (list_skills and/or describe_skill) rather than
  inventing an id.
- The edit MUST NOT restate the ticket-filing rules (title format, severity scale, component,
  reproduction steps) inside Bug Triage: those belong to the referenced skill, and duplicating
  them is exactly what the user asked to avoid.
- The existing triage steps (reproduction steps, severity, component) must be preserved.
- Score 0-1 if no <skill> tag is inlined, if the id is invented, if the suggestion targets
  another skill, or if the filing rules are copied into Bug Triage instead of delegated.
- The closing message must surface the recorded suggestion directive to the user.
`.trim(),
    },
  ],
};
