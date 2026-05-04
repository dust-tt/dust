// Scenario data for the home-page isometric office hero. The scene engine
// in heroOfficeScene.ts is scenario-agnostic — to change the dialogue, edit
// the beats here. To swap scenarios entirely, build new Scenario values
// and update the homeScenarios array.
//
// Beat copy supports three placeholders that the engine resolves at runtime
// against the cast picked for the current run:
//   {ref}      → first name of the picked teammate (e.g. "Stanislas")
//   @{ref}     → "@" + first name              (e.g. "@Stanislas")
//   {ToolName} → inline tool chip via the chat-card parser (Slack, HubSpot…)
// `ref` matches one of the cast slot keys ("lisa", "jordan", …). Literal
// mentions like "@LeadQual" are not cast refs and pass through as-is. Tool
// chips are rendered as styled inline pills — only the ToolName must match
// the regex `[^}]+` (so multi-word brands like "Google Workspace" work).

import type { RoomKey } from "@app/components/home/content/Product/heroOfficeFloor";

export type { RoomKey };

export interface AgentDef {
  /** SVG element id, e.g. "a1". Beats reference agents by this id. */
  id: string;
  startRoom: RoomKey;
  /** Floating chip label (e.g. "@LeadQual"). Also rendered as the chat-card name. */
  label: string;
  /** Subtitle shown below the name in the agent's chat card. */
  cardRole: string;
  /** Inline SVG markup (24x24 viewBox) for the floor avatar's glyph. The
   *  agent builder injects this inside a stroked group on the blue disc.
   *  Pick a mark that reflects what the agent does in its scenario. */
  iconSvg: string;
  /** Optional pre-rendered image (PNG/SVG) used INSTEAD of the disc + iconSvg.
   *  When set, the floor avatar and chat-card avatar render this image as
   *  the entire mark — useful for full-color illustrated agents. */
  iconImage?: string;
}

// 24x24 viewBox glyphs used as the floor avatar mark for each agent. Stroke
// + linecap/linejoin are inherited from the parent <g>, so each path can be
// stroke-only (white). Solid dots can override with fill="#FFFFFF" stroke="none".
const ICON_TARGET = `
  <circle cx="12" cy="12" r="9"/>
  <circle cx="12" cy="12" r="5"/>
  <circle cx="12" cy="12" r="1.6" fill="#FFFFFF" stroke="none"/>
`;
const ICON_GIT_BRANCH = `
  <line x1="6" y1="3" x2="6" y2="15"/>
  <circle cx="18" cy="6" r="3"/>
  <circle cx="6" cy="18" r="3"/>
  <path d="M18 9a9 9 0 0 1-9 9"/>
`;
const ICON_WRENCH = `
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
`;
const ICON_ZAP = `
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
`;
const ICON_CLIPBOARD_CHECK = `
  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
  <rect x="9" y="3" width="6" height="3" rx="1"/>
  <polyline points="9 13 11 15 15 11"/>
`;
const ICON_ROCKET = `
  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
  <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
`;
const ICON_PEN = `
  <path d="M12 20h9"/>
  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
`;
const ICON_SPARKLE = `
  <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/>
  <circle cx="19" cy="19" r="0.9" fill="#FFFFFF" stroke="none"/>
  <circle cx="5" cy="19" r="0.9" fill="#FFFFFF" stroke="none"/>
`;

export interface CastSlot {
  ref: string;
  startRoom: RoomKey;
  role: string;
}

export interface Reaction {
  from: string;
  emoji: string;
  at: number;
}

export type Beat =
  | {
      type: "person";
      ref: string;
      msg: string;
      holdMs?: number;
      maxChars?: number;
      reactions?: Reaction[];
    }
  | {
      type: "agent";
      agentId: string;
      msg: string;
      holdMs?: number;
      maxChars?: number;
      reactions?: Reaction[];
    }
  | {
      type: "walkTo";
      agentId: string;
      ref: string;
      offsetX?: number;
      offsetY?: number;
    }
  | { type: "walkHome"; agentId: string }
  | { type: "pause"; ms: number };

export interface Scenario {
  agents: AgentDef[];
  cast: CastSlot[];
  beats: Beat[];
  loopGapMs?: number;
}

// ---------------------------------------------------------------------------
// Scenario 1: Sales Qualification — Lisa (RevOps), Marco/Yuki (AEs), LeadQual
// ---------------------------------------------------------------------------

const salesScenario: Scenario = {
  agents: [
    {
      id: "a1",
      startRoom: "office-t",
      label: "@LeadQual",
      cardRole: "Agent · Sales",
      iconSvg: ICON_TARGET,
      iconImage: "/static/landing/home/agent-leadqual.png",
    },
  ],
  cast: [
    { ref: "lisa", startRoom: "office-d", role: "RevOps Lead" },
    { ref: "marco", startRoom: "office-t", role: "AE · Sales" },
    { ref: "yuki", startRoom: "office-c", role: "AE · Sales" },
  ],
  beats: [
    {
      type: "person",
      ref: "lisa",
      msg: "Just shipped v2 of @LeadQual — pulls live usage data from {Snowflake} and cross-references with our ICP scoring in {HubSpot}. Let me know if anything feels off.",
      holdMs: 5400,
      reactions: [
        { from: "marco", emoji: "👍", at: 3600 },
        { from: "yuki", emoji: "🚀", at: 4400 },
        { from: "marco", emoji: "👀", at: 5100 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "marco",
      msg: "@{lisa} does it handle multi-product accounts now?",
      holdMs: 3200,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "lisa",
      msg: "Yep, fixed. Scores per product line and rolls up into a composite.",
      holdMs: 3800,
      reactions: [{ from: "marco", emoji: "✅", at: 2800 }],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "marco",
      msg: "@LeadQual can you qualify Meridian Health? They just booked a demo for Thursday.",
      holdMs: 3800,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a1", ref: "marco", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a1",
      msg: [
        "Here's what I found on **Meridian Health**:",
        "* **ICP score:** 87/100 — mid-market healthcare, 340 employees.",
        "* **Intent:** pricing page 6× this month, downloaded the security whitepaper.",
        "* **Usage:** trial — 14 active users, 3 agents built. Top agent is a compliance FAQ bot.",
        "* **Champion:** likely Priya Nair (Head of IT Ops) — built 2 of the 3 agents.",
        "* **Risk:** no executive sponsor identified yet.",
        "> Strong fit. Suggest looping in Priya's VP before the demo. Want me to draft a pre-meeting brief?",
      ].join("\n"),
      holdMs: 7200,
      maxChars: 46,
      reactions: [
        { from: "marco", emoji: "🔥", at: 5200 },
        { from: "yuki", emoji: "🎯", at: 6000 },
        { from: "lisa", emoji: "🔥", at: 6700 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "marco",
      msg: "Yes please. And flag this in {Slack} #sales-pipeline.",
      holdMs: 3200,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a1",
      msg: "Done. Brief posted to the Meridian Health project. Flagged in {Slack} #sales-pipeline with summary.",
      holdMs: 4000,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "yuki",
      msg: "@{marco} I worked with Meridian's VP of Ops at my last company — happy to make a warm intro.",
      holdMs: 4400,
      reactions: [
        { from: "marco", emoji: "❤️", at: 3000 },
        { from: "lisa", emoji: "❤️", at: 3700 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "marco",
      msg: "@{yuki} that would be incredible. Sending you the brief now.",
      holdMs: 3800,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "lisa",
      msg: "Agent does the research, humans do the relationships. 🤝",
      holdMs: 4400,
      reactions: [
        { from: "marco", emoji: "💯", at: 2800 },
        { from: "yuki", emoji: "💯", at: 3400 },
        { from: "marco", emoji: "🤝", at: 4000 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a1" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

// ---------------------------------------------------------------------------
// Scenario 2: Customer Support — Jordan (Support Ops), Sam/Priya/Alex (CS),
// TicketRouter, ProductExpert
// ---------------------------------------------------------------------------

const supportScenario: Scenario = {
  agents: [
    {
      id: "a2",
      startRoom: "office-bl",
      label: "@TicketRouter",
      cardRole: "Agent · Support",
      iconSvg: ICON_GIT_BRANCH,
      iconImage: "/static/landing/home/agent-ticketrouter.png",
    },
    {
      id: "a3",
      startRoom: "office-d",
      label: "@ProductExpert",
      cardRole: "Agent · Engineering",
      iconSvg: ICON_WRENCH,
      iconImage: "/static/landing/home/agent-productexpert.png",
    },
  ],
  cast: [
    { ref: "jordan", startRoom: "office-bl", role: "Support Ops" },
    { ref: "sam", startRoom: "office-t", role: "Customer Success" },
    { ref: "priya", startRoom: "office-c", role: "Customer Success" },
    { ref: "alex", startRoom: "office-d", role: "Customer Success" },
  ],
  beats: [
    {
      type: "person",
      ref: "jordan",
      msg: "Heads up: @TicketRouter now hands off to @ProductExpert when it detects a bug pattern across 3+ tickets. No more manual escalation for repeat issues.",
      holdMs: 5400,
      reactions: [
        { from: "sam", emoji: "🎉", at: 3500 },
        { from: "priya", emoji: "🙏", at: 4200 },
        { from: "alex", emoji: "🎉", at: 4900 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "sam",
      msg: "@{jordan} finally. I spent half of Monday chasing an eng answer for a {Salesforce} sync issue that turned out to be a known bug.",
      holdMs: 4600,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "jordan",
      msg: "Exactly why I built this.",
      holdMs: 2400,
      reactions: [{ from: "sam", emoji: "💜", at: 1800 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "sam",
      msg: "@TicketRouter customer is asking why their data sync keeps failing on the {Salesforce} connector. Ticket #4891 in {Zendesk}.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a2", ref: "sam", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a2",
      msg: "This matches **4 other tickets** this week. Pulling in @ProductExpert for deeper analysis.",
      holdMs: 4000,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a3", ref: "sam", offsetX: -60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a3",
      msg: [
        "Found it. A change to the {Salesforce} OAuth refresh logic shipped Tuesday ({GitHub} commit a4f29c) — token rotation window shortened from 30min to 5min, causing race conditions during large syncs.",
        "Engineering is aware — fix is in {GitHub} PR #2847, expected to ship today.",
        "Suggested response:",
        '> "We\'ve identified the root cause: a recent update to our Salesforce connector is causing sync interruptions for large datasets. A fix is shipping today — syncs will resume automatically."',
      ].join("\n"),
      holdMs: 8000,
      maxChars: 50,
      reactions: [
        { from: "sam", emoji: "👀", at: 5500 },
        { from: "priya", emoji: "🙌", at: 6200 },
        { from: "alex", emoji: "🙌", at: 6900 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "sam",
      msg: "Sending now. @{priya} @{alex} — same root cause, fix is shipping today.",
      holdMs: 4000,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "priya",
      msg: "My customer emailed me three times about this. Sending the update now.",
      holdMs: 4000,
      reactions: [{ from: "sam", emoji: "😅", at: 2800 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "alex",
      msg: "Already sent. @{jordan} this just saved three of us at least an hour each.",
      holdMs: 4000,
      reactions: [{ from: "jordan", emoji: "💯", at: 3000 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "jordan",
      msg: "I'll add a {Slack} notification so you all get pinged automatically when @TicketRouter detects a cluster like this.",
      holdMs: 5000,
      reactions: [
        { from: "sam", emoji: "🚀", at: 3200 },
        { from: "priya", emoji: "🚀", at: 3700 },
        { from: "alex", emoji: "🚀", at: 4200 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a2" },
    { type: "walkHome", agentId: "a3" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

// ---------------------------------------------------------------------------
// Scenario 3: Engineering / Incident Response — Aisha (Platform Ops),
// Derek/Ren/Maya (Engineers), Incident
// ---------------------------------------------------------------------------

const engineeringScenario: Scenario = {
  agents: [
    {
      id: "a4",
      startRoom: "office-t",
      label: "@Incident",
      cardRole: "Agent · Ops",
      iconSvg: ICON_ZAP,
      iconImage: "/static/landing/home/agent-incident.png",
    },
  ],
  cast: [
    { ref: "aisha", startRoom: "office-t", role: "Platform Ops" },
    { ref: "derek", startRoom: "office-d", role: "On-call Engineer" },
    { ref: "ren", startRoom: "office-d", role: "Engineering Lead" },
    { ref: "maya", startRoom: "office-d", role: "Engineer" },
  ],
  beats: [
    {
      type: "person",
      ref: "aisha",
      msg: "@Incident just triggered on a {Datadog} alert — latency spike on the API gateway. Who's on call?",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a4", ref: "aisha", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a4",
      msg: [
        "🚨 **API gateway p99 latency > 2s** (normally ~200ms). Started 3 minutes ago.",
        "* On-call: @{derek}",
        "* Recent deploys: 1 deploy 22 min ago (feature flag for new billing flow)",
        "* Affected services: API gateway, billing service",
        "* Customer impact: ~12% of requests timing out",
        "@{derek} — I've opened {Slack} #inc-2026-0424. Want me to roll back the last deploy?",
      ].join("\n"),
      holdMs: 7200,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "derek",
      msg: "Let me check the billing service logs first. @Incident pull the last 15 minutes of errors from the billing service.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a4", ref: "derek", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a4",
      msg: [
        "* **847 errors** in 15 min, all TimeoutException on POST /billing/calculate",
        "* Correlates exactly with the deploy timestamp",
        "* No errors before 13:06 UTC",
        "High confidence the billing deploy introduced the regression.",
      ].join("\n"),
      holdMs: 6400,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "derek",
      msg: "Roll it back.",
      holdMs: 2400,
      reactions: [
        { from: "aisha", emoji: "✅", at: 1400 },
        { from: "ren", emoji: "✅", at: 2000 },
      ],
    },
    { type: "pause", ms: 200 },
    {
      type: "agent",
      agentId: "a4",
      msg: [
        "✅ Rollback initiated. Latency recovering. Monitoring for 10 minutes and posting to {StatusPage}.",
        "Draft:",
        '> "We experienced elevated API latency between 13:06–13:19 UTC. The issue has been identified and resolved. No data was lost. Full postmortem to follow."',
      ].join("\n"),
      holdMs: 6400,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    { type: "person", ref: "aisha", msg: "Approved. Post it.", holdMs: 2400 },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "ren",
      msg: "@{derek} was this the billing refactor from Tuesday's sprint? I think @{maya} authored that PR.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "derek",
      msg: "Yep, {GitHub} PR #2201. Feature flag defaulted to on in production — config issue, not code.",
      holdMs: 4600,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "maya",
      msg: "I tested it with the flag off in staging. The env config didn't propagate. Fixing the default and adding a config check to CI.",
      holdMs: 5200,
      reactions: [
        { from: "aisha", emoji: "💪", at: 3600 },
        { from: "ren", emoji: "💪", at: 4200 },
        { from: "derek", emoji: "💪", at: 4800 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "aisha",
      msg: "@{maya} that's why we have the rollback flow. 13 minutes customer-facing impact. @Incident — add Maya's CI check to the postmortem.",
      holdMs: 5200,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a4",
      msg: "Added. Postmortem draft in {Slack} #inc-2026-0424 within the hour.",
      holdMs: 3800,
      reactions: [
        { from: "aisha", emoji: "👍", at: 2400 },
        { from: "derek", emoji: "👍", at: 2800 },
        { from: "ren", emoji: "👍", at: 3200 },
        { from: "maya", emoji: "👍", at: 3500 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a4" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

// ---------------------------------------------------------------------------
// Scenario 4A: Knowledge — Onboarding (Nora, Clara, Kai, Tom + OnboardGuide)
// ---------------------------------------------------------------------------

const onboardingScenario: Scenario = {
  agents: [
    {
      id: "a5",
      startRoom: "office-c",
      label: "@OnboardGuide",
      cardRole: "Agent · People",
      iconSvg: ICON_CLIPBOARD_CHECK,
      iconImage: "/static/landing/home/agent-onboardguide.png",
    },
  ],
  cast: [
    { ref: "nora", startRoom: "office-c", role: "People Ops Lead" },
    { ref: "clara", startRoom: "office-d", role: "Design Manager" },
    { ref: "kai", startRoom: "office-d", role: "Product Designer" },
    { ref: "tom", startRoom: "office-t", role: "Senior Designer" },
  ],
  beats: [
    {
      type: "person",
      ref: "nora",
      msg: "Welcome to the team @{kai}! I've set up @OnboardGuide to walk you through your first two weeks. It knows our policies, your team's setup, and your onboarding checklist. Ask it anything.",
      holdMs: 5800,
      reactions: [
        { from: "clara", emoji: "🎉", at: 3600 },
        { from: "tom", emoji: "🎉", at: 4200 },
        { from: "kai", emoji: "👋", at: 4800 },
        { from: "clara", emoji: "👋", at: 5400 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "clara",
      msg: "@{kai} welcome!! Don't hesitate to ping me anytime, but @OnboardGuide will probably answer faster 😄",
      holdMs: 4800,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "kai",
      msg: "Thank you both!! @OnboardGuide what should I focus on today?",
      holdMs: 3600,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a5", ref: "kai", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a5",
      msg: [
        "Welcome @{kai}! 🎉 Here's your **Day 1 checklist**:",
        "* Accept {Google Workspace} invite ✅",
        '* Set up {Figma} — your team uses the "Product Design" workspace.',
        "* Read the Design System principles doc (15 min). Tl;dr: atomic design, shared component library, Friday reviews.",
        "* Say hi in {Slack} #design-team — @{clara} usually posts a welcome thread.",
        "* Your first 1:1 with @{clara} is tomorrow at 10am.",
      ].join("\n"),
      holdMs: 8000,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "kai",
      msg: "What's the PTO policy? And who do I talk to about a monitor for my home office?",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a5",
      msg: [
        "**PTO:** Unlimited with a 15-day minimum. Manager approval for 3+ consecutive days. Full policy in the People Handbook (section 4.2).",
        "**Equipment:** Post in {Slack} #it-requests. €500 budget for home office peripherals, pre-approved. @{nora} can help with anything outside the standard list.",
      ].join("\n"),
      holdMs: 6800,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "nora",
      msg: "All correct. Standing desk is a separate budget — just DM me.",
      holdMs: 3800,
      reactions: [{ from: "kai", emoji: "✅", at: 2800 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "tom",
      msg: "@{kai} grab 20 min on my calendar this week — I'll walk you through the component library live.",
      holdMs: 4800,
      reactions: [
        { from: "kai", emoji: "❤️", at: 3200 },
        { from: "clara", emoji: "❤️", at: 3800 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "kai",
      msg: "@{tom} booking now! This is the smoothest first day I've ever had.",
      holdMs: 4200,
      reactions: [
        { from: "nora", emoji: "🥹", at: 2800 },
        { from: "clara", emoji: "💜", at: 3300 },
        { from: "tom", emoji: "💜", at: 3800 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "clara",
      msg: "@{nora} whatever you did with @OnboardGuide, every team should have this.",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "nora",
      msg: "Working on it. Rolling out to Eng and Sales next month. 🚀",
      holdMs: 3800,
      reactions: [
        { from: "clara", emoji: "🔥", at: 2400 },
        { from: "kai", emoji: "🔥", at: 2800 },
        { from: "tom", emoji: "🔥", at: 3200 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a5" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

// ---------------------------------------------------------------------------
// Scenario 4B: Knowledge — Org navigation (Kai, Clara, Tom, Nora + Dust)
// ---------------------------------------------------------------------------

const orgNavScenario: Scenario = {
  agents: [
    {
      id: "a8",
      startRoom: "office-c",
      label: "@Dust",
      cardRole: "Agent · Knowledge",
      iconSvg: ICON_SPARKLE,
      iconImage: "/static/landing/home/agent-dust.png",
    },
  ],
  cast: [
    { ref: "kai", startRoom: "office-d", role: "Product Designer" },
    { ref: "clara", startRoom: "office-d", role: "Design Manager" },
    { ref: "tom", startRoom: "office-t", role: "Senior Designer" },
    { ref: "nora", startRoom: "office-c", role: "People Ops Lead" },
  ],
  beats: [
    {
      type: "person",
      ref: "clara",
      msg: "@{kai} — @Dust has full context on our {Slack} channels, {Notion} spaces, and {Gmail} threads. Best way to get up to speed fast.",
      holdMs: 5000,
      reactions: [
        { from: "kai", emoji: "👋", at: 3200 },
        { from: "tom", emoji: "👋", at: 3800 },
        { from: "nora", emoji: "👋", at: 4400 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "kai",
      msg: "@Dust I'm already in 40+ Slack channels. What should I actually be paying attention to?",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a8", ref: "kai", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a8",
      msg: [
        "Based on your role and recent activity across {Slack}, {Notion}, and {Gmail}:",
        "**Follow closely:**",
        "* #design-critique — main async review space, daily activity",
        "* #product-design-eng — where design/eng handoffs get decided. You're already referenced in two open threads.",
        "* #launches — Design owns the visual QA checklist. You have an open item.",
        "**Safe to mute:** #general-announcements, #office-random",
        "**{Notion}:** Design System (updated last week) and Q2 Roadmap (3 new briefs Monday).",
      ].join("\n"),
      holdMs: 8400,
      maxChars: 50,
      reactions: [
        { from: "kai", emoji: "🎯", at: 6200 },
        { from: "tom", emoji: "👆", at: 6800 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "kai",
      msg: "I want to share an update on the onboarding flow redesign — where should I post it?",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a8",
      msg: "Post in {Slack} #product-design-eng — that's where the thread is active and @{tom} has been waiting on an update. Cross-post to #product-updates for broader visibility.",
      holdMs: 5200,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "tom",
      msg: "@{kai} exactly right. That thread's been waiting on you.",
      holdMs: 3600,
      reactions: [{ from: "kai", emoji: "✅", at: 2600 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "clara",
      msg: "@{kai} this is why I stopped writing onboarding docs. @Dust just knows. 😄",
      holdMs: 4200,
      reactions: [
        { from: "kai", emoji: "😄", at: 2800 },
        { from: "tom", emoji: "😄", at: 3300 },
        { from: "nora", emoji: "😄", at: 3800 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "nora",
      msg: "Rolling this out to every new hire next month.",
      holdMs: 3800,
      reactions: [
        { from: "clara", emoji: "🔥", at: 2400 },
        { from: "kai", emoji: "🔥", at: 2900 },
        { from: "tom", emoji: "🔥", at: 3400 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a8" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

// ---------------------------------------------------------------------------
// Scenario 5: Marketing — Théo (Marketing Ops), Eva (Content), Marco (AE),
// Sophie (SDR), LaunchOps, ContentWriter
// ---------------------------------------------------------------------------

const marketingScenario: Scenario = {
  agents: [
    {
      id: "a6",
      startRoom: "office-c",
      label: "@LaunchOps",
      cardRole: "Agent · Marketing",
      iconSvg: ICON_ROCKET,
      iconImage: "/static/landing/home/agent-launchops.png",
    },
    {
      id: "a7",
      startRoom: "office-c",
      label: "@ContentWriter",
      cardRole: "Agent · Marketing",
      iconSvg: ICON_PEN,
      iconImage: "/static/landing/home/agent-contentwriter.png",
    },
  ],
  cast: [
    { ref: "theo", startRoom: "office-c", role: "Marketing Ops" },
    { ref: "eva", startRoom: "office-c", role: "Content Lead" },
    { ref: "marco", startRoom: "office-t", role: "AE · Sales" },
    { ref: "sophie", startRoom: "office-t", role: "SDR" },
  ],
  beats: [
    {
      type: "person",
      ref: "theo",
      msg: "The Meridian Health case study is approved. @LaunchOps — pull from {Google Docs} and kick off the distribution workflow.",
      holdMs: 4800,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a6", ref: "theo", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a6",
      msg: [
        "On it. Based on our launch playbook:",
        "* **Blog** · full case study ✅ Ready",
        "* {LinkedIn} · short-form post + pull quote 🔄 Drafting",
        "* {HubSpot} · newsletter snippet 🔄 Drafting",
        "* **Sales enablement** · one-pager + talk track ⏳ Pending",
        "* {Slack} **#wins** · internal announcement ⏳ Pending",
        "@ContentWriter — can you adapt the case study into a one-pager for sales?",
      ].join("\n"),
      holdMs: 8400,
      maxChars: 50,
      reactions: [
        { from: "theo", emoji: "👍", at: 5500 },
        { from: "eva", emoji: "👍", at: 6200 },
      ],
    },
    { type: "pause", ms: 400 },
    { type: "walkTo", agentId: "a7", ref: "theo", offsetX: -60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a7",
      msg: 'One-pager ready. Key stats: **40h/week saved, 3 agents built by CS team, cross-team adoption** (CS + Sales). Talk track includes objection handling for "we already use ChatGPT." Posted to the Sales Enablement project.',
      holdMs: 6400,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "eva",
      msg: "@LaunchOps show me the {LinkedIn} draft.",
      holdMs: 2800,
    },
    { type: "pause", ms: 200 },
    {
      type: "agent",
      agentId: "a6",
      msg: "\"Meridian Health's CS team went from spending 45 minutes investigating each technical question to getting verified answers in under 2 minutes. They didn't hire more people — they built 3 specialized agents connected directly to their codebase, customer data, and product docs. Here's how →\"\nIncludes the Priya Nair quote. Want me to adjust tone or length?",
      holdMs: 7200,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "eva",
      msg: "Shorter. Lead with the time saved, not the team name.",
      holdMs: 3200,
    },
    { type: "pause", ms: 200 },
    {
      type: "agent",
      agentId: "a6",
      msg: '"From 45 minutes to 2. That\'s how fast a CS team now gets verified technical answers — not by hiring, but by building 3 AI agents connected to their own codebase and customer data."',
      holdMs: 5400,
      reactions: [
        { from: "eva", emoji: "🔥", at: 3800 },
        { from: "theo", emoji: "🔥", at: 4200 },
        { from: "marco", emoji: "🔥", at: 4600 },
      ],
    },
    { type: "pause", ms: 400 },
    { type: "person", ref: "eva", msg: "Ship it. 🚀", holdMs: 2400 },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "marco",
      msg: "Love this. Can I send the one-pager to my healthcare accounts in pipeline?",
      holdMs: 4200,
      reactions: [
        { from: "eva", emoji: "👀", at: 2800 },
        { from: "theo", emoji: "👀", at: 3300 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "theo",
      msg: '@{marco} already in the Sales Enablement project — @ContentWriter added a talk track for the "we already use ChatGPT" objection.',
      holdMs: 5000,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "marco",
      msg: "Literally had that conversation yesterday.",
      holdMs: 2800,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "sophie",
      msg: "Used the one-pager in an outbound sequence this morning. Already got a reply asking for a demo. 👀",
      holdMs: 4400,
      reactions: [
        { from: "marco", emoji: "🎯", at: 2800 },
        { from: "eva", emoji: "🎯", at: 3200 },
        { from: "theo", emoji: "🔥", at: 3600 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "eva",
      msg: "Already?? This is why I need to hire another content person.",
      holdMs: 4000,
      reactions: [
        { from: "sophie", emoji: "😂", at: 2800 },
        { from: "marco", emoji: "😂", at: 3200 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "theo",
      msg: "Content ships, agents distribute, humans close. ☕",
      holdMs: 4200,
      reactions: [
        { from: "eva", emoji: "💯", at: 2800 },
        { from: "marco", emoji: "💯", at: 3200 },
        { from: "sophie", emoji: "💯", at: 3600 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a6" },
    { type: "walkHome", agentId: "a7" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

/** Ordered list of scenarios. The engine picks a random starting index on
 *  page load, then plays the rest sequentially in array order, looping
 *  forever. */
export const homeScenarios: Scenario[] = [
  salesScenario,
  supportScenario,
  engineeringScenario,
  onboardingScenario,
  orgNavScenario,
  marketingScenario,
];

// Kept for any external imports (the original single-scenario export name).
export { salesScenario as qualBotScenario };
