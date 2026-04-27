// Scenario data for the home-page isometric office hero. The scene engine
// in heroOfficeScene.ts is scenario-agnostic — to change the dialogue, edit
// the beats here. To swap scenarios entirely, build new Scenario values
// and update the homeScenarios array.
//
// Beat copy supports two placeholders that the engine resolves at runtime
// against the cast picked for the current run:
//   {ref}   → first name of the picked teammate (e.g. "Stanislas")
//   @{ref}  → "@" + first name              (e.g. "@Stanislas")
// `ref` matches one of the cast slot keys ("lisa", "jordan", …). Literal
// mentions like "@QualBot" are not cast refs and pass through as-is.

import type { RoomKey } from "@app/components/home/content/Product/heroOfficeFloor";

export type { RoomKey };

export interface AgentDef {
  /** SVG element id, e.g. "a1". Beats reference agents by this id. */
  id: string;
  startRoom: RoomKey;
  /** Floating chip label (e.g. "@QualBot"). Also rendered as the chat-card name. */
  label: string;
  /** Subtitle shown below the name in the agent's chat card. */
  cardRole: string;
}

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
// Scenario 1: Sales Qualification — Lisa (RevOps), Marco/Yuki (AEs), QualBot
// ---------------------------------------------------------------------------

const qualBotScenario: Scenario = {
  agents: [
    {
      id: "a1",
      startRoom: "office-t",
      label: "@QualBot",
      cardRole: "Agent · Sales",
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
      msg: "Just shipped v2 of @QualBot. It now pulls live usage data from Snowflake and cross-references with our ICP scoring in HubSpot. Let me know if anything feels off.",
      holdMs: 5200,
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
      msg: "@{lisa} nice! Does it handle multi-product accounts now? We kept getting weird scores for companies on both plans.",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "lisa",
      msg: "Yep, fixed. It now scores **per product line** and rolls up into a composite. Try it on one of your accounts and tell me if the output makes sense.",
      holdMs: 4600,
      reactions: [{ from: "marco", emoji: "✅", at: 3200 }],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "marco",
      msg: "@QualBot can you qualify Meridian Health? They just booked a demo for Thursday.",
      holdMs: 3600,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a1", ref: "marco", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a1",
      msg: [
        "Here's what I found on **Meridian Health**:",
        "* **ICP score:** 87/100 — mid-market healthcare, 340 employees.",
        "* **Intent:** pricing page 6× this month, downloaded security whitepaper.",
        "* **Usage:** trial with 14 active users, 3 agents built. Top agent: compliance FAQ bot.",
        "* **Champion:** likely Priya Nair (Head of IT Ops) — built 2 of the 3 agents.",
        "* **Risk:** no executive sponsor identified yet.",
        "> Strong fit. Suggest looping in Priya's VP before the demo. Draft a pre-meeting brief?",
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
      msg: "Yes please. And flag this in #sales-pipeline.",
      holdMs: 3000,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a1",
      msg: "Done. Brief posted to the Meridian Health project. Flagged in #sales-pipeline with summary.",
      holdMs: 3800,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "yuki",
      msg: "@{marco} I worked with Meridian's VP of Ops at my last company. Happy to make a warm intro if that helps.",
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
      msg: "@{yuki} that would be incredible, yes please. I'll send you the brief @QualBot just put together so you have context.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "lisa",
      msg: "This is exactly the workflow I was hoping for. Agent does the research, humans do the relationships. 🤝",
      holdMs: 5000,
      reactions: [
        { from: "marco", emoji: "💯", at: 3000 },
        { from: "yuki", emoji: "💯", at: 3700 },
        { from: "marco", emoji: "🤝", at: 4400 },
      ],
    },
    { type: "pause", ms: 800 },
    { type: "walkHome", agentId: "a1" },
    { type: "pause", ms: 600 },
  ],
  loopGapMs: 2500,
};

// ---------------------------------------------------------------------------
// Scenario 2: Customer Support Escalation — Jordan (Support Ops), Sam/Priya/
// Alex (CS Reps), TicketRouter, ProductExpert
// ---------------------------------------------------------------------------

const supportEscalationScenario: Scenario = {
  agents: [
    {
      id: "a2",
      startRoom: "office-bl",
      label: "@TicketRouter",
      cardRole: "Agent · Support",
    },
    {
      id: "a3",
      startRoom: "office-d",
      label: "@ProductExpert",
      cardRole: "Agent · Engineering",
    },
  ],
  cast: [
    { ref: "jordan", startRoom: "office-bl", role: "Support Ops" },
    { ref: "sam", startRoom: "office-t", role: "CS Rep" },
    { ref: "priya", startRoom: "office-c", role: "CS Rep" },
    { ref: "alex", startRoom: "office-d", role: "CS Rep" },
  ],
  beats: [
    {
      type: "person",
      ref: "jordan",
      msg: "Heads up team: @TicketRouter now hands off to @ProductExpert when it detects a bug pattern across 3+ tickets. No more manual escalation for repeat issues.",
      holdMs: 5200,
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
      msg: "@{jordan} finally!! I spent half of Monday chasing down an eng answer for a Salesforce sync issue that turned out to be a known bug.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "jordan",
      msg: "Exactly why I built this. That pain is over. Try it next time.",
      holdMs: 3200,
      reactions: [{ from: "sam", emoji: "💜", at: 2400 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "sam",
      msg: "@TicketRouter Customer is asking why their data sync keeps failing on the Salesforce connector. Ticket #4891.",
      holdMs: 3600,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a2", ref: "sam", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a2",
      msg: "Checking… This matches **4 other tickets this week** mentioning Salesforce sync failures. Pulling in @ProductExpert for deeper analysis.",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a3", ref: "sam", offsetX: -60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a3",
      msg: [
        "Looked at the codebase and recent deploy logs. There was a change to the Salesforce OAuth refresh logic shipped Tuesday (commit a4f29c). The token rotation window was shortened from 30min to 5min, which can cause race conditions during large syncs.",
        "Engineering is aware — fix is in PR #2847, expected to ship today.",
        "Suggested response to the customer:",
        "> \"We've identified the root cause: a recent update to our Salesforce connector's authentication logic is causing sync interruptions for large datasets. A fix is shipping today. No action needed on your end — syncs will resume automatically.\"",
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
      msg: "Sending this now. @{priya} @{alex} you both had tickets on this too — same root cause, fix is shipping today.",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "priya",
      msg: "Oh thank god. My customer emailed me three times about this. Sending the update now.",
      holdMs: 4000,
      reactions: [{ from: "sam", emoji: "😅", at: 2800 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "alex",
      msg: "Same. Already sent. @{jordan} this just saved three of us at least an hour each.",
      holdMs: 4000,
      reactions: [{ from: "jordan", emoji: "💯", at: 3000 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "jordan",
      msg: "Music to my ears. I'll add a Slack notification so you all get pinged automatically when @TicketRouter detects a cluster like this.",
      holdMs: 4800,
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
// Scenario 3: Incident Response — Aisha (Platform Ops), Derek/Ren/Maya
// (Engineers), Incident agent
// ---------------------------------------------------------------------------

const incidentResponseScenario: Scenario = {
  agents: [
    {
      id: "a4",
      startRoom: "office-t",
      label: "@Incident",
      cardRole: "Agent · Ops",
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
      msg: "@Incident just got triggered by a Datadog alert. Latency spike on the API gateway. Who's on call?",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a4", ref: "aisha", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a4",
      msg: [
        "🚨 Alert received: **API gateway p99 latency > 2s** (normally ~200ms). Started 3 minutes ago.",
        "* On-call: @{derek}",
        "* Recent deploys: 1 deploy 22 min ago (feature flag for new billing flow)",
        "* Affected services: API gateway, billing service",
        "* Customer impact: ~12% of requests timing out",
        "@{derek} — I've opened an incident channel at #inc-2026-0424. Want me to roll back the last deploy?",
      ].join("\n"),
      holdMs: 7200,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "derek",
      msg: "Let me check the billing service logs first. @Incident pull the last 15 minutes of error logs from the billing service.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a4", ref: "derek", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a4",
      msg: [
        "Here's the summary:",
        "* **847 errors** in the last 15 min, all TimeoutException on POST /billing/calculate",
        "* Correlates exactly with the deploy timestamp",
        "* No errors before 13:06 UTC",
        "Confidence: high that the billing deploy introduced the regression.",
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
        "✅ Rollback initiated. Latency recovering. I'll monitor for 10 minutes and post a status update to StatusPage.",
        "Draft status update:",
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
      msg: "@{derek} nice catch. Was this the billing refactor from Tuesday's sprint? I think @{maya} authored that PR.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "derek",
      msg: "@{ren} yep, PR #2201. The feature flag was supposed to keep it inactive but it defaulted to on in production. Not a code issue, config issue.",
      holdMs: 4800,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "maya",
      msg: "Ugh. I tested it with the flag off in staging. The env config didn't propagate correctly. I'll fix the flag default and add a config check to CI so this can't happen again.",
      holdMs: 5400,
      reactions: [
        { from: "aisha", emoji: "💪", at: 3800 },
        { from: "ren", emoji: "💪", at: 4400 },
        { from: "derek", emoji: "💪", at: 5000 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "aisha",
      msg: "@{maya} no stress, that's why we have the rollback flow. Total customer-facing impact was under 13 minutes. @Incident — add @{maya}'s CI check as a follow-up item in the postmortem.",
      holdMs: 5400,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a4",
      msg: "Added. Postmortem draft will be ready in #inc-2026-0424 within the hour.",
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
// Scenario 4: New Hire Onboarding — Nora (People Ops), Clara (Manager),
// Kai (New Hire), Tom (Senior), OnboardBuddy
// ---------------------------------------------------------------------------

const onboardingScenario: Scenario = {
  agents: [
    {
      id: "a5",
      startRoom: "office-c",
      label: "@OnboardBuddy",
      cardRole: "Agent · People",
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
      msg: "Welcome to the team @{kai}! I've set up @OnboardBuddy to walk you through your first two weeks. It knows our policies, your team's setup, and your onboarding checklist. Ask it literally anything.",
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
      msg: "@{kai} welcome!! So excited to have you. Don't hesitate to ping me anytime, but honestly @OnboardBuddy will probably answer faster than me 😄",
      holdMs: 5000,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "kai",
      msg: "Thank you both!! @OnboardBuddy what should I focus on today?",
      holdMs: 3600,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a5", ref: "kai", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a5",
      msg: [
        "Welcome @{kai}! 🎉 Here's your **Day 1 checklist**:",
        "* Accept Google Workspace invite ✅",
        '* Set up Figma — your team uses the "Product Design" workspace.',
        "* Read the Design System principles doc (15 min). Tl;dr: atomic design, shared component library, Friday reviews.",
        "* Say hi in #design-team — your manager @{clara} usually posts a welcome thread.",
        "* Your first 1:1 with @{clara} is tomorrow at 10am.",
        "Want me to walk you through how the design review process works?",
      ].join("\n"),
      holdMs: 8000,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "kai",
      msg: "Yes! Also, what's the PTO policy? And who do I talk to about getting a monitor for my home office?",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    {
      type: "agent",
      agentId: "a5",
      msg: [
        "**PTO:** Unlimited with a 15-day minimum per year. You need manager approval for anything over 3 consecutive days. Full policy is in the People Handbook (section 4.2).",
        "**Equipment:** Post in #it-requests with your setup needs. Budget is €500 for home office peripherals, pre-approved, no manager sign-off needed. @{nora} can confirm if you want something outside the standard list.",
      ].join("\n"),
      holdMs: 6800,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "nora",
      msg: "^^ All correct. And if you want a standing desk, that's a separate budget — just DM me.",
      holdMs: 4000,
      reactions: [{ from: "kai", emoji: "✅", at: 2800 }],
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "tom",
      msg: "@{kai} hey! I sit next to you on the floor plan (well, virtually). Grab 20 min on my calendar this week — I'll walk you through the component library. Way easier with a live tour than reading docs.",
      holdMs: 5400,
      reactions: [
        { from: "kai", emoji: "❤️", at: 3800 },
        { from: "clara", emoji: "❤️", at: 4400 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "kai",
      msg: "@{tom} would love that, booking now! This is the smoothest first day I've ever had.",
      holdMs: 4400,
      reactions: [
        { from: "nora", emoji: "🥹", at: 3000 },
        { from: "clara", emoji: "💜", at: 3500 },
        { from: "tom", emoji: "💜", at: 4000 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "clara",
      msg: "@{nora} whatever you did with @OnboardBuddy, every team should have this. My last three hires all said the same thing.",
      holdMs: 4400,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "nora",
      msg: "Working on it! Rolling it out to Eng and Sales next month. 🚀",
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
// Scenario 5: Content Launch Coordination — Théo (Marketing Ops), Eva
// (Content Lead), Marco (AE), Sophie (SDR), LaunchCoordinator, ContentWriter
// ---------------------------------------------------------------------------

const contentLaunchScenario: Scenario = {
  agents: [
    {
      id: "a6",
      startRoom: "office-c",
      label: "@LaunchCoordinator",
      cardRole: "Agent · Marketing",
    },
    {
      id: "a7",
      startRoom: "office-c",
      label: "@ContentWriter",
      cardRole: "Agent · Marketing",
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
      msg: "The Meridian Health case study is approved. @LaunchCoordinator — kick off the distribution workflow.",
      holdMs: 4200,
    },
    { type: "pause", ms: 300 },
    { type: "walkTo", agentId: "a6", ref: "theo", offsetX: 60, offsetY: -10 },
    {
      type: "agent",
      agentId: "a6",
      msg: [
        "Got it. Here's the plan based on our content launch playbook:",
        "* **Blog** — full case study ✅ Ready",
        "* **LinkedIn** — short-form post + pull quote 🔄 Drafting",
        "* **Email** — customer newsletter snippet 🔄 Drafting",
        "* **Sales enablement** — one-pager + talk track ⏳ Pending",
        "* **Slack #wins** — internal announcement ⏳ Pending",
        "I'll draft the LinkedIn post and email snippet now. @ContentWriter — can you adapt the case study into a one-pager for the sales team?",
      ].join("\n"),
      holdMs: 8200,
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
      msg: 'One-pager draft ready. Key stats highlighted: **40h/week saved, 3 agents built by CS team, cross-team adoption** (CS + Sales). Talk track included with objection handling for "we already use ChatGPT." Posting to the Sales Enablement project for review.',
      holdMs: 6400,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "eva",
      msg: "@LaunchCoordinator show me the LinkedIn draft.",
      holdMs: 2800,
    },
    { type: "pause", ms: 200 },
    {
      type: "agent",
      agentId: "a6",
      msg: "\"Meridian Health's CS team went from spending 45 minutes investigating each technical question to getting verified answers in under 2 minutes. They didn't hire more people — they built 3 specialized agents that tap directly into their codebase, customer data, and product docs. Here's how →\"\nIncludes the Priya Nair quote and links to the full story. Want me to adjust tone or length?",
      holdMs: 7000,
      maxChars: 50,
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "eva",
      msg: "Shorter. Punchier opening. Lead with the time saved, not the team name.",
      holdMs: 3600,
    },
    { type: "pause", ms: 200 },
    {
      type: "agent",
      agentId: "a6",
      msg: 'Revised: "From 45 minutes to 2. That\'s how fast a CS team now gets verified technical answers — not by hiring, but by building 3 AI agents connected to their own codebase and customer data."',
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
      msg: "@{eva} @{theo} love this one. Can I send the one-pager to my Meridian-like prospects? I have 3 healthcare accounts in pipeline right now.",
      holdMs: 4800,
      reactions: [
        { from: "eva", emoji: "👀", at: 3200 },
        { from: "theo", emoji: "👀", at: 3800 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "theo",
      msg: "@{marco} it's already in the Sales Enablement project. @ContentWriter also added a talk track for the \"we already use ChatGPT\" objection, which I know you've been hearing a lot.",
      holdMs: 5200,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "marco",
      msg: "@{theo} you're reading my mind. Literally had that conversation yesterday with a prospect.",
      holdMs: 4000,
    },
    { type: "pause", ms: 300 },
    {
      type: "person",
      ref: "sophie",
      msg: "@{marco} same. Used the one-pager in an outbound sequence this morning. Already got a reply asking for a demo. 👀",
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
      msg: "@{sophie} already?? @{theo} see this is why I need to hire another content person.",
      holdMs: 4200,
      reactions: [
        { from: "sophie", emoji: "😂", at: 2800 },
        { from: "marco", emoji: "😂", at: 3200 },
      ],
    },
    { type: "pause", ms: 400 },
    {
      type: "person",
      ref: "theo",
      msg: "Content ships, agents distribute, humans close. The system works. ☕",
      holdMs: 4400,
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
  qualBotScenario,
  supportEscalationScenario,
  incidentResponseScenario,
  onboardingScenario,
  contentLaunchScenario,
];

// Kept for any external imports (the original single-scenario export name).
export { qualBotScenario };
