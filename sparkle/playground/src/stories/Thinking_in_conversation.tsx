import {
  Avatar,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  cn,
  CodeSlashIcon,
  ExternalLinkIcon,
  GlobeAltIcon,
  GmailLogo,
  MagnifyingGlassIcon,
  Markdown,
  RobotIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  TypingAnimation,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import {
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
  NewConversationSectionHeading,
  NewConversationUserMessage,
} from "../components/NewConversationMessages";
import { InputBar } from "../components/InputBar";
import { mockAgents, mockUsers } from "../data";

const locutor = mockUsers[0];
const agent = mockAgents[0];

// ---------------------------------------------------------------------------
// Thinking steps data
// ---------------------------------------------------------------------------

type ThinkingStep = {
  id: string;
  thinkingLabel: string;
  icon: React.ComponentType;
  iconBg: string;
  title: string;
  description: string;
  resultCount?: number;
  hasViewConversation?: boolean;
};

const THINKING_STEPS: ThinkingStep[] = [
  {
    id: "search",
    thinkingLabel: "Searching Lever for matching profiles",
    icon: MagnifyingGlassIcon,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Hiring Data Search",
    description:
      'Searched "senior engineer Paris" — 13 results from Lever, matched 4 profiles with required skills',
    resultCount: 13,
  },
  {
    id: "alfred",
    thinkingLabel: "Running @Alfred to draft outreach emails",
    icon: RobotIcon,
    iconBg: "s-bg-emerald-100 dark:s-bg-emerald-900",
    title: "Run @Alfred",
    description:
      "Asked to draft outreach emails for 3 shortlisted candidates — generated 3 personalized drafts",
    hasViewConversation: true,
  },
  {
    id: "dust-task",
    thinkingLabel: "Delegating salary benchmarking to @dust-task",
    icon: RobotIcon,
    iconBg: "s-bg-emerald-100 dark:s-bg-emerald-900",
    title: "Run @dust-task",
    description:
      "Delegated salary benchmarking for senior engineer roles in Paris — returned €65–85K range",
  },
  {
    id: "sandbox",
    thinkingLabel: "Running Sandbox to generate charts and deck",
    icon: CodeSlashIcon,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Running Sandbox",
    description:
      "Executed analysis.py — generated 3 charts, built 12-slide PowerPoint deck, exported source data to Excel",
  },
  {
    id: "websearch",
    thinkingLabel: "Searching the web for salary benchmarks",
    icon: GlobeAltIcon,
    iconBg: "s-bg-blue-100 dark:s-bg-blue-900",
    title: "Web Search",
    description:
      'Searched "senior engineer salary Paris 2026" — 13 results, pulled data from Glassdoor, Levels.fyi, Welcome to the Jungle',
    resultCount: 13,
  },
  {
    id: "gmail",
    thinkingLabel: "Creating Gmail draft for Marie Dupont",
    icon: GmailLogo,
    iconBg: "s-bg-white dark:s-bg-slate-800",
    title: "Create Gmail Draft",
    description:
      'Drafted outreach to Marie Dupont (Datadog) — subject: "Exciting opportunity at Dust"',
  },
];

const THINKING_TEXT =
  "The user wants to find senior engineers in Paris and reach out. I know from context that the current open role is at Dust. Let me start by searching Lever for matching profiles, then delegate email drafting to @Alfred, benchmark salaries, and finally prepare a summary deck.";

const FINAL_RESPONSE = `Here's a summary of what I did:

**Candidate pipeline** — Found 4 strong matches from Lever for the senior engineer role in Paris. All meet the required skills.

**Outreach** — @Alfred drafted 3 personalized emails. The draft to Marie Dupont is ready in Gmail.

**Salary benchmarking** — Market rate in Paris for senior engineers is **€65–85K** depending on seniority (Glassdoor, Levels.fyi, Welcome to the Jungle).

**Deliverables** — 12-slide deck and source data Excel exported from Sandbox. Ready to share with the team.

Let me know if you'd like to adjust the outreach tone or add more candidates.`;

// ---------------------------------------------------------------------------
// Thinking indicator — shared between "thinking" and "done" phases
// ---------------------------------------------------------------------------

function ThinkingIndicator({
  done,
  isOpen,
  onToggle,
}: {
  done: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="s-flex s-w-fit s-items-center s-gap-1.5 s-text-sm s-font-medium s-text-foreground s-transition-opacity hover:s-opacity-70 dark:s-text-foreground-night"
    >
      {done ? (
        <span className="s-h-2 s-w-2 s-rounded-full s-bg-success-500 dark:s-bg-success-500-night" />
      ) : (
        <Spinner size="xs" />
      )}
      <span>{done ? "Thought for 4m 12s" : "Thinking"}</span>
      {isOpen ? (
        <ChevronUpIcon className="s-h-3 s-w-3" />
      ) : (
        <ChevronDownIcon className="s-h-3 s-w-3" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Thinking block — progressive steps, collapsible
// ---------------------------------------------------------------------------

function AgentThinkingBlock({
  visibleSteps,
  isOpen,
  onToggle,
  onStepClick,
  done,
}: {
  visibleSteps: ThinkingStep[];
  isOpen: boolean;
  onToggle: () => void;
  onStepClick: (step: ThinkingStep) => void;
  done: boolean;
}) {
  return (
    <div className="s-flex s-flex-col s-gap-1.5 s-px-4 s-py-3">
      <ThinkingIndicator done={done} isOpen={isOpen} onToggle={onToggle} />

      {isOpen && (
        <div className="s-flex s-flex-col s-gap-0.5 s-pl-1">
          {/* Reasoning text — one line, truncated */}
          <p className="s-truncate s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            {THINKING_TEXT}
          </p>

          {/* Steps — each types itself in, one line */}
          {visibleSteps.map((step) => (
            <button
              key={step.id}
              onClick={() => onStepClick(step)}
              className="s-flex s-w-full s-min-w-0 s-items-center s-gap-1 s-rounded-md s-py-0.5 s-text-left s-text-sm s-text-muted-foreground s-transition-colors hover:s-text-foreground dark:s-text-muted-foreground-night dark:hover:s-text-foreground-night"
            >
              <span className="s-min-w-0 s-flex-1 s-truncate">
                <TypingAnimation text={step.thinkingLabel} duration={18} />
              </span>
              <ChevronRightIcon className="s-h-3 s-w-3 s-flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidepanel — Message breakdown (Sheet from right, no SheetContainer wrapper)
// ---------------------------------------------------------------------------

function MessageBreakdown({
  step,
  open,
  onClose,
}: {
  step: ThinkingStep | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent size="md" side="right" className="s-flex s-flex-col s-p-0">
        <SheetHeader className="s-border-b s-border-separator s-px-4 s-py-3 dark:s-border-separator-night">
          <SheetTitle>Message breakdown</SheetTitle>
        </SheetHeader>

        {step && (
          <div className="s-flex s-flex-1 s-flex-col s-overflow-y-auto">
            <div className="s-flex s-flex-col s-p-4">
              {/* All steps in original order, selected one highlighted in place */}
              {THINKING_STEPS.map((s, i) => {
                const isSelected = s.id === step.id;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "s-flex s-items-start s-gap-3 s-rounded-xl s-p-3",
                      isSelected
                        ? "s-bg-muted-background dark:s-bg-muted-background-night"
                        : "",
                      i < THINKING_STEPS.length - 1 && !isSelected
                        ? "s-border-b s-border-separator dark:s-border-separator-night"
                        : ""
                    )}
                  >
                    <div
                      className={cn(
                        "s-flex s-h-8 s-w-8 s-flex-shrink-0 s-items-center s-justify-center s-rounded-full",
                        s.iconBg
                      )}
                    >
                      <Avatar icon={s.icon} size="xs" />
                    </div>
                    <div className="s-min-w-0 s-flex-1">
                      <div className="s-flex s-items-center s-justify-between s-gap-2">
                        <span className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
                          {s.title}
                        </span>
                        <div className="s-flex s-items-center s-gap-0.5 s-flex-shrink-0">
                          {s.resultCount !== undefined && (
                            <span className="s-whitespace-nowrap s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                              Results ({s.resultCount})
                            </span>
                          )}
                          {s.hasViewConversation && (
                            <Button
                              variant="ghost"
                              size="xs"
                              label="View full conversation"
                              icon={ExternalLinkIcon}
                            />
                          )}
                          <ChevronRightIcon className="s-h-3 s-w-3 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                        </div>
                      </div>
                      <p className="s-mt-0.5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {s.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="s-mt-auto s-border-t s-border-separator s-p-4 dark:s-border-separator-night">
              <p className="s-mb-3 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                The agent ran for 4m 12 sec
              </p>
              <div className="s-flex s-flex-col s-gap-1">
                {[
                  { label: "Capabilities enabled", count: 2 },
                  { label: "Sources used", count: 2 },
                ].map(({ label, count }) => (
                  <button
                    key={label}
                    className="s-flex s-items-center s-justify-between s-rounded-md s-px-1 s-py-1.5 s-text-sm s-text-foreground hover:s-bg-muted-background dark:s-text-foreground-night dark:hover:s-bg-muted-background-night"
                  >
                    <span>{label}</span>
                    <div className="s-flex s-items-center s-gap-1">
                      <span className="s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full s-bg-muted-background s-text-xs s-font-medium dark:s-bg-muted-background-night">
                        {count}
                      </span>
                      <ChevronRightIcon className="s-h-3 s-w-3 s-text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

type Phase = "idle" | "thinking" | "done";

export default function ThinkingInConversation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [visibleSteps, setVisibleSteps] = useState<ThinkingStep[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [selectedStep, setSelectedStep] = useState<ThinkingStep | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [phase, visibleSteps.length]);

  useEffect(() => {
    if (phase !== "thinking") {
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP_DELAY = 1400;

    THINKING_STEPS.forEach((step, i) => {
      timers.push(
        setTimeout(
          () => {
            setVisibleSteps((prev) => [...prev, step]);
          },
          800 + i * STEP_DELAY
        )
      );
    });

    timers.push(
      setTimeout(
        () => setPhase("done"),
        800 + THINKING_STEPS.length * STEP_DELAY + 600
      )
    );

    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const handleSend = () => {
    if (phase !== "idle") return;
    setPhase("thinking");
  };

  const handleStepClick = (step: ThinkingStep) => {
    setSelectedStep(step);
    setIsPanelOpen(true);
  };

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <div className="s-relative s-flex s-flex-1 s-flex-col s-overflow-hidden">
        {/* Scrollable messages */}
        <div
          ref={scrollContainerRef}
          className="s-flex s-flex-1 s-flex-col s-overflow-y-auto"
        >
          <NewConversationContainer>
            <div className="s-h-12 s-shrink-0" />
            <NewConversationSectionHeading label="Today" />

            {/* User message */}
            {phase !== "idle" && (
              <NewConversationMessageGroup
                type="locutor"
                avatar={{ visual: locutor.portrait, isRounded: true }}
                timestamp="14:00"
              >
                <NewConversationUserMessage isLastMessage={false}>
                  <span>
                    <span className="s-font-medium s-text-highlight dark:s-text-highlight-night">
                      @dataLake
                    </span>{" "}
                    Find senior engineers in Paris, draft outreach emails,
                    benchmark salaries, and prepare a summary deck
                  </span>
                </NewConversationUserMessage>
              </NewConversationMessageGroup>
            )}

            {/* Agent block */}
            {(phase === "thinking" || phase === "done") && (
              <NewConversationMessageGroup
                type="agent"
                avatar={{
                  emoji: agent.emoji,
                  backgroundColor: agent.backgroundColor,
                }}
                name={`@${agent.name}`}
                timestamp="14:00"
              >
                <NewConversationAgentMessage
                  isLastMessage={phase === "done"}
                  hideActions={phase === "thinking"}
                >
                  <div className="s-flex s-flex-col s-gap-0">
                    {/* Thinking indicator + steps (always shown during thinking; collapsible in done) */}
                    <AgentThinkingBlock
                      visibleSteps={
                        phase === "done" ? THINKING_STEPS : visibleSteps
                      }
                      isOpen={isThinkingOpen}
                      onToggle={() => setIsThinkingOpen((v) => !v)}
                      onStepClick={handleStepClick}
                      done={phase === "done"}
                    />

                    {/* Final response */}
                    {phase === "done" && (
                      <div className="s-border-t s-border-separator s-px-4 s-py-3 dark:s-border-separator-night">
                        <Markdown content={FINAL_RESPONSE} />
                      </div>
                    )}
                  </div>
                </NewConversationAgentMessage>
              </NewConversationMessageGroup>
            )}

            <div ref={messagesEndRef} className="s-h-32 s-shrink-0" />
          </NewConversationContainer>
        </div>

        {/* Floating input bar */}
        <div className="s-pointer-events-none s-absolute s-bottom-4 s-left-0 s-right-0 s-flex s-justify-center">
          <div className="s-pointer-events-auto s-w-full s-max-w-4xl s-px-4">
            {phase === "idle" ? (
              <div onClick={handleSend}>
                <InputBar
                  initialValue="@dataLake Find senior engineers in Paris, draft outreach emails, benchmark salaries, and prepare a summary deck"
                  className="s-shadow-xl"
                />
              </div>
            ) : (
              <InputBar placeholder="Reply..." className="s-shadow-xl" />
            )}
          </div>
        </div>
      </div>

      {/* Right sidepanel */}
      <MessageBreakdown
        step={selectedStep}
        open={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
      />
    </div>
  );
}
