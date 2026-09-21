import { createHash } from "node:crypto";

export type TagDefinition = { id: string; description: string };

export type Facet = {
  id: string;
  label: string;
  description: string;
  min: number;
  max: number;
  // Relative weight of the facet in tag similarity. Zero excludes the facet from similarity.
  weight: number;
  tags: TagDefinition[];
};

export const TAXONOMY_VERSION = 1;

/**
 * @cc [owner:aubin-tchoi,label:product] closed-taxonomy
 * Every tag assigned to a skill must be one of the tag IDs declared below, under its facet. Facet
 * and tag IDs are lowercase kebab-case and unique within their facet. Changing any facet or tag
 * changes `taxonomyHash()`, which invalidates saved tags.
 */
export const FACETS: Facet[] = [
  {
    id: "function",
    label: "Function",
    description:
      "The business function the skill serves, i.e. which team would own it. Primary first.",
    min: 1,
    max: 2,
    weight: 1,
    tags: [
      {
        id: "sales",
        description:
          "New business and expansion revenue: prospects, outbound, deals, pipeline, forecasts, demos, pricing proposals, sales coaching, CRM deal hygiene, RevOps analytics.",
      },
      {
        id: "customer-success",
        description:
          "Post-sale account management: onboarding after signature, adoption, business reviews, renewals and risk, customer usage or credit analyses, customer pods, handoffs from sales.",
      },
      {
        id: "support",
        description:
          "Support threads, customer bug reports, known issues and policies, support analytics, support runbooks.",
      },
      {
        id: "partnerships",
        description:
          "Partner ecosystem: partner records, partner briefings, partner journey, co-selling, partner communications.",
      },
      {
        id: "marketing",
        description:
          "Content, brand voice, SEO, ads, campaigns, webinars, community, positioning, product marketing copy, social listening.",
      },
      {
        id: "product",
        description:
          "Roadmap, product feedback and initiatives, changelog and shipped-feature communications, product rituals, specs, product metrics frameworks.",
      },
      {
        id: "engineering",
        description:
          "Code, pull requests, incidents, observability, infrastructure and internal platform APIs, engineering on-call.",
      },
      {
        id: "design",
        description:
          "Visual and UI/UX design quality, aesthetics, design references, frontend interface craft, brand visual identity systems.",
      },
      {
        id: "people-talent",
        description:
          "Hiring, sourcing, interviews, candidate evaluation, HR data, performance reviews, employee engagement, new-joiner onboarding.",
      },
      {
        id: "finance",
        description:
          "Invoicing, collections, billing systems, revenue reporting, finance dashboards, consumption reconciliation.",
      },
      {
        id: "legal-compliance",
        description:
          "Contracts and NDAs, security questionnaires, GRC, compliance, security testing.",
      },
      {
        id: "workplace-it",
        description:
          "Office logistics, IT administration, visitor management, internal tooling administration, out-of-office tracking.",
      },
      {
        id: "team-management",
        description:
          "Company or team operating rituals: goals and updates, priorities alignment, stack-rank or review meetings, 1:1s, coaching synthesis, decision memos, weekly presentations.",
      },
      {
        id: "personal-productivity",
        description:
          "One person's own inbox, calendar, tasks, briefings, notes, and personal operating system.",
      },
      {
        id: "general",
        description:
          "Function-agnostic helpers usable by anyone: writing utilities, explainers, diagrams, formatting modes, thinking partners, learning aids.",
      },
    ],
  },
  {
    id: "task",
    label: "Task",
    description: "The kind of work the skill performs. Primary first.",
    min: 1,
    max: 3,
    weight: 1,
    tags: [
      {
        id: "draft-content",
        description:
          "Write new text from scratch or from inputs: emails, posts, scripts, copy, docs, announcements, job descriptions.",
      },
      {
        id: "edit-rewrite",
        description:
          "Transform existing text: rewrite, polish, apply a tone or style, humanize, translate, compress, reformat.",
      },
      {
        id: "review-critique",
        description:
          "Evaluate or score a piece of work, a call, a document, code, or an answer, and return findings or a verdict.",
      },
      {
        id: "summarize-recap",
        description:
          "Condense a transcript, thread, video, or document into notes, minutes, or a recap.",
      },
      {
        id: "digest-briefing",
        description:
          "Periodic multi-source roundups: morning or end-of-day briefings, weekly wins, news digests, inbox catch-ups, merged-PR digests.",
      },
      {
        id: "research-lookup",
        description:
          "Find and retrieve information about entities: people, companies, contacts, records, facts, logos, schedules, prior artifacts.",
      },
      {
        id: "analyze-report",
        description:
          "Quantitative or qualitative analysis producing findings, metrics, reports, forecasts, scorecards, or reconciliations.",
      },
      {
        id: "classify-triage",
        description:
          "Categorize, qualify, prioritize, score, or route items against criteria: emails, deals, companies, feedback, threads.",
      },
      {
        id: "plan-prepare",
        description:
          "Prepare for an upcoming event or engagement: meeting prep, demo plans, success plans, agendas, strategies, handoffs.",
      },
      {
        id: "build-visual",
        description:
          "Produce visual artifacts: Frames, dashboards, slide decks, one-pagers, diagrams, images, web pages, branded assets.",
      },
      {
        id: "record-update",
        description:
          "Create or update records in a system of record: CRM fields, Notion cards or pages, Pod tasks and files, tickets, calendar events, orders.",
      },
      {
        id: "notify-post",
        description:
          "Deliver messages to people or channels: Slack posts, DMs, announcements, reminders, sends of drafted emails.",
      },
      {
        id: "orchestrate-workflow",
        description:
          "Run a multi-step end-to-end workflow that coordinates sub-skills or several stages with checkpoints or approvals.",
      },
      {
        id: "monitor-automate",
        description:
          "Run on triggers, schedules, or wake-ups to scan sources, detect changes, and act without a user request.",
      },
      {
        id: "coach-advise",
        description:
          "Coach, challenge, or advise the user: stress-test thinking, interview them, teach or explain, recommend options.",
      },
      {
        id: "code-develop",
        description:
          "Write or change code, open pull requests, debug, investigate logs, or run technical investigations.",
      },
      {
        id: "extract-structure",
        description:
          "Pull structured fields or items out of unstructured sources: transcripts, images, documents, feedback, spreadsheets.",
      },
      {
        id: "reference-knowledge",
        description:
          "Provide standing knowledge or rules the agent must apply: company context, glossaries, playbooks, style or brand rules, taxonomies, data dictionaries, templates.",
      },
    ],
  },
  {
    id: "subject",
    label: "Subject",
    description:
      "The main entity or object the skill works on or produces knowledge about. Primary first.",
    min: 1,
    max: 3,
    weight: 1.2,
    tags: [
      {
        id: "customer-account",
        description:
          "A customer or prospect company treated as an account: context, health, ownership, stakeholder maps, account plans.",
      },
      {
        id: "deal-pipeline",
        description:
          "Deals, pipeline stages, forecasts, quota and sales performance, CRM deal hygiene.",
      },
      {
        id: "prospect-contact",
        description:
          "Leads, people, and contacts to find, enrich, qualify, or reach out to; outreach sequences and campaigns.",
      },
      {
        id: "pilot-poc",
        description:
          "Pilots, proofs of concept, success plans and criteria, pilot status and pilot workspaces.",
      },
      {
        id: "partner",
        description: "Partner organizations, partner records, and partner programs.",
      },
      {
        id: "call-meeting",
        description:
          "Call transcripts, meetings, 1:1s, interviews as events, calendar events and their follow-ups.",
      },
      {
        id: "email-inbox",
        description: "Emails, inbox management, email threads and replies.",
      },
      {
        id: "candidate-hiring",
        description:
          "Candidates, roles and openings, interviews as assessments, hiring pipelines, headcount plans.",
      },
      {
        id: "employee-team",
        description:
          "Employees and teammates: performance, onboarding, engagement, team goals and updates, rosters, schedules.",
      },
      {
        id: "dust-agents-skills",
        description:
          "Dust agents and skills as configured objects: inventories, audits, optimization, setup guides, demo agents.",
      },
      {
        id: "credits-usage-billing",
        description:
          "Workspace credit consumption, seats, fair use, usage metrics, billing, invoices, pricing and plans.",
      },
      {
        id: "product-feedback-roadmap",
        description:
          "Feature requests, customer feedback, product initiatives, roadmap, changelog, shipped features, specs.",
      },
      {
        id: "code-repository",
        description: "Source code, pull requests, issues, repositories, coding rules.",
      },
      {
        id: "incident-observability",
        description:
          "Production incidents, logs, monitors, alerts, workflow executions, system health.",
      },
      {
        id: "support-ticket",
        description: "Support threads, tickets, known issues, support policies, support backlog.",
      },
      {
        id: "brand-identity",
        description:
          "A brand's visual identity: palettes, logos, typography, layout rules, branded templates.",
      },
      {
        id: "written-content",
        description:
          "Text as the object of work: blog posts, articles, emails as prose, copy, documentation, notes, any draft to write or polish.",
      },
      {
        id: "company-strategy-priorities",
        description:
          "Company priorities, strategy documents, operating principles, decisions and decision memos, initiatives backlog.",
      },
      {
        id: "market-competition",
        description:
          "Competitors, battlecards, market and industry intelligence, industry classification, AI or tech news.",
      },
      {
        id: "marketing-campaign-channel",
        description:
          "Marketing channels and campaigns: SEO, ads, app store listings, analytics tracking, webinars, community, landing pages.",
      },
      {
        id: "business-metrics",
        description:
          "Company data and metrics in the warehouse or analytics tools: revenue, usage, product events, funnels.",
      },
      {
        id: "tasks-todos",
        description:
          "Task lists, todos, commitments, follow-ups, reminders, and their triage.",
      },
      {
        id: "pod-workspace",
        description:
          "Dust Pods as workspaces: creating, populating, structuring, and maintaining Pods and their banners.",
      },
      {
        id: "dust-frames-apps",
        description:
          "Dust Frames and Frame apps as a technology: building, scaffolding, multiplayer, exporting, banner sizing.",
      },
      {
        id: "dust-product-knowledge",
        description:
          "The Dust product itself: features, how it works, help, public docs, demo use cases, product positioning.",
      },
      {
        id: "legal-security-document",
        description:
          "Contracts, NDAs, security questionnaires, compliance matrices, sandbox security.",
      },
      {
        id: "office-logistics",
        description: "Office orders, visitor invites, restaurants, out-of-office tracking, admin logistics.",
      },
      {
        id: "ideas-decisions",
        description:
          "The user's own ideas, plans, arguments, and decisions as material to sharpen, stress-test, or organize.",
      },
      {
        id: "learning-course",
        description: "Courses, lessons, exercises, quizzes, and educational explanations.",
      },
      {
        id: "other",
        description: "No listed subject fits.",
      },
    ],
  },
  {
    id: "output",
    label: "Output",
    description: "The primary form of the deliverable. Primary first.",
    min: 1,
    max: 2,
    weight: 0.6,
    tags: [
      { id: "frame-dashboard", description: "An interactive Dust Frame, dashboard, or Frame app." },
      { id: "slides-deck", description: "A PowerPoint, Google Slides, or PDF slide deck." },
      { id: "email-draft", description: "An email draft or sequence." },
      { id: "slack-message", description: "A Slack message, thread, DM, or announcement." },
      { id: "notion-page", description: "A Notion page, card, or database entry." },
      {
        id: "document-text",
        description:
          "Text delivered in the conversation or as a file: notes, memos, reports, articles, scripts, markdown.",
      },
      { id: "crm-record", description: "Created or updated CRM records or fields." },
      { id: "pod-content", description: "Pod tasks, notes, files, or a new Pod." },
      { id: "github-issue-pr", description: "A GitHub issue, pull request, or review." },
      {
        id: "structured-data",
        description: "JSON, CSV, tables, spreadsheets, or other machine-readable data.",
      },
      { id: "image-media", description: "Images, portraits, diagrams, videos, or other media." },
      { id: "code", description: "Code, components, web pages, or scripts outside Frames." },
      {
        id: "chat-answer",
        description:
          "A direct conversational answer, short lookup result, classification, or assessment with no separate artifact.",
      },
      {
        id: "external-system-action",
        description:
          "A side effect in an external system: an order, an invite, a sent notification, an API mutation.",
      },
    ],
  },
  {
    id: "systems",
    label: "Systems",
    description:
      "External or internal systems the skill actually reads from or writes to. Only list systems it uses, not ones merely mentioned. Empty when none.",
    min: 0,
    max: 6,
    weight: 0.5,
    tags: [
      { id: "hubspot", description: "HubSpot CRM." },
      { id: "snowflake", description: "Snowflake data warehouse." },
      { id: "slack", description: "Slack channels, threads, DMs." },
      { id: "gmail", description: "Gmail or email mailbox." },
      { id: "google-calendar", description: "Google Calendar." },
      { id: "google-drive-sheets", description: "Google Drive, Docs, or Sheets." },
      { id: "notion", description: "Notion pages and databases." },
      { id: "github", description: "GitHub repositories, issues, pull requests." },
      {
        id: "call-recorder",
        description: "Meeting recorders and transcripts: Fathom, Granola, Claap, Trellus.",
      },
      { id: "linkedin", description: "LinkedIn profiles, posts, and activity." },
      {
        id: "contact-enrichment",
        description: "Contact and company enrichment providers: Apollo, Surfe, FullEnrich, Clay, Cargo.",
      },
      { id: "lemlist", description: "Lemlist outreach campaigns." },
      { id: "ashby", description: "Ashby applicant tracking." },
      { id: "hibob", description: "HiBob HR platform." },
      { id: "datadog", description: "Datadog observability." },
      { id: "temporal", description: "Temporal Cloud workflows." },
      { id: "billing-platform", description: "Stripe or Metronome billing systems." },
      { id: "plain", description: "Plain support platform." },
      { id: "posthog", description: "PostHog product analytics." },
      { id: "web-search", description: "Web search and browsing." },
      {
        id: "dust-platform",
        description:
          "Dust internal or public APIs, Poke back office, workspace administration, data source management.",
      },
      { id: "dust-pods", description: "Dust Pods files, tasks, and banners." },
      { id: "computer-sandbox", description: "The Computer sandbox or code execution." },
      { id: "agent-memory", description: "Agent memory tool." },
      { id: "x-twitter", description: "X (Twitter) API." },
      { id: "other-saas", description: "Another named SaaS or API not listed here." },
    ],
  },
  {
    id: "audience",
    label: "Audience",
    description: "Who consumes the output. Primary first.",
    min: 1,
    max: 2,
    weight: 0.4,
    tags: [
      { id: "self-personal", description: "Built for one named person's own workflow." },
      { id: "internal-team", description: "Dust employees or a team inside the company." },
      {
        id: "customer-facing",
        description:
          "Customers, prospects, partners, candidates, or the public receive the output.",
      },
    ],
  },
  {
    id: "trigger",
    label: "Trigger",
    description: "How the skill is meant to be invoked.",
    min: 1,
    max: 1,
    weight: 0.3,
    tags: [
      { id: "on-demand", description: "A user asks for it in conversation." },
      {
        id: "scheduled-automated",
        description: "Scheduled runs, wake-ups, or workflow triggers start it without a user request.",
      },
      {
        id: "sub-skill",
        description: "Designed to be called by another skill or orchestrator as one step.",
      },
      {
        id: "always-on-guideline",
        description:
          "Applies proactively as a standing rule whenever relevant, e.g. style guides, formatting modes.",
      },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    description: "Whether the skill is a real, usable skill.",
    min: 1,
    max: 1,
    weight: 0,
    tags: [
      { id: "substantive", description: "A real skill with usable instructions." },
      {
        id: "thin",
        description: "A real intent but almost no instructions, e.g. a one-line template pointer.",
      },
      {
        id: "test-placeholder",
        description: "A test, placeholder, or junk skill with no real purpose.",
      },
    ],
  },
];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"];

export function facetById(id: string): Facet {
  const facet = FACETS.find((candidate) => candidate.id === id);
  if (!facet) {
    throw new Error(`Unknown facet: ${id}`);
  }
  return facet;
}

export function tagKey(facetId: string, tagId: string): string {
  return `${facetId}:${tagId}`;
}

export function taxonomyHash(): string {
  return createHash("sha256")
    .update(JSON.stringify({ version: TAXONOMY_VERSION, facets: FACETS }))
    .digest("hex");
}
