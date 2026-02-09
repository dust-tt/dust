import { useMemo } from "react";

import { ConversationView } from "../components/ConversationView";
import {
  type Conversation,
  type ConversationItem,
  mockAgents,
  mockUsers,
} from "../data";

// Pick specific users and agents for a deterministic conversation
const locutor = mockUsers[0]; // Emma Andersson
const user1 = mockUsers[1]; // Lucas Johansson
const user2 = mockUsers[2]; // Sophie Müller
const user3 = mockUsers[6]; // Amélie Dubois
const user4 = mockUsers[20]; // Wei Zhang

const designAgent = mockAgents[11]; // StrategyPlanner 🎯
const codeAgent = mockAgents[13]; // CodeReviewer 💻
const dataAgent = mockAgents[12]; // DataAnalyst 📊

// ---------------------------------------------------------------------------
// Long, rich conversation about a product feature launch
// ---------------------------------------------------------------------------

function buildConversation(): Conversation {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const messages: ConversationItem[] = [
    // ─── Two days ago ──────────────────────────────────────────────────
    { kind: "section", id: "section-two-days-ago", label: "Wednesday" },

    // Locutor kicks off the thread
    {
      kind: "message",
      id: "msg-1",
      content:
        "Hey everyone — we need to finalize the notification system redesign before the sprint review on Friday. I've been gathering feedback from support and there's a lot to unpack.",
      timestamp: new Date(twoDaysAgo.getTime() + 9 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-1",
        type: "locutor",
        timestamp: "09:00",
        infoChip: { icon: "bolt" },
      },
      reactions: [
        { emoji: "👍", count: 3, reactedByLocutor: false },
        { emoji: "🔥", count: 1, reactedByLocutor: true },
      ],
    },
    {
      kind: "message",
      id: "msg-2",
      content:
        "I've attached the support ticket summary and the current wireframe so everyone has context.",
      timestamp: new Date(twoDaysAgo.getTime() + 9 * 60 * 60 * 1000 + 60000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-1",
        type: "locutor",
        timestamp: "09:00",
        infoChip: { icon: "bolt" },
      },
      attachments: [
        { id: "a1", label: "Support_tickets_Q1_summary.pdf", icon: "document" },
        {
          id: "a2",
          label: "Notifications_wireframe_v4.fig",
          icon: "document",
        },
        {
          id: "a3",
          label: "User_interview_notes.docx",
          icon: "document",
        },
      ],
    },

    // Interlocutor 1 responds
    {
      kind: "message",
      id: "msg-3",
      content:
        "Thanks for pulling this together. I looked at the tickets and the biggest pain point is the lack of grouping — people get 40+ notifications a day and can't distinguish what's urgent.",
      timestamp: new Date(twoDaysAgo.getTime() + 9.2 * 60 * 60 * 1000),
      ownerId: user1.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-lucas-1",
        type: "interlocutor",
        name: user1.fullName,
        timestamp: "09:12",
        avatar: { visual: user1.portrait, isRounded: true },
      },
      reactions: [{ emoji: "💯", count: 2, reactedByLocutor: true }],
      citations: [
        {
          id: "c-tickets",
          icon: "table",
          title: "Support tickets grouped by category",
        },
      ],
    },

    // Interlocutor 2 chimes in
    {
      kind: "message",
      id: "msg-4",
      content:
        "Agreed. We should also rethink the delivery channels — email digests vs. in-app vs. push. Right now everything goes everywhere and it's noise.",
      timestamp: new Date(twoDaysAgo.getTime() + 9.3 * 60 * 60 * 1000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-sophie-1",
        type: "interlocutor",
        name: user2.fullName,
        timestamp: "09:18",
        avatar: { visual: user2.portrait, isRounded: true },
      },
    },
    {
      kind: "message",
      id: "msg-5",
      content:
        "I did a quick competitive audit last week. Slack, Linear, and Notion all let users set per-category preferences. That seems like the minimum bar.",
      timestamp: new Date(twoDaysAgo.getTime() + 9.35 * 60 * 60 * 1000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-sophie-1",
        type: "interlocutor",
        name: user2.fullName,
        timestamp: "09:18",
        avatar: { visual: user2.portrait, isRounded: true },
      },
      citations: [
        {
          id: "c-audit",
          icon: "notion",
          title: "Competitive audit — notifications",
        },
      ],
    },

    // Agent produces a strategy analysis
    {
      kind: "message",
      id: "msg-6",
      timestamp: new Date(twoDaysAgo.getTime() + 9.5 * 60 * 60 * 1000),
      ownerId: designAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-strategy-1",
        type: "agent",
        name: designAgent.name,
        timestamp: "09:30",
        completionStatus: "Completed in 18 sec",
        avatar: {
          emoji: designAgent.emoji,
          backgroundColor: designAgent.backgroundColor,
        },
      },
      markdown: `**Notification system audit (summary)**

Current state:
- Average user receives **42 notifications/day** across 3 channels.
- Only **12%** of in-app notifications are clicked within 24 hours.
- Email open rate for notification digests is **8%** (industry avg 21%).

Top user complaints (from 214 tickets):
1. "I can't tell what's important" — 63% of complaints.
2. "I get the same thing in email AND in-app" — 28%.
3. "No way to mute a noisy channel" — 19%.

Recommended priorities:
- **P0**: Notification grouping by category with urgency tiers.
- **P0**: Per-category channel preferences (in-app / email / push / off).
- **P1**: Smart digest — daily summary replacing individual emails.
- **P2**: Snooze & mute controls per source.`,
      citations: [
        {
          id: "c-analysis",
          icon: "table",
          title: "Full notification analytics",
        },
        {
          id: "c-tickets2",
          icon: "slack",
          title: "#support-escalations channel",
        },
        {
          id: "c-bench",
          icon: "document",
          title: "Notification benchmark report",
        },
      ],
    },

    // Locutor reacts
    {
      kind: "message",
      id: "msg-7",
      content:
        "That's a really clear picture. I think P0 items are non-negotiable for Friday. Can we scope what P0 looks like in terms of engineering effort?",
      timestamp: new Date(twoDaysAgo.getTime() + 9.7 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-2",
        type: "locutor",
        timestamp: "09:42",
      },
    },

    // Another interlocutor
    {
      kind: "message",
      id: "msg-8",
      content:
        "I can take the grouping logic. We already have event types in the schema, just need a presentation layer on top. Should be 2-3 days.",
      timestamp: new Date(twoDaysAgo.getTime() + 9.8 * 60 * 60 * 1000),
      ownerId: user3.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-amelie-1",
        type: "interlocutor",
        name: user3.fullName,
        timestamp: "09:48",
        avatar: { visual: user3.portrait, isRounded: true },
      },
      reactions: [{ emoji: "🙌", count: 2, reactedByLocutor: false }],
    },

    // Wei Zhang
    {
      kind: "message",
      id: "msg-9",
      content:
        "For the channel preferences I'll need to extend the user settings API. I've already got a draft PR from the email digest work — I'll rebase it.",
      timestamp: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000),
      ownerId: user4.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-wei-1",
        type: "interlocutor",
        name: user4.fullName,
        timestamp: "10:00",
        avatar: { visual: user4.portrait, isRounded: true },
      },
    },

    // Code agent suggests architecture
    {
      kind: "message",
      id: "msg-10",
      timestamp: new Date(twoDaysAgo.getTime() + 10.2 * 60 * 60 * 1000),
      ownerId: codeAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-code-1",
        type: "agent",
        name: codeAgent.name,
        timestamp: "10:12",
        completionStatus: "Completed in 34 sec",
        avatar: {
          emoji: codeAgent.emoji,
          backgroundColor: codeAgent.backgroundColor,
        },
      },
      markdown: `**Suggested architecture for notification grouping**

\`\`\`
┌────────────────────────────┐
│   Event Bus (existing)     │
│   - comment.created        │
│   - mention.user           │
│   - task.assigned          │
│   - review.requested       │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│   Grouping Service (new)   │
│   - Groups by category     │
│   - Assigns urgency tier   │
│   - Respects user prefs    │
└──────────┬─────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  In-App       Digest
  (real-time)  (batched)
\`\`\`

Key decisions:
- The grouping service sits between the event bus and delivery.
- Urgency is derived from event type + user role (e.g. direct mention → high).
- User preferences table: \`user_id, category, channel, enabled\`.
- Digest job runs every 6 hours; users can override frequency.

Estimated effort:
| Component | Days | Owner |
|-----------|------|-------|
| Grouping service | 2 | Amélie |
| Preferences API | 1.5 | Wei |
| In-app UI | 2 | Lucas |
| Digest builder | 1 | Wei |
| **Total** | **6.5** | — |`,
      citations: [
        {
          id: "c-schema",
          icon: "document",
          title: "Event schema reference",
        },
        {
          id: "c-pr",
          icon: "slack",
          title: "Draft PR #1247 — email digest",
        },
      ],
    },

    // Locutor with action cards
    {
      kind: "message",
      id: "msg-11",
      content:
        "Nice breakdown. Let me propose the tasks formally so we can track them.",
      timestamp: new Date(twoDaysAgo.getTime() + 10.4 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-3",
        type: "locutor",
        timestamp: "10:24",
      },
    },

    // Agent with action cards
    {
      kind: "message",
      id: "msg-12",
      timestamp: new Date(twoDaysAgo.getTime() + 10.5 * 60 * 60 * 1000),
      ownerId: designAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-strategy-2",
        type: "agent",
        name: designAgent.name,
        timestamp: "10:30",
        completionStatus: "Awaiting approval",
        avatar: {
          emoji: designAgent.emoji,
          backgroundColor: designAgent.backgroundColor,
        },
      },
      actionCards: [
        {
          id: "ac-1",
          title: "Create notification grouping service",
          acceptedTitle: "Grouping service task created",
          rejectedTitle: "Grouping service task skipped",
          description:
            "New service between event bus and delivery layer. Groups notifications by category and assigns urgency tiers based on event type and user role.",
          applyLabel: "Create task",
          rejectLabel: "Skip",
          cardVariant: "highlight",
          actionsPosition: "header",
          visual: { emoji: "📦", backgroundColor: "s-bg-blue-100" },
        },
        {
          id: "ac-2",
          title: "Extend user preferences API",
          acceptedTitle: "Preferences API task created",
          rejectedTitle: "Preferences API task skipped",
          description:
            "Add per-category channel preferences (in-app / email / push / off) to the user settings endpoint. Rebase on draft PR #1247.",
          applyLabel: "Create task",
          rejectLabel: "Skip",
          cardVariant: "secondary",
          visual: { emoji: "⚙️", backgroundColor: "s-bg-green-100" },
        },
        {
          id: "ac-3",
          title: "Build in-app notification UI",
          acceptedTitle: "In-app UI task created",
          rejectedTitle: "In-app UI task skipped",
          description:
            "Design and implement the grouped notification panel with urgency indicators, mute controls, and mark-all-read.",
          applyLabel: "Create task",
          rejectLabel: "Skip",
          cardVariant: "highlight",
          actionsPosition: "footer",
          visual: { emoji: "🖥️", backgroundColor: "s-bg-violet-100" },
        },
      ],
    },

    // User 1 asks a question
    {
      kind: "message",
      id: "msg-13",
      content:
        "Quick question — should the in-app panel support real-time updates? That changes the complexity a lot. WebSocket vs. polling.",
      timestamp: new Date(twoDaysAgo.getTime() + 11 * 60 * 60 * 1000),
      ownerId: user1.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-lucas-2",
        type: "interlocutor",
        name: user1.fullName,
        timestamp: "11:00",
        avatar: { visual: user1.portrait, isRounded: true },
      },
    },

    // Locutor answers
    {
      kind: "message",
      id: "msg-14",
      content:
        "Yes, real-time for high-urgency items. We already have the WebSocket infra from the chat feature — let's piggyback on that.",
      timestamp: new Date(twoDaysAgo.getTime() + 11.1 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-4",
        type: "locutor",
        timestamp: "11:06",
      },
      reactions: [{ emoji: "👍", count: 4, reactedByLocutor: false }],
    },

    // Sophie adds a design concern
    {
      kind: "message",
      id: "msg-15",
      content:
        "One thing from the UX side — we need empty states for each notification category. Right now when you clear everything it's just blank, which feels broken.",
      timestamp: new Date(twoDaysAgo.getTime() + 11.5 * 60 * 60 * 1000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-sophie-2",
        type: "interlocutor",
        name: user2.fullName,
        timestamp: "11:30",
        avatar: { visual: user2.portrait, isRounded: true },
      },
    },
    {
      kind: "message",
      id: "msg-16",
      content:
        'I\'ll mock up the empty states today and share them in the design channel. Thinking something encouraging like "All caught up!" with a small illustration.',
      timestamp: new Date(twoDaysAgo.getTime() + 11.5 * 60 * 60 * 1000 + 30000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-sophie-2",
        type: "interlocutor",
        name: user2.fullName,
        timestamp: "11:30",
        avatar: { visual: user2.portrait, isRounded: true },
      },
      reactions: [
        { emoji: "❤️", count: 3, reactedByLocutor: true },
        { emoji: "✨", count: 1, reactedByLocutor: false },
      ],
    },

    // ─── Yesterday ─────────────────────────────────────────────────────
    { kind: "section", id: "section-yesterday", label: "Yesterday" },

    // Locutor check-in
    {
      kind: "message",
      id: "msg-17",
      content:
        "Morning update — I reviewed the mockups Sophie shared. The empty states look great. I have a few notes on spacing and the urgency badge colors.",
      timestamp: new Date(yesterday.getTime() + 9 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-5",
        type: "locutor",
        timestamp: "09:00",
      },
      citations: [
        {
          id: "c-mockups",
          icon: "notion",
          title: "Notification panel mockups v2",
        },
      ],
    },
    {
      kind: "message",
      id: "msg-18",
      content:
        "Also, I'm tagging the DataAnalyst to help us define the success metrics before we ship.",
      timestamp: new Date(yesterday.getTime() + 9 * 60 * 60 * 1000 + 60000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-5",
        type: "locutor",
        timestamp: "09:00",
      },
    },

    // Data agent provides metrics framework
    {
      kind: "message",
      id: "msg-19",
      timestamp: new Date(yesterday.getTime() + 9.3 * 60 * 60 * 1000),
      ownerId: dataAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-data-1",
        type: "agent",
        name: dataAgent.name,
        timestamp: "09:18",
        completionStatus: "Completed in 15 sec",
        avatar: {
          emoji: dataAgent.emoji,
          backgroundColor: dataAgent.backgroundColor,
        },
      },
      markdown: `**Proposed success metrics**

Primary KPIs (measure after 2-week rollout):
| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| In-app notification CTR | 12% | 25%+ | Event tracking |
| Email digest open rate | 8% | 20%+ | Email analytics |
| Notifications dismissed unread | 67% | <40% | In-app events |
| Support tickets about notifications | 18/week | <5/week | Zendesk tag |

Secondary signals:
- Time from notification → action (aim for <2 min on high-urgency).
- Percentage of users customizing channel preferences (target: 30%+ in first month).
- Snooze/mute usage (healthy signal: 15-25% of users).

**Instrumentation plan**
1. Add \`notification.displayed\`, \`notification.clicked\`, \`notification.dismissed\` events.
2. Tag each event with \`category\`, \`urgency_tier\`, \`channel\`.
3. Build a Mixpanel dashboard (I'll set it up once the events ship).`,
      citations: [
        {
          id: "c-mixpanel",
          icon: "table",
          title: "Current Mixpanel dashboard",
        },
        {
          id: "c-zendesk",
          icon: "document",
          title: "Zendesk ticket trend report",
        },
      ],
    },

    // Amélie updates on progress
    {
      kind: "message",
      id: "msg-20",
      content:
        "Update from my side: the grouping service is about 60% done. I've got the category mapping working, urgency tier assignment is next. Should be ready for code review tomorrow morning.",
      timestamp: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000),
      ownerId: user3.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-amelie-2",
        type: "interlocutor",
        name: user3.fullName,
        timestamp: "10:00",
        avatar: { visual: user3.portrait, isRounded: true },
      },
    },

    // Wei updates
    {
      kind: "message",
      id: "msg-21",
      content:
        "Preferences API is done. I also added a migration script for existing users — they'll get sensible defaults (everything enabled for in-app, email only for high-urgency). PR is up for review.",
      timestamp: new Date(yesterday.getTime() + 10.5 * 60 * 60 * 1000),
      ownerId: user4.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-wei-2",
        type: "interlocutor",
        name: user4.fullName,
        timestamp: "10:30",
        avatar: { visual: user4.portrait, isRounded: true },
      },
      reactions: [
        { emoji: "🚀", count: 3, reactedByLocutor: true },
        { emoji: "💪", count: 2, reactedByLocutor: false },
      ],
      citations: [
        {
          id: "c-pr-prefs",
          icon: "slack",
          title: "PR #1302 — User notification preferences",
        },
      ],
    },

    // Lucas asks about edge case
    {
      kind: "message",
      id: "msg-22",
      content:
        "Hey Wei, quick question about the migration: what happens if a user already has custom email settings from the old system? Do we preserve those or reset?",
      timestamp: new Date(yesterday.getTime() + 11 * 60 * 60 * 1000),
      ownerId: user1.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-lucas-3",
        type: "interlocutor",
        name: user1.fullName,
        timestamp: "11:00",
        avatar: { visual: user1.portrait, isRounded: true },
      },
    },

    // Wei responds
    {
      kind: "message",
      id: "msg-23",
      content:
        "Good catch. The migration preserves existing email settings and maps them to the new schema. If someone had email off for a category, it stays off. I added a test case for that.",
      timestamp: new Date(yesterday.getTime() + 11.2 * 60 * 60 * 1000),
      ownerId: user4.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-wei-3",
        type: "interlocutor",
        name: user4.fullName,
        timestamp: "11:12",
        avatar: { visual: user4.portrait, isRounded: true },
      },
      reactions: [{ emoji: "👍", count: 1, reactedByLocutor: false }],
    },

    // Locutor shares a concern
    {
      kind: "message",
      id: "msg-24",
      content:
        "One risk I want to flag: if the grouping service goes down, we need a fallback. We can't just swallow notifications silently.",
      timestamp: new Date(yesterday.getTime() + 14 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-6",
        type: "locutor",
        timestamp: "14:00",
      },
    },

    // Code agent offers a solution
    {
      kind: "message",
      id: "msg-25",
      timestamp: new Date(yesterday.getTime() + 14.2 * 60 * 60 * 1000),
      ownerId: codeAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-code-2",
        type: "agent",
        name: codeAgent.name,
        timestamp: "14:12",
        completionStatus: "Completed in 8 sec",
        avatar: {
          emoji: codeAgent.emoji,
          backgroundColor: codeAgent.backgroundColor,
        },
      },
      markdown: `**Fallback strategy**

If the grouping service is unavailable:
1. Events are written to a **dead-letter queue** (DLQ) in Redis.
2. A circuit breaker trips after 3 consecutive failures (10s window).
3. While the circuit is open, notifications bypass grouping and are delivered as **ungrouped, default-urgency** items directly to in-app.
4. A recovery worker drains the DLQ once the service is healthy and retroactively groups missed events.

This ensures **zero notification loss** with degraded (but functional) UX during outages.`,
    },

    // Amélie responds
    {
      kind: "message",
      id: "msg-26",
      content:
        "Makes sense. I'll add the circuit breaker pattern to the grouping service. We already use Opossum in the codebase so it should be straightforward.",
      timestamp: new Date(yesterday.getTime() + 14.5 * 60 * 60 * 1000),
      ownerId: user3.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-amelie-3",
        type: "interlocutor",
        name: user3.fullName,
        timestamp: "14:30",
        avatar: { visual: user3.portrait, isRounded: true },
      },
    },

    // Sophie shares mockup progress
    {
      kind: "message",
      id: "msg-27",
      content:
        "Updated mockups are ready! I added the urgency badges, grouped notification cards, and the settings panel. Also included mobile responsive views.",
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-sophie-3",
        type: "interlocutor",
        name: user2.fullName,
        timestamp: "16:00",
        avatar: { visual: user2.portrait, isRounded: true },
      },
      attachments: [
        { id: "a4", label: "Notifications_desktop_v5.fig", icon: "document" },
        { id: "a5", label: "Notifications_mobile_v5.fig", icon: "document" },
      ],
      reactions: [
        { emoji: "😍", count: 4, reactedByLocutor: true },
        { emoji: "🎨", count: 2, reactedByLocutor: false },
      ],
    },

    // Locutor wraps up the day
    {
      kind: "message",
      id: "msg-28",
      content:
        "These look amazing, Sophie. Great work everyone — we're on track. Let's sync again tomorrow morning for a final check before the review.",
      timestamp: new Date(yesterday.getTime() + 17 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-7",
        type: "locutor",
        timestamp: "17:00",
      },
      reactions: [
        { emoji: "🙏", count: 3, reactedByLocutor: false },
        { emoji: "✅", count: 2, reactedByLocutor: true },
      ],
    },

    // ─── Today ─────────────────────────────────────────────────────────
    { kind: "section", id: "section-today", label: "Today" },

    // Locutor morning check-in
    {
      kind: "message",
      id: "msg-29",
      content:
        "Good morning! Final push today. Where does everyone stand? Sprint review is at 4 PM.",
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-8",
        type: "locutor",
        timestamp: "09:00",
        infoChip: { icon: "bolt" },
      },
    },

    // Amélie reports completion
    {
      kind: "message",
      id: "msg-30",
      content:
        "Grouping service is done and passing all tests. Circuit breaker is in place. PR is up — I'd love a review from Wei since it touches the event bus.",
      timestamp: new Date(now.getTime() - 2.8 * 60 * 60 * 1000),
      ownerId: user3.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-amelie-4",
        type: "interlocutor",
        name: user3.fullName,
        timestamp: "09:12",
        avatar: { visual: user3.portrait, isRounded: true },
      },
      citations: [
        {
          id: "c-pr-grouping",
          icon: "slack",
          title: "PR #1308 — Notification grouping service",
        },
      ],
    },

    // Lucas updates on UI
    {
      kind: "message",
      id: "msg-31",
      content:
        "In-app panel is functional. Grouped view is working, real-time via WebSocket is hooked up. Still need to add the preferences settings page.",
      timestamp: new Date(now.getTime() - 2.5 * 60 * 60 * 1000),
      ownerId: user1.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-lucas-4",
        type: "interlocutor",
        name: user1.fullName,
        timestamp: "09:30",
        avatar: { visual: user1.portrait, isRounded: true },
      },
    },
    {
      kind: "message",
      id: "msg-32",
      content:
        "The settings page should be about 2 hours of work. I'll wire up the toggle components to Wei's API.",
      timestamp: new Date(now.getTime() - 2.5 * 60 * 60 * 1000 + 30000),
      ownerId: user1.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-lucas-4",
        type: "interlocutor",
        name: user1.fullName,
        timestamp: "09:30",
        avatar: { visual: user1.portrait, isRounded: true },
      },
    },

    // Agent summary of launch readiness
    {
      kind: "message",
      id: "msg-33",
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      ownerId: designAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-strategy-3",
        type: "agent",
        name: designAgent.name,
        timestamp: "10:00",
        completionStatus: "Completed in 22 sec",
        avatar: {
          emoji: designAgent.emoji,
          backgroundColor: designAgent.backgroundColor,
        },
      },
      markdown: `**Launch readiness checklist**

| Item | Status | Owner | Notes |
|------|--------|-------|-------|
| Grouping service | ✅ Done | Amélie | PR #1308 in review |
| Preferences API | ✅ Done | Wei | Merged, migration tested |
| In-app panel (grouped view) | ✅ Done | Lucas | WebSocket connected |
| In-app panel (settings page) | 🔄 In progress | Lucas | ~2h remaining |
| Empty states | ✅ Done | Sophie | Included in v5 mockups |
| Urgency badges | ✅ Done | Sophie + Lucas | Integrated |
| Circuit breaker / fallback | ✅ Done | Amélie | In grouping service PR |
| Analytics events | ⏳ Not started | Wei | Can ship post-launch |
| Mixpanel dashboard | ⏳ Not started | DataAnalyst | Depends on analytics events |
| Email digest builder | 📋 Backlog | Wei | Deferred to next sprint |

**Overall: 7/10 items complete — on track for 4 PM review.**

Recommendation: Ship the core experience (grouping + preferences + in-app panel) as v1. Analytics instrumentation and email digest can follow in the next sprint without blocking user value.`,
      citations: [
        {
          id: "c-board",
          icon: "table",
          title: "Sprint board — Notification redesign",
        },
      ],
    },

    // Locutor responds to the readiness check
    {
      kind: "message",
      id: "msg-34",
      content:
        "Perfect. I agree — let's ship the core and instrument analytics next week. We'll still have great data from the support ticket trend and in-app usage.",
      timestamp: new Date(now.getTime() - 1.5 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-9",
        type: "locutor",
        timestamp: "10:30",
      },
    },
    {
      kind: "message",
      id: "msg-35",
      content:
        "Can we get a final sanity check on the rollout plan? I want to make sure we have a kill switch in case something goes wrong.",
      timestamp: new Date(now.getTime() - 1.5 * 60 * 60 * 1000 + 30000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-9",
        type: "locutor",
        timestamp: "10:30",
      },
    },

    // Code agent with rollout plan + action cards
    {
      kind: "message",
      id: "msg-36",
      timestamp: new Date(now.getTime() - 1.3 * 60 * 60 * 1000),
      ownerId: codeAgent.id,
      ownerType: "agent",
      type: "agent",
      group: {
        id: "g-code-3",
        type: "agent",
        name: codeAgent.name,
        timestamp: "10:42",
        completionStatus: "Awaiting approval",
        avatar: {
          emoji: codeAgent.emoji,
          backgroundColor: codeAgent.backgroundColor,
        },
      },
      markdown: `**Rollout plan**

**Phase 1 — Internal (today)**
- Deploy behind \`notifications_v2\` feature flag.
- Enable for the team (10 users) for smoke testing.

**Phase 2 — Canary (Monday)**
- Roll out to 5% of users.
- Monitor error rates, WebSocket connection stability, and grouping latency.
- Kill switch: disable flag → instant revert to legacy notifications.

**Phase 3 — General availability (Wednesday)**
- If canary metrics are green, roll to 100%.
- Announce via in-app banner + changelog.`,
      actionCards: [
        {
          id: "ac-rollout-1",
          title: "Enable feature flag for team",
          acceptedTitle: "Feature flag enabled",
          rejectedTitle: "Feature flag not enabled",
          description:
            "Turn on notifications_v2 flag for the internal team to begin smoke testing today.",
          applyLabel: "Enable",
          rejectLabel: "Not now",
          cardVariant: "highlight",
          actionsPosition: "header",
          visual: { emoji: "🚦", backgroundColor: "s-bg-green-100" },
        },
        {
          id: "ac-rollout-2",
          title: "Schedule canary deployment for Monday",
          acceptedTitle: "Canary scheduled",
          rejectedTitle: "Canary not scheduled",
          description:
            "Configure 5% canary rollout with automatic monitoring alerts for error rate, latency, and WebSocket health.",
          applyLabel: "Schedule",
          rejectLabel: "Skip",
          cardVariant: "secondary",
          visual: { emoji: "🐤", backgroundColor: "s-bg-yellow-100" },
        },
      ],
    },

    // Sophie enthusiasm
    {
      kind: "message",
      id: "msg-37",
      content:
        "This is coming together really nicely! I'll be around all afternoon if anyone needs design tweaks during smoke testing.",
      timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-sophie-4",
        type: "interlocutor",
        name: user2.fullName,
        timestamp: "11:00",
        avatar: { visual: user2.portrait, isRounded: true },
      },
      reactions: [{ emoji: "💜", count: 2, reactedByLocutor: true }],
    },

    // Wei confirms
    {
      kind: "message",
      id: "msg-38",
      content:
        "Just reviewed Amélie's PR — looks solid. Left a couple of minor comments on error handling but nothing blocking. Approved.",
      timestamp: new Date(now.getTime() - 0.8 * 60 * 60 * 1000),
      ownerId: user4.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-wei-4",
        type: "interlocutor",
        name: user4.fullName,
        timestamp: "11:12",
        avatar: { visual: user4.portrait, isRounded: true },
      },
      reactions: [{ emoji: "✅", count: 1, reactedByLocutor: false }],
    },

    // Locutor final message
    {
      kind: "message",
      id: "msg-39",
      content:
        "Awesome teamwork everyone. Let's merge all PRs, deploy to staging, and do a quick round of smoke testing before the review. See you at 4!",
      timestamp: new Date(now.getTime() - 0.5 * 60 * 60 * 1000),
      ownerId: locutor.id,
      ownerType: "user",
      type: "user",
      group: {
        id: "g-locutor-10",
        type: "locutor",
        timestamp: "11:30",
      },
      reactions: [
        { emoji: "🎉", count: 5, reactedByLocutor: true },
        { emoji: "🚀", count: 3, reactedByLocutor: false },
        { emoji: "💪", count: 2, reactedByLocutor: false },
      ],
    },

    // Active indicators
    {
      kind: "activeIndicator",
      id: "active-agent-typing",
      type: "agent",
      name: designAgent.name,
      action: "thinking",
      avatar: {
        emoji: designAgent.emoji,
        backgroundColor: designAgent.backgroundColor,
      },
    },
    {
      kind: "activeIndicator",
      id: "active-user-typing",
      type: "interlocutor",
      name: user3.fullName,
      action: "typing",
      avatar: { visual: user3.portrait, isRounded: true },
    },
  ];

  return {
    id: "conv-standalone-1",
    title: "Notification System Redesign",
    createdAt: twoDaysAgo,
    updatedAt: now,
    userParticipants: [locutor.id, user1.id, user2.id, user3.id, user4.id],
    agentParticipants: [designAgent.id, codeAgent.id, dataAgent.id],
    messages,
    description:
      "Cross-functional thread to finalize the notification system redesign before sprint review.",
  };
}

// ---------------------------------------------------------------------------
// Story component
// ---------------------------------------------------------------------------

export default function ConversationStory() {
  const conversation = useMemo(() => buildConversation(), []);

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <ConversationView
        conversation={conversation}
        locutor={locutor}
        users={[user1, user2, user3, user4]}
        agents={[designAgent, codeAgent, dataAgent]}
        conversationsWithMessages={[]}
        showBackButton={false}
        conversationTitle="Notification System Redesign"
        projectTitle="Product Engineering"
      />
    </div>
  );
}
