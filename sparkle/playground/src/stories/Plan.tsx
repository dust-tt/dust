import {
  Button,
  Chip,
  cn,
  ListSelect,
  Markdown,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import {
  ConversationSidePanel,
  type SidePanelTab,
} from "../components/ConversationSidePanel";
import { ConversationTopBar } from "../components/ConversationTopBar";
import { NavigationSidebar } from "../components/NavigationSidebar";
import {
  AskUserQuestion,
  type UserQuestion,
  type UserQuestionAnswer,
} from "../components/AskUserQuestion";
import { InputBar } from "../components/InputBar";
import { MessageNavigationPill } from "../components/MessageNavigationPill";
import {
  NewConversationActiveIndicator,
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
  NewConversationUserMessage,
} from "../components/NewConversationMessages";
import {
  countProgress,
  editPlan,
  type PlanPresence,
  planPanelDecision,
} from "../components/planUtils";
import { mockAgents, mockUsers } from "../data";

/**
 * Plan mode — production behaviour.
 *
 * How it actually works in front (see `front/components/assistant/conversation/
 * plan_mode/` and `front/lib/resources/skill/code_defined/system/plan_mode.ts`):
 *
 *  - The plan is a markdown file, `plan.md`, with a `# title`, a `## Context`
 *    section and a `## Tasks` checklist. The agent writes it with `create_plan`
 *    and mutates it with `edit_plan` (one exact string replacement per call).
 *    Markers: `- [ ]` open, `- [x]` done, `- [!]` blocked.
 *  - `[!]` counts toward the total but not toward done, so blocked work stays
 *    visible in the counter.
 *  - The panel auto-opens the first time a plan appears (never on load, never on
 *    mobile) and auto-closes when the plan is closed — see `planPanelDecision`.
 *
 * Two deliberate divergences from production, both from Figma:
 *  - the approval question replaces the composer instead of sitting in the chat
 *    (14800:126108), and task rows carry status badges instead of checkboxes
 *    (14800:126251);
 *  - `Credits` / `Files` / `Plan` live in the top bar and become
 *    the side panel's tab strip in place when it opens, so the panel slides open
 *    underneath them (14800:125175 + 14797:120638). The plan has its own tab
 *    rather than a panel of its own.
 *  - **There is no plan-approval UI.** Plan mode has no approval tool: when the
 *    agent needs sign-off it must call `ask_user_question` as the last thing in
 *    the turn, which renders the standard `UserAnswerRequired` card. If the user
 *    does not approve, the agent must stop and ask what to change.
 *  - Exactly one active plan per conversation. `close_plan` retires it.
 *
 * Driving the story: it opens as an empty conversation. Send anything in the
 * composer and the agent starts a plan for it — the plan itself is canned, so
 * every request produces the same `plan.md`. Send "restart" to empty it again.
 */

const locutor = mockUsers[0]; // Emma Andersson
const agent = mockAgents[11]; // StrategyPlanner 🎯

const CONVERSATION_TITLE = "Q3 enterprise churn risk";

const PLAN_INTRO = `38 accounts and four sources — this is worth planning before I touch anything. I've written it up in \`plan.md\`.`;

// What `create_plan` writes. Structure follows PLAN_MODE_SKELETON in front.
const INITIAL_PLAN = `# Q3 enterprise churn-risk brief

## Context
Emma asked for a churn-risk brief on every enterprise deal closed in Q3 — 38 accounts, $6.2M ARR. The signals live in four places: Salesforce (deal data), Notion (account notes), Zendesk (support history) and the shared deal-room channels in Slack. Deliverable is one page per account: risk score, the signals behind it, and a recommended next step.

## Tasks
- [ ] Pull the Q3 deals — closed-won enterprise opportunities above $50k ARR, from Salesforce
- [ ] Read the account notes — the Notion page for each deal, keeping renewal dates and open commitments
- [ ] Review the support history — Zendesk tickets per account since the close date, flagging escalations
- [ ] Check the deal rooms — shared Slack channels that have gone quiet since close
- [ ] Write the briefs — one page per account: risk score, the signals behind it, a recommended next step
`;

// Each `edit_plan` call: one exact string replacement, as in production.
interface PlanEdit {
  label: string;
  oldString: string;
  newString: string;
  durationMs: number;
}

// Each task's text leads with a short phrase before an em dash; the panel sets
// that lead in bold as the row's title (see `splitTaskLead`). Results are
// appended as a sentence so the lead stays put.
const PLAN_EDITS: PlanEdit[] = [
  {
    label: "pulling the Q3 deals",
    oldString:
      "- [ ] Pull the Q3 deals — closed-won enterprise opportunities above $50k ARR, from Salesforce",
    newString:
      "- [x] Pull the Q3 deals — closed-won enterprise opportunities above $50k ARR, from Salesforce. 38 accounts, $6.2M ARR.",
    durationMs: 2000,
  },
  {
    label: "reading the account notes",
    oldString:
      "- [ ] Read the account notes — the Notion page for each deal, keeping renewal dates and open commitments",
    newString:
      "- [x] Read the account notes — the Notion page for each deal, keeping renewal dates and open commitments. 38 pages read, 11 renewals inside 90 days.",
    durationMs: 3000,
  },
  {
    label: "reviewing the support history",
    oldString:
      "- [ ] Review the support history — Zendesk tickets per account since the close date, flagging escalations",
    newString:
      "- [x] Review the support history — Zendesk tickets per account since the close date, flagging escalations. 412 tickets, 17 escalations.",
    durationMs: 2600,
  },
  {
    // `[!]` — blocked. Counts toward total, not toward done.
    label: "checking the deal rooms",
    oldString:
      "- [ ] Check the deal rooms — shared Slack channels that have gone quiet since close",
    newString:
      "- [!] Check the deal rooms — shared Slack channels that have gone quiet since close. 9 quiet for 30+ days; 3 more are private and I have no access.",
    durationMs: 2200,
  },
  {
    label: "writing the briefs",
    oldString:
      "- [ ] Write the briefs — one page per account: risk score, the signals behind it, a recommended next step",
    newString:
      "- [x] Write the briefs — one page per account: risk score, the signals behind it, a recommended next step. 38 briefs drafted.",
    durationMs: 3200,
  },
];

const APPROVAL_QUESTION: UserQuestion = {
  question: "The research plan is ready. Shall we continue?",
  options: [
    {
      label: "Approve",
      description: "Run the five tasks and report back.",
    },
    {
      label: "Revise the plan",
      description: "Tell me what to change before anything runs.",
    },
    {
      label: "Drop the plan",
      description: "Close plan.md and forget about it.",
    },
  ],
  multiSelect: false,
};

const REVISION_QUESTION: UserQuestion = {
  question: "What should I change before I start?",
  options: [
    {
      label: "Narrow it to the 11 accounts renewing inside 90 days",
      description: "Faster, and covers the renewals that are actually at risk.",
    },
    {
      label: "Drop the Slack deal-room pass",
      description: "Three of the channels are private anyway.",
    },
    {
      label: "Proceed anyway without approval",
      description: "Run the plan as drafted.",
    },
  ],
  multiSelect: true,
};

const DECLINED_QUESTION: UserQuestion = {
  question:
    "I won't start without a decision. How do you want to handle the plan?",
  options: [
    { label: "Approve it as drafted" },
    { label: "Revise it first" },
    { label: "Drop the plan" },
  ],
  multiSelect: false,
};

const FINAL_SUMMARY = `**Churn-risk brief — Q3 enterprise cohort**

- **High risk (6 accounts)** — Northwind, Bellamy Group, Kestrel Labs, Arden Health, Pallas, Vertiz. All six pair a support escalation with a deal room that has gone quiet.
- **Watch (11 accounts)** — renewal inside 90 days, no exec sponsor contact since close.
- **Healthy (21 accounts)** — no escalations, active usage, sponsor engaged.

The six high-risk accounts are **$1.4M ARR** renewing before December. Recommended next step: sponsor check-in this week, starting with Northwind (renews Nov 12).

One task is left blocked in the plan: three deal-room channels are private, so those accounts were scored on Salesforce, Notion and Zendesk signals only.`;

// ---------------------------------------------------------------------------

type Phase =
  // Nothing asked yet: an empty conversation with just the composer.
  | "idle"
  | "creating_plan"
  | "awaiting_approval"
  | "revising"
  | "declined"
  | "running"
  | "done"
  | "dropped";

const CREATE_PLAN_MS = 2200;

// front: DEFAULT_RIGHT_PANEL_SIZE in components/assistant/conversation/constant.ts
const DEFAULT_RIGHT_PANEL_SIZE = 40;

export default function PlanStory() {
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [appliedEdits, setAppliedEdits] = useState(0);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [panel, setPanel] = useState<SidePanelTab | null>(null);
  const [answerLog, setAnswerLog] = useState<string[]>([]);

  const timers = useRef<number[]>([]);
  const planPresenceRef = useRef<PlanPresence>("unknown");
  const panelRef = useRef<ImperativePanelHandle | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  /**
   * front's `ConversationSidePanelContext`: closing collapses the panel through
   * the imperative ref and leaves the panel type set, so the content stays
   * mounted for the animation. `onPanelClosed` clears it from `onTransitionEnd`
   * once the panel has actually collapsed — that is production's fix for
   * content flickering mid-close, and it replaces retaining a copy of the state.
   */
  const onPanelClosed = useCallback(() => setPanel(null), []);
  const closePanel = useCallback(() => {
    if (panelRef.current) {
      panelRef.current.collapse();
    } else {
      onPanelClosed();
    }
  }, [onPanelClosed]);

  const openPlanTab = useCallback(() => setPanel("plan"), []);

  /** front's `togglePanel`: re-selecting the panel that is shown closes it. */
  const selectPanelTab = useCallback(
    (tab: SidePanelTab) => {
      if (panel === tab) {
        closePanel();
        return;
      }
      setPanel(tab);
    },
    [panel, closePanel]
  );

  // Back to an empty conversation. Nothing runs until the user sends something.
  useEffect(() => {
    clearTimers();
    setPhase("idle");
    setUserMessage(null);
    setPlanContent(null);
    setAppliedEdits(0);
    setRunningLabel(null);
    setPanel(null);
    setAnswerLog([]);
    planPresenceRef.current = "unknown";

    return clearTimers;
  }, [runId, clearTimers]);

  // Single owner of the plan panel: open when the plan appears, close when it
  // goes away — ported from front's `PlanCard`.
  useEffect(() => {
    const { next, action } = planPanelDecision({
      isLoading: false,
      hasContent: !!planContent,
      isMobile: false,
      isPanelOpen: panel === "plan",
      prev: planPresenceRef.current,
    });
    planPresenceRef.current = next;
    if (action === "open") {
      openPlanTab();
    } else if (action === "close") {
      closePanel();
    }
  }, [planContent, panel, openPlanTab, closePanel]);

  // front only expands here; collapsing goes through `closePanel`.
  useEffect(() => {
    if (!panelRef.current || !panel) {
      return;
    }
    panelRef.current.expand(DEFAULT_RIGHT_PANEL_SIZE);
  }, [panel]);

  const runPlan = useCallback(() => {
    setPhase("running");

    let elapsed = 0;
    PLAN_EDITS.forEach((edit, index) => {
      timers.current.push(
        window.setTimeout(() => setRunningLabel(edit.label), elapsed)
      );

      elapsed += edit.durationMs;

      timers.current.push(
        window.setTimeout(() => {
          setPlanContent((current) => {
            if (!current) {
              return current;
            }
            // edit_plan: exactly-once replacement, or the edit fails.
            return editPlan(current, edit.oldString, edit.newString) ?? current;
          });
          setAppliedEdits(index + 1);
          if (index === PLAN_EDITS.length - 1) {
            setRunningLabel(null);
            setPhase("done");
          }
        }, elapsed)
      );
    });
  }, []);

  const handleApprovalAnswer = useCallback(
    (answer: UserQuestionAnswer) => {
      const picked =
        answer.customResponse ??
        APPROVAL_QUESTION.options[answer.selectedOptions[0]]?.label ??
        "";
      setAnswerLog((log) => [...log, picked]);

      if (picked === "Approve") {
        runPlan();
        return;
      }
      if (picked === "Drop the plan") {
        setPlanContent(null);
        setPhase("dropped");
        return;
      }
      // Anything else — including free text — is not an approval: stop and ask.
      setPhase("revising");
    },
    [runPlan]
  );

  const handleRevisionAnswer = useCallback(
    (answer: UserQuestionAnswer) => {
      const labels = answer.customResponse
        ? [answer.customResponse]
        : answer.selectedOptions.map(
            (i) => REVISION_QUESTION.options[i]?.label ?? ""
          );
      setAnswerLog((log) => [...log, labels.join(" · ")]);

      if (labels.includes("Proceed anyway without approval")) {
        runPlan();
        return;
      }
      // A revision: production edits the plan and asks for approval again.
      setPhase("awaiting_approval");
    },
    [runPlan]
  );

  const handleDeclinedAnswer = useCallback(
    (answer: UserQuestionAnswer) => {
      const picked =
        answer.customResponse ??
        DECLINED_QUESTION.options[answer.selectedOptions[0]]?.label ??
        "";
      setAnswerLog((log) => [...log, picked]);

      if (picked === "Approve it as drafted") {
        runPlan();
      } else if (picked === "Drop the plan") {
        setPlanContent(null);
        setPhase("dropped");
      } else {
        setPhase("revising");
      }
    },
    [runPlan]
  );

  /**
   * The agent's first turn, triggered by the user sending a message: create_plan,
   * then ask for approval. The plan itself is canned, so any request produces the
   * same `plan.md`.
   */
  const startPlan = useCallback(
    (request: string) => {
      clearTimers();
      setUserMessage(request);
      setPlanContent(null);
      setAppliedEdits(0);
      setRunningLabel(null);
      setAnswerLog([]);
      setPhase("creating_plan");

      timers.current.push(
        window.setTimeout(() => {
          setPlanContent(INITIAL_PLAN);
          setPhase("awaiting_approval");
        }, CREATE_PLAN_MS)
      );
    },
    [clearTimers]
  );

  /** Sending anything starts a plan for it; "restart" empties the conversation. */
  const handleSend = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text) {
        return;
      }
      if (text.toLowerCase() === "restart") {
        setRunId((n) => n + 1);
        return;
      }
      startPlan(text);
    },
    [startPlan]
  );

  const closePlan = useCallback(() => {
    clearTimers();
    setPlanContent(null);
    setRunningLabel(null);
    setPhase("dropped");
  }, [clearTimers]);

  // Which question, if any, currently owns the composer slot.
  const pendingQuestion = useMemo(() => {
    switch (phase) {
      case "awaiting_approval":
        return {
          actionId: `approval-${answerLog.length}`,
          question: APPROVAL_QUESTION,
          onAnswer: handleApprovalAnswer,
          onSkip: () => setPhase("declined"),
        };
      case "declined":
        return {
          actionId: `declined-${answerLog.length}`,
          question: DECLINED_QUESTION,
          onAnswer: handleDeclinedAnswer,
          // Re-asking: bump the log so the card resets rather than staying
          // stuck in its submitting state.
          onSkip: () => setAnswerLog((log) => [...log, "skipped"]),
        };
      case "revising":
        return {
          actionId: `revision-${answerLog.length}`,
          question: REVISION_QUESTION,
          onAnswer: handleRevisionAnswer,
          onSkip: () => setPhase("declined"),
        };
      default:
        return null;
    }
  }, [
    phase,
    answerLog.length,
    handleApprovalAnswer,
    handleDeclinedAnswer,
    handleRevisionAnswer,
  ]);

  const agentAvatar = useMemo(
    () => ({ emoji: agent.emoji, backgroundColor: agent.backgroundColor }),
    []
  );

  // Drives the `done/total` next to the top bar's Plan label. Derived from the
  // markdown, like everything else here, so it ticks over as `edit_plan` lands.
  const planProgress = useMemo(() => countProgress(planContent), [planContent]);

  return (
    <div className="flex h-screen w-full bg-app-background">
      <NavigationSidebar activeConversation={CONVERSATION_TITLE} />

      {/* Figma 14969:31873: the conversation area is a card on the app
          background — 8px of margin on every side except against the nav, a 1px
          border and a 12px radius. */}
      <div className="min-w-0 flex-1 py-2 pr-2">
        <div className="h-full overflow-hidden rounded-xl border border-border bg-background">
          <ResizablePanelGroup
            direction="horizontal"
            className="flex h-full w-full flex-1"
          >
            <ResizablePanel defaultSize={100}>
              <div className="flex h-full flex-col overflow-hidden">
                {/* front mounts ConversationTitle inside this column, so its
                right-hand buttons align to the conversation, not the window. */}
                <ConversationTopBar
                  title={CONVERSATION_TITLE}
                  activeTab={panel}
                  onSelectTab={selectPanelTab}
                  isPlanRunning={phase === "running"}
                  planProgress={planProgress}
                />
                <div className="relative flex flex-1 flex-col overflow-hidden">
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <NewConversationContainer>
                      <div className="h-6 shrink-0" />

                      {userMessage && (
                        <NewConversationMessageGroup
                          type="locutor"
                          name={locutor.fullName}
                          timestamp="09:14"
                        >
                          <NewConversationUserMessage isLastMessage>
                            {userMessage}
                          </NewConversationUserMessage>
                        </NewConversationMessageGroup>
                      )}

                      {phase === "creating_plan" && (
                        <NewConversationActiveIndicator
                          type="agent"
                          name={agent.name}
                          action="creating plan"
                          avatar={agentAvatar}
                        />
                      )}

                      {phase !== "idle" && phase !== "creating_plan" && (
                        <NewConversationMessageGroup
                          type="agent"
                          name={agent.name}
                          timestamp="09:14"
                          avatar={agentAvatar}
                        >
                          <NewConversationAgentMessage isLastMessage>
                            <div className="flex flex-col gap-3">
                              <ToolRow label="Plan created" />
                              <span>{PLAN_INTRO}</span>
                            </div>
                          </NewConversationAgentMessage>
                        </NewConversationMessageGroup>
                      )}

                      {/* The question itself is NOT in the chat — it replaces the
                      composer at the bottom (Figma 14800:126108). Only the
                      agent's accompanying line stays in the thread. */}
                      {phase === "declined" && (
                        <NewConversationMessageGroup
                          type="agent"
                          name={agent.name}
                          timestamp="09:15"
                          avatar={agentAvatar}
                        >
                          <NewConversationAgentMessage isLastMessage>
                            You skipped the question, so nothing has run.
                          </NewConversationAgentMessage>
                        </NewConversationMessageGroup>
                      )}

                      {phase === "revising" && (
                        <NewConversationMessageGroup
                          type="agent"
                          name={agent.name}
                          timestamp="09:16"
                          avatar={agentAvatar}
                        >
                          <NewConversationAgentMessage isLastMessage>
                            Understood — I haven't started. Pick what to change
                            and I'll redraft <code>plan.md</code>, then ask
                            again.
                          </NewConversationAgentMessage>
                        </NewConversationMessageGroup>
                      )}

                      {(phase === "running" || phase === "done") && (
                        <NewConversationMessageGroup
                          type="agent"
                          name={agent.name}
                          timestamp="09:16"
                          avatar={agentAvatar}
                          completionStatus={
                            phase === "done" ? "Completed in 4 min" : undefined
                          }
                        >
                          <NewConversationAgentMessage isLastMessage>
                            <div className="flex flex-col gap-3">
                              <span>
                                Approved — starting now. I'll tick tasks off in{" "}
                                <code>plan.md</code> as I go.
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {PLAN_EDITS.slice(0, appliedEdits).map(
                                  (edit) => (
                                    <ToolRow
                                      key={edit.label}
                                      label="Plan updated"
                                    />
                                  )
                                )}
                              </div>
                            </div>
                          </NewConversationAgentMessage>
                        </NewConversationMessageGroup>
                      )}

                      {phase === "running" && runningLabel && (
                        <NewConversationActiveIndicator
                          type="agent"
                          name={agent.name}
                          action={runningLabel}
                          avatar={agentAvatar}
                        />
                      )}

                      {phase === "done" && (
                        <NewConversationMessageGroup
                          type="agent"
                          name={agent.name}
                          timestamp="09:20"
                          avatar={agentAvatar}
                          completionStatus="Completed in 4 min"
                        >
                          <NewConversationAgentMessage isLastMessage>
                            <Markdown content={FINAL_SUMMARY} />
                          </NewConversationAgentMessage>
                        </NewConversationMessageGroup>
                      )}

                      {phase === "dropped" && (
                        <NewConversationMessageGroup
                          type="agent"
                          name={agent.name}
                          timestamp="09:16"
                          avatar={agentAvatar}
                        >
                          <NewConversationAgentMessage isLastMessage>
                            <div className="flex flex-col gap-3">
                              <ToolRow label="Plan closed" />
                              <span>
                                Dropped the plan — nothing ran and nothing was
                                written. Say the word and I'll draft a new one.
                              </span>
                            </div>
                          </NewConversationAgentMessage>
                        </NewConversationMessageGroup>
                      )}

                      <div className="h-6 shrink-0" />
                    </NewConversationContainer>
                  </div>

                  {/* front: `AgentInputBar` is a sticky footer under the message
                  column, not a floating overlay. */}
                  {/* Width matches NewConversationContainer so the composer lines
                  up with the message column. */}
                  <div className="flex w-full justify-center">
                    <div className="relative z-20 flex w-full max-w-4xl flex-col px-4 pt-4 pb-6">
                      <div className="flex w-full justify-center gap-2">
                        <MessageNavigationPill />
                      </div>
                      {pendingQuestion ? (
                        <AskUserQuestion
                          actionId={pendingQuestion.actionId}
                          question={pendingQuestion.question}
                          onAnswer={pendingQuestion.onAnswer}
                          onSkip={pendingQuestion.onSkip}
                        />
                      ) : (
                        <InputBar
                          toolbarStyle="production"
                          agent={{
                            name: agent.name,
                            emoji: agent.emoji,
                            backgroundColor: agent.backgroundColor,
                          }}
                          contextUsagePercentage={62}
                          onSend={handleSend}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ResizablePanel>

            {/* front: ConversationSidePanelContainer — handle + collapsible panel,
            300ms width transition, and the content cleared only once the
            collapse transition has ended. */}
            <ResizableHandle
              withHandle={!!panel}
              disabled={!panel}
              className="z-50"
            />

            <ResizablePanel
              ref={panelRef}
              minSize={20}
              defaultSize={0}
              onTransitionEnd={() => {
                if (panelRef.current?.isCollapsed()) {
                  onPanelClosed();
                }
              }}
              collapsible
              collapsedSize={0}
              className={cn(
                "flex-0 overflow-hidden transition-all duration-300 ease-out",
                !panel && "hidden w-0 md:block",
                "md:relative",
                panel &&
                  "absolute inset-0 bg-panel-background md:relative md:inset-auto"
              )}
            >
              {panel && (
                <ConversationSidePanel
                  tab={panel}
                  onTabChange={setPanel}
                  onClose={closePanel}
                  creditsUsage={{
                    count: 8420,
                    limit: 10000,
                    timeframe: "this month",
                  }}
                  planContent={planContent}
                  isPlanRunning={phase === "running"}
                  onClosePlan={closePlan}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** The `create_plan` / `edit_plan` / `close_plan` tool rows, using the exact
 * `displayLabels` from front's `PLAN_MODE_TOOLS_METADATA`. */
function ToolRow({ label }: { label: string }) {
  return <Chip size="mini" icon={ListSelect} label={label} />;
}
