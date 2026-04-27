// Scenario data for the home-page isometric office hero. The scene engine in
// heroOfficeScene.ts is scenario-agnostic — to change the dialogue, edit
// `qualBotScenario.beats` here. To swap in a different scenario entirely,
// build a new `Scenario` value and pass it to `mountFloorScene`.
//
// Beat copy supports two placeholders that the engine resolves at runtime
// against the cast picked for the current page load:
//   {ref}   → first name of the picked teammate (e.g. "Stanislas")
//   @{ref}  → "@" + first name              (e.g. "@Stanislas")
// `ref` matches one of the cast slot keys ("lisa", "marco", "yuki" below).
// Literal mentions like "@QualBot" are not cast refs and pass through as-is.

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
  /** Symbolic key referenced by beats. */
  ref: string;
  /** Office the engine picks the assigned teammate from. */
  startRoom: RoomKey;
  /** Subtitle shown under the teammate's real name in the chat card. */
  role: string;
}

export interface Reaction {
  /** Cast ref of the reactor (must match a CastSlot.ref). */
  from: string;
  emoji: string;
  /** Milliseconds after the beat starts. */
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
      /** Walk the agent next to a cast member's seat. */
      type: "walkTo";
      agentId: string;
      ref: string;
      offsetX?: number;
      offsetY?: number;
    }
  | {
      /** Walk the agent back to its starting position. */
      type: "walkHome";
      agentId: string;
    }
  | { type: "pause"; ms: number };

export interface Scenario {
  agents: AgentDef[];
  cast: CastSlot[];
  beats: Beat[];
  /** Pause between full scenario loops (defaults to 2500ms in the engine). */
  loopGapMs?: number;
}

export const qualBotScenario: Scenario = {
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
    {
      type: "walkTo",
      agentId: "a1",
      ref: "marco",
      offsetX: 60,
      offsetY: -10,
    },
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
