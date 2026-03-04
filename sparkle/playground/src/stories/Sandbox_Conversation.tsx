import "@dust-tt/sparkle/styles/allotment.css";

import {
  Avatar,
  CommandLineIcon,
  DocumentTextIcon,
  GithubIcon,
  GlobeAltIcon,
  Markdown,
  MagnifyingGlassIcon,
  RobotIcon,
} from "@dust-tt/sparkle";
import { customColors } from "@dust-tt/sparkle/lib/colors";
import { SlackLogo } from "@dust-tt/sparkle/logo/platforms";
import { Allotment } from "allotment";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentStepBreakdownPanel } from "../components/AgentStepBreakdownPanel";
import {
  AgentThinkingSteps,
  type ThinkingStep,
} from "../components/AgentThinkingSteps";
import { ConversationView } from "../components/ConversationView";
import { InputBar } from "../components/InputBar";
import { mockAgents, mockUsers } from "../data";
import type { Conversation, ConversationItem } from "../data/types";

const locutor = mockUsers[0];
const agent = mockAgents[11]; // StrategyPlanner 🎯

const PREFILLED_MESSAGE =
  "Hey @StrategyPlanner — can you give me a quick status update on the notification redesign? I need a summary before the sprint review.";

const AGENT_RESPONSE = `**Notification redesign — status update**

Here's where things stand ahead of the sprint review:

**Completed ✅**
- Grouping service (Amélie) — PR #1308 merged, circuit breaker in place
- Preferences API (Wei) — merged with migration for existing users
- In-app panel grouped view (Lucas) — WebSocket connected

**In progress 🔄**
- Settings page (Lucas) — ~2h of work remaining, should be done before review

**Deferred to next sprint 📋**
- Analytics instrumentation (Wei)
- Email digest builder (Wei)
- Mixpanel dashboard

**Overall: 7/10 items complete — on track for 4 PM review.**

Recommendation: ship the core experience (grouping + preferences + in-app panel) as v1. Analytics and digest can follow without blocking user value.`;

// ---------------------------------------------------------------------------
// Step definitions with breakdown data
// ---------------------------------------------------------------------------

function makeIconNode(
  IconComponent: React.ComponentType<{ className?: string }>
) {
  return <Avatar size="xs" icon={IconComponent} />;
}

const STEP_DEFS: Array<Omit<ThinkingStep, "status">> = [
  {
    id: "s1",
    label: "Searched for data of the latest quarter at Dust",
    breakdown: {
      toolName: "dust:search",
      iconNode: makeIconNode(MagnifyingGlassIcon),
      title: "Dust Search",
      description: "Searched sprint board, Notion docs, and GitHub PRs for notification redesign status",
      badge: "Results (8)",
      inputs: `\`\`\`json
{
  "query": "notification redesign sprint status Q1 2025",
  "sources": ["Engineering Notion", "Sprint Board"],
  "limit": 10
}
\`\`\``,
      output: `Found **8 documents** matching the query:

- *Sprint Review Notes — Feb 28* (Notion)
- *Notification Redesign — Technical Spec v3* (Notion)
- *Sprint Board — Notification Redesign* (Linear)
- *PR #1302 — User notification preferences* (GitHub)
- *PR #1308 — Notification grouping service* (GitHub)
- *#engineering-sprint thread — Mar 3* (Slack)
- *Q1 OKR tracking — Engineering* (Notion)
- *User interview notes — Feb 2025* (Notion)`,
    },
  },
  {
    id: "s2",
    label: "Ran @dust-task to check other sources",
    breakdown: {
      toolName: "dust:run_agent",
      iconNode: (
        <Avatar
          emoji={agent.emoji}
          backgroundColor={agent.backgroundColor}
          size="xs"
          name={agent.name}
        />
      ),
      title: "Run @dust-task",
      description: "Delegated sprint board check — returned 6-item status table with owners",
      inputs: `\`\`\`json
{
  "agent": "@dust-task",
  "instruction": "Check sprint board and GitHub PRs for the current status of the notification redesign project."
}
\`\`\``,
      output: `**Sprint board summary** (from @dust-task):

| Item | Status | Owner |
|------|--------|-------|
| Grouping service | ✅ Done | Amélie |
| Preferences API | ✅ Done | Wei |
| In-app panel (grouped view) | ✅ Done | Lucas |
| Settings page | 🔄 In progress | Lucas |
| Analytics events | ⏳ Not started | Wei |
| Email digest builder | 📋 Backlog | Wei |`,
    },
  },
  {
    id: "s3",
    label: "Analyzing sprint board data…",
    breakdown: {
      toolName: "dust:search",
      iconNode: makeIconNode(MagnifyingGlassIcon),
      title: "Linear Search",
      description: "Queried sprint board for open and blocked items — 7/10 complete, none blocked",
      badge: "Results (5)",
      inputs: `\`\`\`json
{
  "query": "sprint board notification redesign open items blocked",
  "sources": ["Linear", "Jira"],
  "limit": 5
}
\`\`\``,
      output: `**Sprint board analysis:**

- 7 of 10 items complete
- 1 item in progress (Settings page, ~2h remaining)
- 2 items deferred to next sprint
- No blocked items
- Sprint velocity: on track`,
    },
  },
  {
    id: "s4",
    label: "Reviewing open PR statuses on GitHub…",
    breakdown: {
      toolName: "github:list_pull_requests",
      iconNode: makeIconNode(GithubIcon),
      title: "GitHub PRs",
      description: "Fetched open PRs labelled notification-redesign — 2 open, 1 approved and ready",
      badge: "Results (2)",
      inputs: `\`\`\`json
{
  "repo": "dust-tt/dust",
  "state": "open",
  "labels": ["notification-redesign"],
  "sort": "updated"
}
\`\`\``,
      output: `**Open PRs (notification redesign):**

- **PR #1308** — Notification grouping service *(Amélie)* — Approved by Wei, ready to merge
- **PR #1312** — In-app settings page *(Lucas)* — Draft, ~2h remaining`,
    },
  },
  {
    id: "s5",
    label: "Checked #engineering-sprint on Slack…",
    breakdown: {
      toolName: "slack:search_messages",
      iconNode: (
        <Avatar size="xs" visual={<SlackLogo className="s-h-4 s-w-4" />} />
      ),
      title: "Slack Search",
      description: "Found 6 messages in #engineering-sprint confirming PR approvals and progress updates",
      badge: "Results (6)",
      inputs: `\`\`\`json
{
  "channel": "#engineering-sprint",
  "query": "notification redesign status",
  "since": "2 days ago",
  "limit": 20
}
\`\`\``,
      output: `Found **6 relevant messages** in #engineering-sprint:

> **Wei Zhang** — *Today 11:12* — "Just reviewed Amélie's PR — looks solid. Approved."
> **Amélie Dubois** — *Today 09:12* — "Grouping service done, circuit breaker in place. PR is up."
> **Lucas Johansson** — *Today 09:30* — "In-app panel functional. Still need the settings page (~2h)."`,
    },
  },
  {
    id: "s6",
    label: "Create frame…",
    breakdown: {
      toolName: "dust:create_frame",
      iconNode: makeIconNode(DocumentTextIcon),
      title: "Create Frame",
      description: "Scaffolded a 4-section summary frame: Completed, In Progress, Deferred, Metrics",
      inputs: `\`\`\`json
{
  "title": "Notification Redesign — Sprint Status",
  "sections": ["completed", "in_progress", "deferred", "metrics"]
}
\`\`\``,
      output: `Frame created: **"Notification Redesign — Sprint Status"**

Sections scaffolded:
- ✅ Completed (4 items)
- 🔄 In progress (1 item)
- 📋 Deferred (2 items)
- 📊 Success metrics`,
    },
  },
  {
    id: "s7",
    label: "Using Sandbox to create a Python Script…",
    breakdown: {
      toolName: "sandbox:run_python",
      iconNode: makeIconNode(CommandLineIcon),
      title: "Running Sandbox",
      description: "Computed sprint completion metrics — 3/7 total, 3/3 P0 items complete",
      inputs: `\`\`\`python
# Calculate sprint completion metrics
items = {
    "grouping_service": "done",
    "preferences_api": "done",
    "inapp_panel_grouped": "done",
    "settings_page": "in_progress",
    "analytics_events": "not_started",
    "email_digest": "backlog",
    "mixpanel_dashboard": "backlog",
}

done = sum(1 for v in items.values() if v == "done")
total = len(items)
print(f"Completion: {done}/{total} ({done/total*100:.0f}%)")
\`\`\``,
      output: `\`\`\`
Completion: 3/7 (43%)
Core P0 items: 3/3 (100%)
Sprint target (P0 + settings page): 3/4 (75%)
\`\`\``,
    },
  },
  {
    id: "s8",
    label: "Formatting results…",
    breakdown: {
      toolName: "dust:format_output",
      iconNode: makeIconNode(RobotIcon),
      title: "Format Output",
      description: "Structured results into a markdown status table with recommendation paragraph",
      inputs: `\`\`\`json\n{\n  "format": "markdown",\n  "sections": ["status_table", "recommendation"],\n  "tone": "concise"\n}\n\`\`\``,
      output: `Output formatted as structured Markdown with:\n- Status table (7 rows)\n- Completion summary\n- Recommendation paragraph`,
    },
  },
  {
    id: "s9",
    label: "Running @Alfred to draft outreach emails…",
    breakdown: {
      toolName: "dust:run_agent",
      iconNode: (<Avatar emoji="🦅" backgroundColor="#d4edda" size="xs" name="Alfred" />),
      title: "Run @Alfred",
      description: "Asked Alfred to draft 3 personalised outreach emails for shortlisted candidates",
      viewConversation: true,
      inputs: `\`\`\`json\n{\n  "agent": "@Alfred",\n  "instruction": "Draft outreach emails for Marie Dupont, Julien Moreau, Sara Lindqvist."\n}\n\`\`\``,
      output: `Drafted **3 emails**:\n- Marie Dupont (Datadog) — subject: "Exciting opportunity at Dust"\n- Julien Moreau (Stripe) — subject: "Growing our infra team"\n- Sara Lindqvist (Spotify) — subject: "Senior eng role — Paris"`,
    },
  },
  {
    id: "s10",
    label: "Searching Notion for Q1 OKR progress…",
    breakdown: {
      toolName: "dust:search",
      iconNode: makeIconNode(MagnifyingGlassIcon),
      title: "Notion Search",
      description: "Queried Q1 OKR doc — found 4 objectives, 11 key results, 7 on track",
      badge: "Results (4)",
      inputs: `\`\`\`json\n{\n  "query": "Q1 OKR progress engineering",\n  "sources": ["Notion"],\n  "limit": 10\n}\n\`\`\``,
      output: `**Q1 OKR snapshot:**\n- O1: Ship notification redesign — 75%\n- O2: Reduce p95 latency — 90%\n- O3: Grow DAU — 60%\n- O4: Improve onboarding — 40%`,
    },
  },
  {
    id: "s11",
    label: "Fetching Datadog metrics for p95 latency…",
    breakdown: {
      toolName: "dust:search",
      iconNode: makeIconNode(GlobeAltIcon),
      title: "Datadog Query",
      description: "Pulled p95 API latency for last 7 days — avg 210ms, peak 480ms on Mar 1",
      badge: "Results (7)",
      inputs: `\`\`\`json\n{\n  "metric": "api.request.duration.p95",\n  "from": "7d",\n  "service": "api-server"\n}\n\`\`\``,
      output: `**p95 latency (7d):**\n- Avg: 210ms\n- Peak: 480ms (Mar 1 02:14 UTC)\n- SLO status: ✅ within threshold`,
    },
  },
  {
    id: "s12",
    label: "Running @hiring-screener on 12 candidates…",
    breakdown: {
      toolName: "dust:run_agent",
      iconNode: (<Avatar emoji="🔍" backgroundColor="#e8d5f5" size="xs" name="Screener" />),
      title: "Run @hiring-screener",
      description: "Screened 12 CVs against senior engineer criteria — 4 shortlisted",
      viewConversation: true,
      inputs: `\`\`\`json\n{\n  "agent": "@hiring-screener",\n  "candidates": 12,\n  "role": "Senior Engineer Paris"\n}\n\`\`\``,
      output: `Screened **12 profiles**:\n- ✅ 4 shortlisted\n- ❌ 8 rejected (skills mismatch or location)`,
    },
  },
  {
    id: "s13",
    label: "Checking #product-feedback Slack channel…",
    breakdown: {
      toolName: "slack:search_messages",
      iconNode: (<Avatar size="xs" visual={<SlackLogo className="s-h-4 s-w-4" />} />),
      title: "Slack Search",
      description: "Found 14 messages in #product-feedback mentioning notification pain points",
      badge: "Results (14)",
      inputs: `\`\`\`json\n{\n  "channel": "#product-feedback",\n  "query": "notification",\n  "since": "7 days ago"\n}\n\`\`\``,
      output: `**14 messages** found — top themes:\n- Too many email digests (6 mentions)\n- Mobile push unreliable (5 mentions)\n- Grouping appreciated (3 mentions)`,
    },
  },
  {
    id: "s14",
    label: "Running salary benchmarking script…",
    breakdown: {
      toolName: "sandbox:run_python",
      iconNode: makeIconNode(CommandLineIcon),
      title: "Running Sandbox",
      description: "Computed salary ranges for senior engineer Paris from 3 sources — €65-85K",
      inputs: `\`\`\`python\n# Salary benchmark aggregation\nsources = {"Glassdoor": (62000, 80000), "Levels.fyi": (70000, 90000), "WTTJ": (65000, 82000)}\nlow = min(v[0] for v in sources.values())\nhigh = max(v[1] for v in sources.values())\nprint(f"Range: €{low:,} – €{high:,}")\n\`\`\``,
      output: `\`\`\`\nRange: €62,000 – €90,000\nMedian: €74,000\nRecommended offer band: €65,000 – €82,000\n\`\`\``,
    },
  },
  {
    id: "s15",
    label: "Searching GitHub for recent infra changes…",
    breakdown: {
      toolName: "github:list_pull_requests",
      iconNode: makeIconNode(GithubIcon),
      title: "GitHub PRs",
      description: "Fetched merged PRs to infra/ last 14 days — 8 merged, 1 rollback",
      badge: "Results (8)",
      inputs: `\`\`\`json\n{\n  "repo": "dust-tt/dust",\n  "path": "infra/",\n  "state": "merged",\n  "since": "14d"\n}\n\`\`\``,
      output: `**8 merged infra PRs** (14d):\n- Upgrade Postgres 15 → 16\n- Add Redis cluster failover\n- Terraform GKE node pool resize\n- *(+5 more)*\n- ⚠️ 1 rollback: broken cert rotation`,
    },
  },
  {
    id: "s16",
    label: "Drafting Gmail to hiring candidates…",
    breakdown: {
      toolName: "gmail:create_draft",
      iconNode: makeIconNode(DocumentTextIcon),
      title: "Create Gmail Draft",
      description: "Drafted outreach to Marie Dupont (Datadog) — subject: \"Exciting opportunity at Dust\"",
      inputs: `\`\`\`json\n{\n  "to": "marie.dupont@datadog.com",\n  "subject": "Exciting opportunity at Dust",\n  "template": "outreach_senior_eng"\n}\n\`\`\``,
      output: `Draft created and saved to Gmail drafts folder.`,
    },
  },
  {
    id: "s17",
    label: "Running @analyst on Datadog export…",
    breakdown: {
      toolName: "dust:run_agent",
      iconNode: (<Avatar emoji="📊" backgroundColor="#fff3cd" size="xs" name="Analyst" />),
      title: "Run @analyst",
      description: "Asked analyst to summarise error rate trends — spike on Feb 28 identified",
      viewConversation: true,
      inputs: `\`\`\`json\n{\n  "agent": "@analyst",\n  "instruction": "Summarise error rate trends from attached Datadog export for the last 30 days."\n}\n\`\`\``,
      output: `**Error rate summary (30d):**\n- Avg: 0.12%\n- Spike: 2.3% on Feb 28 (deploy rollback)\n- Current: 0.08% ✅`,
    },
  },
  {
    id: "s18",
    label: "Querying Linear for blocked issues…",
    breakdown: {
      toolName: "dust:search",
      iconNode: makeIconNode(MagnifyingGlassIcon),
      title: "Linear Search",
      description: "Found 3 blocked issues in current sprint — all waiting on design review",
      badge: "Results (3)",
      inputs: `\`\`\`json\n{\n  "query": "blocked sprint:current",\n  "sources": ["Linear"],\n  "limit": 10\n}\n\`\`\``,
      output: `**3 blocked issues:**\n- ENG-412: Settings page — awaiting design sign-off\n- ENG-408: Digest template — no owner\n- ENG-399: A/B test setup — pending data team`,
    },
  },
  {
    id: "s19",
    label: "Running web search for competitor updates…",
    breakdown: {
      toolName: "web:search",
      iconNode: makeIconNode(GlobeAltIcon),
      title: "Web Search",
      description: "Searched senior engineer salary Paris 2026 — 13 results from Glassdoor, Levels.fyi, WTTJ",
      badge: "Results (13)",
      inputs: `\`\`\`json\n{\n  "query": "senior engineer salary Paris 2026",\n  "limit": 13\n}\n\`\`\``,
      output: `**13 results** — top sources:\n- Glassdoor: €62K–€80K\n- Levels.fyi: €70K–€90K\n- Welcome to the Jungle: €65K–€82K`,
    },
  },
  {
    id: "s20",
    label: "Synthesising all data into final report…",
    breakdown: {
      toolName: "dust:format_output",
      iconNode: makeIconNode(RobotIcon),
      title: "Format Output",
      description: "Aggregated all sources into a structured executive summary with action items",
      inputs: `\`\`\`json\n{\n  "format": "executive_summary",\n  "sections": ["status", "risks", "actions"],\n  "tone": "concise"\n}\n\`\`\``,
      output: `Executive summary compiled:\n- 3 sections\n- 7 action items\n- 2 risks flagged`,
    },
  },
];

// ---------------------------------------------------------------------------
// Parallel step timeline — list of [delay_ms, stepId, newStatus]
// ---------------------------------------------------------------------------

type TimelineEvent = [number, string, "active" | "done"];

const TIMELINE: TimelineEvent[] = [
  // Wave 1 — 5 tasks spin up quickly
  [800,   "s1",  "active"],
  [2000,  "s2",  "active"],
  [2500,  "s3",  "active"],
  [3000,  "s9",  "active"],
  [3500,  "s10", "active"],

  // First completions (out of order)
  [9000,  "s3",  "done"],
  [10000, "s10", "done"],

  // Wave 2 — new tasks spawn while wave 1 still running
  [10500, "s4",  "active"],
  [11000, "s11", "active"],
  [11500, "s12", "active"],
  [12000, "s13", "active"],

  // More wave 1 completions
  [14000, "s9",  "done"],
  [15000, "s1",  "done"],

  // Wave 2 completions (out of order)
  [16000, "s11", "done"],
  [17000, "s13", "done"],

  // Wave 3 — peak parallelism, up to 8 active simultaneously
  [17500, "s5",  "active"],
  [18000, "s14", "active"],
  [18500, "s15", "active"],
  [19000, "s16", "active"],

  // Wave 2 tail completions
  [20000, "s4",  "done"],
  [21000, "s12", "done"],
  [22000, "s2",  "done"],

  // Wave 3 completions
  [23000, "s16", "done"],
  [24000, "s5",  "done"],
  [24500, "s17", "active"],
  [25000, "s18", "active"],
  [26000, "s14", "done"],

  // Wave 4 — final stretch
  [27000, "s6",  "active"],
  [27500, "s19", "active"],
  [28000, "s15", "done"],
  [29000, "s17", "done"],
  [30000, "s18", "done"],
  [31000, "s7",  "active"],
  [32000, "s19", "done"],
  [33000, "s6",  "done"],
  [34000, "s20", "active"],
  [35000, "s7",  "done"],
  [38000, "s20", "done"],
  [39000, "s8",  "active"],
  [42000, "s8",  "done"],
];

// Streaming starts while some steps are still running
const STREAM_START_DELAY = 30000;
const RESPONSE_DELAY = 44000;
// Chars per second — tune for desired feel
const STREAM_CHARS_PER_SEC = 60;

// ---------------------------------------------------------------------------
// Story component
// ---------------------------------------------------------------------------

export default function SandboxConversation() {
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[] | null>(
    null
  );
  // Steps saved when agent response arrives — used by the "Completed" button
  const [completedSteps, setCompletedSteps] = useState<ThinkingStep[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusedStepId, setFocusedStepId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  // Allotment split panel
  const allotmentRef = useRef<React.ComponentRef<typeof Allotment>>(null);
  const allotmentWrapperRef = useRef<HTMLDivElement>(null);
  const wasRightPanelOpen = useRef(false);
  const [rightPanelRatio, setRightPanelRatio] = useState(0.38);
  // Disable CSS transition while user is manually dragging the sash
  const [isResizing, setIsResizing] = useState(false);
  const resizingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (wasRightPanelOpen.current === panelOpen) return;
    wasRightPanelOpen.current = panelOpen;
    if (!allotmentRef.current) return;
    requestAnimationFrame(() => {
      // resize() takes absolute pixel values — compute from the container width
      const totalPx = allotmentWrapperRef.current?.offsetWidth ?? 1200;
      if (panelOpen) {
        const ratio = Math.min(Math.max(rightPanelRatio, 0.2), 0.5);
        const rightPx = Math.round(totalPx * ratio);
        allotmentRef.current?.resize([totalPx - rightPx, rightPx]);
      } else {
        allotmentRef.current?.resize([totalPx, 0]);
      }
    });
  }, [panelOpen, rightPanelRatio]);

  const handleStepClick = useCallback((stepId: string) => {
    setFocusedStepId(stepId);
    setPanelOpen(true);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (sent) return;

      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];

      const now = new Date();

      setMessages([
        { kind: "section", id: "section-today", label: "Today" },
        {
          kind: "message",
          id: `msg-user-${Date.now()}`,
          content: text,
          timestamp: now,
          ownerId: locutor.id,
          ownerType: "user",
          type: "user",
          group: {
            id: "g-locutor-1",
            type: "locutor",
            timestamp: now.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            infoChip: { icon: "bolt" },
          },
        },
      ]);
      setSent(true);

      // Initialize all steps as not-yet-present
      const stepMap = new Map<string, ThinkingStep>();

      // Schedule each timeline event
      TIMELINE.forEach(([delay, stepId, newStatus]) => {
        const t = setTimeout(() => {
          const def = STEP_DEFS.find((s) => s.id === stepId);
          if (!def) return;

          stepMap.set(stepId, { ...def, status: newStatus, updatedAt: Date.now() });
          // Build ordered list (preserve insertion order by step index)
          const ordered = STEP_DEFS.filter((d) => stepMap.has(d.id)).map(
            (d) => stepMap.get(d.id)!
          );
          setThinkingSteps([...ordered]);
        }, delay);
        timeoutsRef.current.push(t);
      });

      // Start a character-by-character stream below the thinking steps
      const tStream = setTimeout(() => {
        const startTime = Date.now();
        const msPerChar = 1000 / STREAM_CHARS_PER_SEC;

        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const charCount = Math.min(
            Math.floor(elapsed / msPerChar),
            AGENT_RESPONSE.length
          );
          setStreamingContent(AGENT_RESPONSE.slice(0, charCount));
          if (charCount >= AGENT_RESPONSE.length) {
            clearInterval(interval);
          }
        }, 16); // ~60fps
        intervalsRef.current.push(interval);
      }, STREAM_START_DELAY);
      timeoutsRef.current.push(tStream);

      // Finalise: steps done → clear interval, promote content to real message
      const tResponse = setTimeout(() => {
        intervalsRef.current.forEach(clearInterval);
        intervalsRef.current = [];
        setThinkingSteps((current) => {
          if (current) setCompletedSteps(current);
          return null;
        });
        setStreamingContent(null);
        setPanelOpen(false);
        const responseTime = new Date();
        setMessages((prev) => [
          ...prev,
          {
            kind: "message" as const,
            id: `msg-agent-${Date.now()}`,
            timestamp: responseTime,
            ownerId: agent.id,
            ownerType: "agent" as const,
            type: "agent" as const,
            group: {
              id: "g-agent-1",
              type: "agent" as const,
              name: agent.name,
              timestamp: responseTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              completionStatus: `${STEP_DEFS.length} steps · ${Math.floor(RESPONSE_DELAY / 60000)}m ${Math.round((RESPONSE_DELAY % 60000) / 1000)}s`,
              avatar: {
                emoji: agent.emoji,
                backgroundColor: agent.backgroundColor,
              },
            },
            markdown: AGENT_RESPONSE,
          },
        ]);
      }, RESPONSE_DELAY);
      timeoutsRef.current.push(tResponse);

    },
    [sent]
  );

  const conversation: Conversation = {
    id: "conv-sandbox-1",
    title: "Sandbox Conversation",
    createdAt: new Date(),
    updatedAt: new Date(),
    userParticipants: [locutor.id],
    agentParticipants: [agent.id],
    messages,
  };

  const panelSteps = thinkingSteps ?? completedSteps;

  return (
    <div className="s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <style>{`
        :root {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[100]}, ${customColors.blue[400]}, ${customColors.gray[100]});
          --separator-border: transparent;
          --sash-size: 8px;
          --sash-hover-size: 2px;
        }
        .s-dark {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[900]}, ${customColors.blue[600]}, ${customColors.gray[900]});
          --separator-border: transparent;
        }
        /* Animate panel open/close — disabled while user is dragging */
        .sandbox-allotment:not(.is-resizing)
          .allotment-module_splitViewView__MGZ6O {
          transition: all 300ms ease-in-out;
        }
        .allotment-module_splitView__L-yRc.allotment-module_separatorBorder__x-rDS
          > .allotment-module_splitViewContainer__rQnVa
          > .allotment-module_splitViewView__MGZ6O:not(:first-child)::before {
          width: 1px;
          transition: width 200ms, background-color 200ms;
        }
      `}</style>
      <div ref={allotmentWrapperRef} className="s-flex s-h-full s-w-full">
        <Allotment
          ref={allotmentRef}
          vertical={false}
          proportionalLayout={true}
          defaultSizes={[100, 0]}
          onChange={(sizes) => {
            // Track dragging: if onChange fires shortly after a pointer-down,
            // mark as resizing to disable the CSS transition.
            if (resizingTimeoutRef.current)
              clearTimeout(resizingTimeoutRef.current);
            setIsResizing(true);
            resizingTimeoutRef.current = setTimeout(
              () => setIsResizing(false),
              150
            );

            const right = sizes[1];
            if (typeof right !== "number" || right <= 0) return;
            const total = sizes.reduce(
              (s, v) => s + (typeof v === "number" ? v : 0),
              0
            );
            if (total > 0) setRightPanelRatio(right / total);
          }}
          className={`sandbox-allotment s-h-full s-w-full s-flex-1${isResizing ? " is-resizing" : ""}`}
        >
          {/* Left pane — conversation */}
          <Allotment.Pane
            minSize={360}
            preferredSize={62}
            className="s-flex s-h-full s-flex-col s-overflow-hidden"
          >
            <ConversationView
              conversation={conversation}
              locutor={locutor}
              users={[]}
              agents={[agent]}
              conversationsWithMessages={[]}
              showBackButton={false}
              conversationTitle="Sandbox Conversation"
              projectTitle="Sandbox"
              onCompletionStatusClick={() => setPanelOpen((prev) => !prev)}
              inputBar={
                <InputBar
                  defaultValue={!sent ? PREFILLED_MESSAGE : undefined}
                  onSend={handleSend}
                  placeholder="Send a message…"
                  className="s-shadow-xl"
                />
              }
              thinkingNode={
                thinkingSteps !== null ? (
                  <div className="s-flex s-flex-col s-gap-2">
                    <AgentThinkingSteps
                      steps={thinkingSteps}
                      agentName={agent.name}
                      agentAvatar={{
                        emoji: agent.emoji,
                        backgroundColor: agent.backgroundColor,
                      }}
                      onStepClick={handleStepClick}
                    />
                    {streamingContent && (
                      <div className="s-pl-9 s-text-base s-text-foreground dark:s-text-foreground-night">
                        <Markdown
                          content={streamingContent}
                          isStreaming
                        />
                      </div>
                    )}
                  </div>
                ) : undefined
              }
            />
          </Allotment.Pane>

          {/* Right pane — always mounted so it can animate in/out */}
          <Allotment.Pane
            minSize={0}
            preferredSize={0}
            className={`s-flex s-h-full s-flex-col s-overflow-hidden${panelOpen ? " s-border-l s-border-border dark:s-border-border-night" : ""}`}
          >
            <AgentStepBreakdownPanel
              steps={panelSteps}
              focusedStepId={focusedStepId}
              onClose={() => setPanelOpen(false)}
            />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}
