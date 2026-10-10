import type { Space } from "../../data/types";
import type { PodConfiguration, WorkspaceFile, FileKind } from "./model";

export const workspacePods: Space[] = [
  {
    id: "voice-of-customer",
    name: "Voice of Customer",
    description:
      "Turn customer conversations into a shared view of what matters next.",
  },
  {
    id: "northstar-tender",
    name: "Northstar tender",
    description:
      "Build an evidence-backed response for Northstar’s company-wide AI rollout.",
  },
];

export const podMembers: Record<string, string[]> = {
  "voice-of-customer": ["Emma", "Lucas", "Sophie"],
  "northstar-tender": ["Emma", "Lucas", "Thomas"],
};
export const workspacePeople = [
  { id: "Emma", name: "Emma Andersson", email: "emma@dust.tt" },
  { id: "Lucas", name: "Lucas Johansson", email: "lucas@dust.tt" },
  { id: "Sophie", name: "Sophie Martin", email: "sophie@dust.tt" },
  { id: "Thomas", name: "Thomas Bernard", email: "thomas@dust.tt" },
  { id: "Maya", name: "Maya Patel", email: "maya@dust.tt" },
];
export const everyone = ["Emma", "Lucas", "Sophie", "Thomas", "Maya"];

function entry(
  id: string,
  name: string,
  kind: FileKind,
  parentId: string | undefined,
  content = "",
  extra: Partial<WorkspaceFile> = {}
): WorkspaceFile {
  return {
    id,
    name,
    kind,
    parentId,
    content,
    scope: "Workspace files",
    location: "",
    description: "",
    access: "company",
    sharedWith: [],
    canShare: true,
    revision: 1,
    updatedBy: id.startsWith("meridian")
      ? "Sophie"
      : id.startsWith("northstar")
        ? "Lucas"
        : "Emma",
    updatedAt: "2026-10-06T09:00:00Z",
    ...extra,
  };
}

export function createPodConfiguration(id: string): PodConfiguration {
  const voc = id === "voice-of-customer";
  const refs = voc
    ? [
        "calls",
        "feedback",
        "researcher",
        "voice",
        "gong",
        "linear",
        "voc-trigger",
        "voc-snapshot",
        "voc-frame",
        "voc-baseline",
      ]
    : [
        "northstar-rfp",
        "northstar-call",
        "meridian-call",
        "northstar-email",
        "security",
        "product-guide",
        "commercial-notes",
        "agent",
        "voice",
        "review",
        "gong",
        "crm",
        "northstar-account",
        "questionnaire",
        "tender-draft",
        "tender-frame",
        "tender-kickoff",
      ];
  return {
    fileTabs: [
      { fileId: voc ? "voc-frame" : "tender-frame", title: "Overview" },
    ],
    references:
      id === "files"
        ? []
        : refs.map((fileId) => ({
            fileId,
            role: fileId === "voice" ? "Always apply" : "Reference",
          })),
    instructions: voc
      ? "Group feedback by topic. Cite the customer’s words. Separate repeated needs from individual requests. Propose roadmap changes for review."
      : "Answer each tender requirement from approved evidence. Use comparable customer calls. Flag gaps and never turn a customer request into a product promise.",
    defaultAgentId: voc ? "researcher" : "agent",
    confirmActions: true,
    audience: "private",
    triggerEnabled: voc,
  };
}

export function frameHtml(
  title: string,
  subtitle: string,
  rows: {
    title: string;
    detail: string;
    status: string;
    sourceIds?: string[];
  }[]
): string {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char] ?? char
    );
  const tender = title.includes("Northstar");
  const needsConfirmation = (status: string) =>
    status === "Needs confirmation" || status === "Missing approved evidence";
  const gaps = rows.filter((row) => needsConfirmation(row.status)).length;
  return `<!doctype html><html lang="en" data-pod-frame="4"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
:root{color-scheme:light dark;--bg:#fff;--fg:#292524;--muted:#64605c;--line:#e9e7e5;--soft:#f8f7f6;--accent:#2563a6}*{box-sizing:border-box}body{margin:0;padding:32px;font:14px/1.6 system-ui;color:var(--fg);background:var(--bg)}h1{font-size:27px;line-height:1.2;letter-spacing:-.6px;margin:10px 0}h2{font-size:16px;margin:0 0 8px}h3{font-size:14px;margin:0}p{margin:8px 0;color:var(--muted)}.eyebrow{font-size:12px;color:var(--muted)}header{display:flex;justify-content:space-between;gap:24px;align-items:start}button{font:inherit;color:var(--accent);background:transparent;border:0;padding:8px 0;text-align:left;cursor:pointer}button:hover{text-decoration:underline}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.metrics{display:flex;gap:36px;border-block:1px solid var(--line);padding:20px 0;margin:26px 0}.metric b{display:block;font-size:24px;font-weight:550;line-height:1.3}.metric span{font-size:12px;color:var(--muted)}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 18px}.toolbar input{min-width:0;max-width:240px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;color:var(--fg);background:var(--bg)}.grid{display:grid;grid-template-columns:${tender ? "1fr" : "repeat(2,minmax(0,1fr))"};gap:16px}.row{border:1px solid var(--line);border-radius:12px;padding:20px;min-width:0}.status{display:inline-block;font-size:12px;color:var(--muted);margin-bottom:12px}.quote{margin:12px 0;font-size:15px;line-height:1.65}.actions{display:flex;gap:20px;flex-wrap:wrap;font-size:12px}.tender-row{display:grid;grid-template-columns:180px 1fr;gap:24px}.note{margin-top:24px;padding:16px 20px;border-radius:10px;background:var(--soft)}details summary{cursor:pointer;color:var(--accent);font-size:12px}details p{white-space:pre-wrap;font-size:13px}.empty{display:none;padding:24px;color:var(--muted)}[hidden]{display:none!important}@media(max-width:620px){body{padding:20px}.grid{grid-template-columns:1fr}.tender-row{grid-template-columns:1fr;gap:8px}header{flex-direction:column;gap:4px}.metrics{gap:24px}.toolbar{align-items:start;flex-direction:column}.toolbar input{max-width:none;width:100%}}@media(prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#39332f;--soft:#292524;--accent:#93c5fd}}
</style></head><body><header><div><span class="eyebrow">${tender ? "NORTHSTAR / ENTERPRISE EVALUATION" : "CUSTOMER INTELLIGENCE"}</span><h1>${tender ? "A response built on evidence" : "What customers are telling us"}</h1><p>${tender ? "A 200-person pilot. A path to 1,200 seats. Every commitment needs evidence." : "Recurring needs across customer calls, emails, and support conversations."}</p></div></header>
<div class="metrics"><div class="metric"><b>${rows.length}</b><span>${tender ? "Requirements" : "Customer themes"}</span></div><div class="metric"><b>${tender ? gaps : rows.filter((row) => Number.parseInt(row.status) > 1).length}</b><span>${tender ? "Need confirmation" : "Across multiple accounts"}</span></div><div class="metric"><b>${tender ? "23 Oct" : "Weekly"}</b><span>${tender ? "Response deadline" : "Product review"}</span></div></div>
<div class="toolbar"><h2>${tender ? "Response readiness" : "Feedback by topic"}</h2><input aria-label="${tender ? "Filter requirements" : "Filter feedback"}" placeholder="${tender ? "Find a requirement…" : "Find a topic or account…"}" type="search"></div>
<div class="grid">${rows
    .map(
      (row) =>
        `<article class="row ${tender ? "tender-row" : ""}"><div><span class="status">${escape(row.status)}</span><h2>${escape(row.title)}</h2></div><div><p class="quote">${escape(row.detail)}</p></div></article>`
    )
    .join(
      ""
    )}</div><p class="empty">No matching ${tender ? "requirements" : "feedback"}.</p>
<div class="note"><h3>${tender ? "Before sending" : "From feedback to product decisions"}</h3><p>${tender ? "Confirm regional hosting, pricing, and SLA with the responsible teams. Comparable customer calls support the use case; they do not establish a contractual commitment." : "Repeated customer needs are ready for product review. Roadmap proposals keep the evidence together without making delivery commitments."}</p></div><p class="eyebrow">${escape(subtitle)}</p>
<script>document.querySelector('input').addEventListener('input',function(event){var query=event.target.value.toLowerCase();var shown=0;document.querySelectorAll('article').forEach(function(row){row.hidden=!row.textContent.toLowerCase().includes(query);if(!row.hidden)shown++});document.querySelector('.empty').style.display=shown?'none':'block'})</script></body></html>`;
}

export const tenderRequirements = [
  {
    topic: "Access controls",
    evidence: "security",
    answer:
      "The reference architecture inherits source permissions and checks access at retrieval time. Validate the proposed deployment with Northstar’s security team.",
    status: "Supported by reference",
  },
  {
    topic: "Customer success workflows",
    evidence: "meridian-call",
    answer:
      "Meridian’s pilot uses shared context for account handoffs. Offer Northstar a pilot around its own customer success workflow; the call demonstrates a use case, not a contractual guarantee.",
    status: "Comparable customer evidence",
  },
  {
    topic: "Regional hosting",
    evidence: "northstar-rfp",
    answer:
      "The tender requires EU-only processing. The demo evidence does not establish deployment availability. Request a written answer from security before submitting.",
    status: "Needs confirmation",
  },
  {
    topic: "Pricing and SLA",
    evidence: "northstar-rfp",
    answer:
      "A signed pricing schedule and contractual SLA are not present. Ask the account owner for an approved commercial proposal.",
    status: "Missing approved evidence",
  },
];

export function createWorkspaceFiles(): WorkspaceFile[] {
  const files = [
    entry("customers", "Customers", "folder", undefined),
    entry("calls", "Customer calls", "folder", "customers", "", {
      description: "Recordings and transcripts · Gong",
    }),
    entry("feedback", "Emails and feedback", "folder", "customers", "", {
      description: "Customer emails and support notes",
    }),
    entry("accounts", "Accounts", "folder", "customers"),
    entry("product", "Product", "folder", undefined),
    entry("roadmap", "Roadmap", "folder", "product"),
    entry("growth", "Growth", "folder", undefined),
    entry("sales", "Sales", "folder", undefined),
    entry("tenders", "Tenders", "folder", "sales"),
    entry("capabilities", "Agents and skills", "folder", undefined),
    entry("connections", "Connections", "folder", undefined),
    entry("personal-notes", "Notes", "folder", undefined, "", {
      scope: "My files",
      access: "private",
    }),
    entry(
      "commercial-notes",
      "Northstar · negotiation notes",
      "document",
      "personal-notes",
      "Emma’s private notes\n\nNorthstar may expand from 200 to 1,200 seats. Ask Thomas about the approved discount range before sharing a commercial response. This note is not an approved price or customer commitment.",
      {
        scope: "My files",
        access: "private",
        description: "Only you · Not approved for the tender response",
      }
    ),
    entry(
      "northstar-call",
      "Northstar · enterprise discovery",
      "recording",
      "calls",
      "Lucas · What gets in the way of a wider rollout?\n\nAvery, Northstar · We need access controls that follow our existing groups. Our customer success teams keep rebuilding context between tools.\n\nLucas · What will procurement ask for?\n\nAvery · EU-only processing, a clear service commitment, and evidence from a comparable rollout. Please don’t assume that a pilot proves those requirements.",
      {
        description: "Northstar · Oct 2 · Discovery · Gong",
        mediaUrl: "/company-demo/northstar.wav",
        signals: [
          {
            topic: "Access controls",
            account: "Northstar",
            quote: "We need access controls that follow our existing groups.",
          },
          {
            topic: "Connected workflows",
            account: "Northstar",
            quote:
              "Our customer success teams keep rebuilding context between tools.",
          },
        ],
      }
    ),
    entry(
      "meridian-call",
      "Meridian · pilot review",
      "recording",
      "calls",
      "Sophie · How is the pilot going?\n\nJordan, Meridian · Account handoffs are much easier when call notes and support history are together. We still need a way to see which sources an answer used.\n\nSophie · What should we improve first?\n\nJordan · Freshness. An old account note can make an otherwise good answer misleading. We’re still evaluating the pilot; we haven’t measured a financial return.",
      {
        description: "Meridian · Oct 3 · Customer success · Gong",
        mediaUrl: "/company-demo/meridian.wav",
        signals: [
          {
            topic: "Source transparency",
            account: "Meridian",
            quote: "We still need a way to see which sources an answer used.",
          },
          {
            topic: "Knowledge freshness",
            account: "Meridian",
            quote:
              "An old account note can make an otherwise good answer misleading.",
          },
        ],
      }
    ),
    entry(
      "lumen-call",
      "Lumen · admin onboarding",
      "recording",
      "calls",
      "Maya · What would make onboarding easier?\n\nCasey, Lumen · We want to test permissions before inviting everyone. Team leads need a simple way to understand who can see a source.\n\nMaya · Anything else?\n\nCasey · Show us when connected data was last refreshed. Then people can judge whether to trust the answer.",
      {
        description: "Lumen · Oct 5 · Onboarding · Gong",
        mediaUrl: "/company-demo/lumen.wav",
        signals: [
          {
            topic: "Access controls",
            account: "Lumen",
            quote:
              "Team leads need a simple way to understand who can see a source.",
          },
          {
            topic: "Knowledge freshness",
            account: "Lumen",
            quote: "Show us when connected data was last refreshed.",
          },
        ],
      }
    ),
    entry(
      "northstar-email",
      "Northstar · procurement follow-up",
      "email",
      "feedback",
      "From: Avery Chen, Northstar\nTo: Lucas, Dust demo\nSubject: Next steps for the tender\n\nPlease send your response by October 23. We need written confirmation of regional processing, source access controls, and a contractual SLA. A comparable customer workflow would help our evaluation.\n\nWe can share the evaluation questionnaire with the bid team, but not our full procurement drive.",
      {
        description: "Avery → Lucas · Oct 5",
        signals: [
          {
            topic: "Access controls",
            account: "Northstar",
            quote:
              "We need written confirmation of regional processing, source access controls, and a contractual SLA.",
          },
        ],
      }
    ),
    entry(
      "meridian-ticket",
      "Meridian · show source refresh time",
      "document",
      "feedback",
      "Support note · CS-142\n\nMeridian asks for a visible last-refreshed timestamp beside connected knowledge. They currently open the original system to check whether a record is current.\n\nStatus: Captured for product review. No delivery date promised.",
      {
        description: "Customer success · Product feedback",
        signals: [
          {
            topic: "Knowledge freshness",
            account: "Meridian",
            quote:
              "We currently open the original system to check whether a record is current.",
          },
        ],
      }
    ),
    entry(
      "northstar-account",
      "Northstar · opportunity",
      "document",
      "accounts",
      "Account: Northstar\nStage: Tender evaluation\nChampion: Avery Chen\nPotential rollout: 1,200 seats\nPilot team: Customer success\nDeadline: October 23\nOwner: Lucas\n\nNext step: Submit an evidence-backed response and schedule the security review.",
      { description: "HubSpot · Updated Oct 6" }
    ),
    entry(
      "meridian-account",
      "Meridian · account plan",
      "document",
      "accounts",
      "Customer success pilot with 40 participants. Champion: Jordan. Priorities: account handoffs, traceable answers, and up-to-date knowledge. Expansion depends on completing the pilot review.",
      { description: "HubSpot · Customer success" }
    ),
    entry(
      "security",
      "Access and security · reference notes",
      "document",
      "product",
      "DEMO REFERENCE — illustrative architecture, not a claim about Dust’s commercial offering.\n\nSources retain their permissions. Retrieval evaluates the requesting user’s access. Linked references do not grant access to the original.\n\nSharing a derived artifact requires considering its source audience. Regional hosting, certifications, retention terms, and contractual SLAs require an approved security response; they are not established by these notes.",
      { description: "Architecture reference · Approved for internal demo use" }
    ),
    entry(
      "product-guide",
      "Connected work · product guide",
      "document",
      "product",
      "Bring approved company knowledge, agents, skills, and connected tools together around a task. Conversations can produce documents and interactive frames. Agents use only accessible sources. Actions that change connected systems can require review.\n\nDemo scope: local fixtures and deterministic runs. No live customer systems or model calls.",
      { description: "Product narrative and demo scope" }
    ),
    entry(
      "growth-plan",
      "October · growth plan",
      "document",
      "growth",
      "Focus: help customer success leaders evaluate connected work.\n\nInputs: discovery calls, pilot reviews, customer questions, and campaign replies.\nActivities: customer-led product stories, enterprise workshops, and follow-up sequences.\nLearning loop: feed recurring questions into Voice of Customer; use approved evidence in sales responses.\n\nDo not publish customer quotes without approval.",
      { description: "Campaigns → conversations → product learning" }
    ),
    entry(
      "campaign",
      "Connected work · campaign review",
      "conversation",
      "growth",
      "Emma\nWhat are we hearing from the campaign?\n\nResearch analyst\nNorthstar and Lumen both ask how permissions work. Meridian focuses on freshness and traceability. Lead the next workshop with a concrete handoff and show the sources behind the answer.",
      {
        sourceIds: ["northstar-call", "lumen-call", "meridian-call"],
        description: "Emma and Research analyst · Sources attached",
      }
    ),
    entry(
      "campaign-output",
      "Workshop outline",
      "document",
      "campaign",
      "1. A real account handoff\n2. Sources and permissions\n3. Inspecting an answer\n4. Questions for your own pilot",
      { description: "Generated in the campaign review" }
    ),
    entry(
      "northstar-rfp",
      "Northstar · tender requirements",
      "document",
      "tenders",
      "Deadline: October 23\n\n1. Explain source access controls and administration.\n2. Describe a comparable customer success workflow.\n3. Confirm EU-only processing and applicable terms.\n4. Provide approved pricing for 1,200 seats and a contractual SLA.\n\nUse evidence, name the source, and mark anything still awaiting confirmation.",
      { description: "Four requirements · Due Oct 23" }
    ),
    entry(
      "shared-procurement",
      "Northstar procurement",
      "folder",
      undefined,
      "",
      {
        scope: "Shared with me",
        access: "limited",
        sharedWith: ["northstar-tender"],
        canShare: false,
        description: "Shared by Avery · This folder only",
      }
    ),
    entry(
      "questionnaire",
      "Evaluation questionnaire",
      "document",
      "shared-procurement",
      "Evaluation criteria\n\nSecurity and governance: 35%\nWorkflow fit: 30%\nRollout and support: 20%\nCommercial terms: 15%\n\nAvery has shared this folder with the bid team. Other procurement folders are not visible.",
      {
        scope: "Shared with me",
        access: "limited",
        sharedWith: [],
        canShare: false,
        description: "Shared with the bid team",
      }
    ),
    entry(
      "voc-trigger",
      "New customer call",
      "trigger",
      "capabilities",
      "When a new call arrives in Customers / Customer calls, review customer feedback and prepare roadmap proposals.",
      {
        recordId: "trigger-voc",
        trigger: {
          podId: "voice-of-customer",
          enabled: true,
          kind: "event",
          agentId: "researcher",
          prompt:
            "Review the new customer call, update customer themes, and propose roadmap changes supported by repeated feedback.",
          folderId: "calls",
          cadence: "weekly",
          time: "09:00",
          timezone: "Europe/Paris",
        },
        description: "Gong → Voice of Customer · Event trigger",
      }
    ),
    entry(
      "researcher",
      "Research analyst",
      "agent",
      "capabilities",
      "Read accessible customer evidence. Group signals by topic, count distinct accounts, cite exact sources, and separate customer requests from validated product facts.",
      {
        recordId: "agent-5",
        description: "Find recurring needs and trace them to customer evidence",
      }
    ),
    entry(
      "agent",
      "Proposal partner",
      "agent",
      "capabilities",
      "Prepare an evidence-backed tender response. Check each requirement against approved references and comparable customer calls. Flag missing evidence. Never invent pricing, delivery dates, hosting terms, or certifications.",
      {
        recordId: "agent-4",
        description: "Draft proposals and surface gaps before submission",
      }
    ),
    entry(
      "voice",
      "Customer evidence",
      "skill",
      "capabilities",
      "Keep the customer’s meaning. Cite a source for each finding. Count distinct accounts, not repeated mentions. Preserve uncertainty. Treat output audiences as a constraint on which sources can be used.",
      {
        recordId: "skill-brand-check",
        description: "Synthesize feedback without losing its source",
      }
    ),
    entry(
      "review",
      "Tender review",
      "skill",
      "capabilities",
      "Map every requirement to an answer and source. Separate supported answers from assumptions. Ask for confirmation on hosting, contractual terms, pricing, and security claims.",
      {
        recordId: "skill-pr-review",
        description: "Check coverage, evidence, and unanswered questions",
      }
    ),
    entry(
      "gong",
      "Gong",
      "tool",
      "connections",
      "Read customer call recordings and transcripts from the Customer calls folder. This demo uses local recordings and a simulated incoming-call event.",
      {
        recordId: "tool-gong",
        description: "MCP server · Calls and transcripts · Demo connection",
      }
    ),
    entry(
      "linear",
      "Linear",
      "tool",
      "connections",
      "Prepare roadmap proposals from customer evidence. Approval creates a local issue record in Product / Roadmap. No external issue is sent.",
      {
        recordId: "tool-linear",
        description: "MCP server · Product issues · Demo connection",
      }
    ),
    entry(
      "crm",
      "HubSpot",
      "tool",
      "connections",
      "Read account context and opportunity details from Customers / Accounts. Local sample records only.",
      {
        recordId: "tool-crm",
        description:
          "MCP server · Accounts and opportunities · Demo connection",
      }
    ),
    entry(
      "gmail",
      "Gmail",
      "tool",
      "connections",
      "Customer emails are available under Customers / Emails and feedback. Local sample messages only.",
      {
        recordId: "tool-gmail",
        description: "MCP server · Customer email · Demo connection",
      }
    ),
    entry(
      "voc-baseline",
      "Weekly customer feedback review",
      "conversation",
      undefined,
      "Emma\nWhat are the most consistent needs this week?\n\nResearch analyst\nAccess controls and knowledge freshness each come up across two accounts. Northstar and Lumen want clearer permission checks. Meridian and Lumen want to judge whether connected knowledge is current. The summary below brings these findings together with their sources.",
      {
        scope: "My files",
        access: "private",
        sharedWith: ["voice-of-customer"],
        sourceIds: [
          "northstar-call",
          "meridian-call",
          "lumen-call",
          "meridian-ticket",
        ],
        description: "Shared with Voice of Customer · Baseline review",
      }
    ),
    entry(
      "voc-snapshot",
      "Customer feedback summary",
      "document",
      "voc-baseline",
      "Access controls · Northstar, Lumen\nCustomers want to understand who can access a source before a wider rollout.\n\nKnowledge freshness · Meridian, Lumen\nCustomers want to see when connected knowledge was refreshed.\n\nSource transparency · Meridian\nPeople need a direct path from an answer to its evidence.\n\nConnected workflows · Northstar\nAccount teams want continuity across their tools.",
      {
        scope: "My files",
        access: "private",
        sourceIds: [
          "northstar-call",
          "lumen-call",
          "meridian-call",
          "meridian-ticket",
        ],
        description: "Four topics · Updated Oct 6 · Queryable source",
      }
    ),
    entry(
      "voc-frame",
      "Customer feedback by topic",
      "frame",
      "voc-baseline",
      frameHtml(
        "What customers are asking for",
        "A source-backed view across three accounts.",
        [
          {
            title: "Access controls",
            detail: "Northstar and Lumen want clearer source permissions.",
            status: "2 accounts",
          },
          {
            title: "Knowledge freshness",
            detail: "Meridian and Lumen want visible refresh times.",
            status: "2 accounts",
          },
          {
            title: "Source transparency",
            detail: "Meridian wants the evidence behind an answer.",
            status: "1 account",
          },
          {
            title: "Connected workflows",
            detail: "Northstar wants continuity across customer success tools.",
            status: "1 account",
          },
        ]
      ),
      {
        scope: "My files",
        access: "private",
        recordId: "frame-voc",
        description: "Customer themes and supporting feedback",
      }
    ),
    entry(
      "tender-kickoff",
      "Northstar · response planning",
      "conversation",
      undefined,
      "Lucas\nPrepare the response from the RFP and the customer evidence we already have.\n\nProposal partner\nThe access reference and Meridian pilot call support an initial response. Regional hosting and commercial terms need approved answers. Emma’s negotiation note is private, so it is excluded from the shared response.",
      {
        scope: "My files",
        access: "private",
        sharedWith: ["northstar-tender"],
        sourceIds: ["northstar-rfp", "meridian-call", "security"],
        description: "Shared with Northstar tender · Initial review",
      }
    ),
    entry(
      "tender-draft",
      "Northstar · tender response",
      "document",
      "tender-kickoff",
      tenderRequirements
        .map((item) => `${item.topic}\n${item.answer}\nStatus: ${item.status}`)
        .join("\n\n"),
      {
        scope: "My files",
        access: "private",
        sourceIds: ["northstar-rfp", "meridian-call", "security"],
        description: "Working draft · Two requirements need confirmation",
      }
    ),
    entry(
      "tender-frame",
      "Northstar · coverage review",
      "frame",
      "tender-kickoff",
      frameHtml(
        "Northstar tender",
        "Review evidence before making a commitment.",
        tenderRequirements.map((item) => ({
          title: item.topic,
          detail: item.answer,
          status: item.status,
        }))
      ),
      {
        scope: "My files",
        access: "private",
        recordId: "frame-tender",
        description: "Four requirements · Evidence and gaps",
      }
    ),
  ];
  const byId = new Map(files.map((file) => [file.id, file]));
  const path = (file: WorkspaceFile): string => {
    const parent = file.parentId ? byId.get(file.parentId) : undefined;
    return parent
      ? [path(parent), parent.name].filter(Boolean).join(" / ")
      : "";
  };
  const located = files.map((file) => ({ ...file, location: path(file) }));
  return located;
}
