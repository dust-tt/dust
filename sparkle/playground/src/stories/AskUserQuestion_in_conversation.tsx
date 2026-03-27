import {
  Avatar,
  Bar,
  Button,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  cn,
  CodeSlashIcon,
  CommandLineIcon,
  DocumentIcon,
  ExternalLinkIcon,
  GlobeAltIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  Markdown,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  ScrollArea,
  ScrollBar,
  SearchInput,
  SidebarLayout,
  type SidebarLayoutRef,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import {
  AskUserQuestion,
  type AskUserQuestionOption,
} from "../components/AskUserQuestion";
import { InputBar } from "../components/InputBar";
import {
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
  NewConversationSectionHeading,
  NewConversationUserMessage,
} from "../components/NewConversationMessages";
import { mockUsers } from "../data";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function StreamingMarkdown({
  content,
  onComplete,
  charDelay = 15,
}: {
  content: string;
  onComplete?: () => void;
  charDelay?: number;
}) {
  const [displayed, setDisplayed] = useState("");
  const posRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setDisplayed("");
    posRef.current = 0;

    let handle: number;
    const tick = () => {
      posRef.current = Math.min(posRef.current + 3, content.length);
      setDisplayed(content.slice(0, posRef.current));
      if (posRef.current < content.length) {
        handle = window.setTimeout(tick, charDelay);
      } else {
        onCompleteRef.current?.();
      }
    };

    handle = window.setTimeout(tick, charDelay);
    return () => window.clearTimeout(handle);
  }, [content, charDelay]);

  if (displayed.length >= content.length) {
    return <Markdown content={content} />;
  }

  return (
    <p className="s-whitespace-pre-wrap s-text-base s-text-foreground dark:s-text-foreground-night">
      {displayed}
    </p>
  );
}

function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay + 16);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={cn(
        "s-transition-opacity s-duration-300 s-ease-out",
        visible ? "s-opacity-100" : "s-opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const locutor = mockUsers[0];
const agent = {
  name: "monitor",
  emoji: "📡",
  backgroundColor: "s-bg-blue-100",
};

const QUESTION = "Which monitoring area should we start with?";

const QUESTION_OPTIONS: AskUserQuestionOption[] = [
  {
    id: "latency",
    label: "Latency & performance",
    description:
      "Track p50/p95/p99 response times and identify slow endpoints.",
  },
  {
    id: "errors",
    label: "Error tracking",
    description:
      "Monitor error rates, capture stack traces, and set up alerts.",
  },
  {
    id: "uptime",
    label: "Uptime & availability",
    description: "Health checks, status pages, and downtime notifications.",
  },
];

type ThinkingStepFile = { name: string; type: string };

type ThinkingStep = {
  id: string;
  thinkingLabel: string;
  icon: React.ComponentType;
  iconBg: string;
  title: string;
  description: string;
  resultCount?: number;
  hasViewConversation?: boolean;
  terminalOutput?: string;
  files?: ThinkingStepFile[];
};

const INITIAL_THINKING_TEXT =
  "The user wants to set up API monitoring. Let me analyze their current infrastructure and identify the key areas that need attention.";
const INITIAL_THINKING_SUMMARY =
  "Analyzed current infrastructure and identified 3 monitoring areas to prioritize.";
const INITIAL_THINKING_STEPS: ThinkingStep[] = [
  {
    id: "docs",
    thinkingLabel: "Searching internal docs for existing monitoring setup",
    icon: MagnifyingGlassIcon,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Documentation Search",
    description:
      'Searched internal docs for "API monitoring" — 8 results, found existing Datadog integration covering basic health checks',
    resultCount: 8,
  },
  {
    id: "websearch",
    thinkingLabel: "Searching the web for monitoring best practices",
    icon: GlobeAltIcon,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Web Search",
    description:
      'Searched "API monitoring best practices 2026" — 11 results from Datadog, Grafana, and OpenTelemetry docs',
    resultCount: 11,
  },
  {
    id: "analysis",
    thinkingLabel: "Analyzing gaps in current monitoring coverage",
    icon: CodeSlashIcon,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Gap Analysis",
    description:
      "Compared current setup against best practices — identified 3 key areas: latency tracking, error monitoring, and uptime checks",
  },
];

function getSecondThinkingSteps(optionId: string): ThinkingStep[] {
  const byOption: Record<string, ThinkingStep[]> = {
    latency: [
      {
        id: "t2-otel",
        thinkingLabel: "Looking up OpenTelemetry middleware options",
        icon: MagnifyingGlassIcon,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "OpenTelemetry Research",
        description:
          "Found 3 compatible middleware packages for the current Node.js stack. Recommended: @opentelemetry/instrumentation-http",
        resultCount: 3,
      },
      {
        id: "t2-grafana",
        thinkingLabel: "Generating Grafana dashboard config",
        icon: CodeSlashIcon,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Dashboard Generation",
        description:
          "Built p50/p95/p99 latency panels, top-10 slow endpoints view, and 7-day trend chart",
        terminalOutput:
          "$ grafana-cli dashboard generate --template latency\n✓ Panel: Latency overview (p50/p95/p99)\n✓ Panel: Top-10 slow endpoints\n✓ Panel: 7-day trend\n→ Output: dashboard.json",
        files: [
          { name: "dashboard.json", type: "json" },
          { name: "alert-rules.yaml", type: "yaml" },
        ],
      },
    ],
    errors: [
      {
        id: "t2-sentry",
        thinkingLabel: "Checking existing error tracking setup",
        icon: MagnifyingGlassIcon,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Error Tracking Audit",
        description:
          "Found partial Sentry setup in infra/. Missing: stack trace grouping rules and PagerDuty integration",
        resultCount: 5,
      },
      {
        id: "t2-alerts",
        thinkingLabel: "Configuring alert thresholds and PagerDuty",
        icon: CodeSlashIcon,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Alert Configuration",
        description:
          "Generated PagerDuty integration config with error-rate thresholds: warning at 1%, critical at 5%",
        terminalOutput:
          "$ alerts-cli configure --provider pagerduty\n✓ Rule: error_rate > 1% → warning\n✓ Rule: error_rate > 5% → critical\n→ Output: alerting.yaml",
        files: [
          { name: "alerting.yaml", type: "yaml" },
          { name: "sentry-config.js", type: "js" },
        ],
      },
    ],
    uptime: [
      {
        id: "t2-healthcheck",
        thinkingLabel: "Designing health check endpoints",
        icon: MagnifyingGlassIcon,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Health Check Design",
        description:
          "Mapped 12 critical API routes for health check coverage. Proposed /health and /ready endpoints with dependency checks",
        resultCount: 12,
      },
      {
        id: "t2-statuspage",
        thinkingLabel: "Setting up status page configuration",
        icon: GlobeAltIcon,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Status Page Setup",
        description:
          "Generated Statuspage.io component config mapping services to API routes",
        files: [
          { name: "statuspage-components.json", type: "json" },
          { name: "healthcheck-routes.ts", type: "ts" },
        ],
      },
    ],
  };
  return byOption[optionId] ?? byOption["latency"];
}

function getSecondThinkingSummary(optionLabel: string): string {
  return `Planned the ${optionLabel.toLowerCase()} implementation — dashboard and alert configs ready.`;
}

function getFinalResponse(choice: string): string {
  return `Here's the monitoring plan for **${choice}**:

**Current state** — Found an existing Datadog integration in \`infra/monitoring/\`. It covers basic health checks but has no ${choice.toLowerCase()} instrumentation.

**Recommended approach** — 3-phase rollout:
1. **Instrument** — Add OpenTelemetry middleware to capture ${choice.toLowerCase()} metrics on all API routes
2. **Visualize** — Import the generated Grafana dashboard (attached config). Key panels: ${choice.toLowerCase()} overview, top-10 breakdown, trend over 7d
3. **Alert** — Set up PagerDuty rules: warning at p95 threshold, critical at p99

**Deliverables** — Dashboard JSON and alerting config are ready to import. The implementation PR draft is in @engineer's conversation.

Want me to proceed with phase 1, or adjust the thresholds first?`;
}

const SIDEBAR_CONVERSATIONS = [
  { id: "conv-1", label: "API monitoring setup", selected: true },
  { id: "conv-2", label: "Slack integration review" },
  { id: "conv-3", label: "Database query optimizations" },
  { id: "conv-4", label: "CI/CD pipeline debugging" },
  { id: "conv-5", label: "Frontend performance audit" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AnimatedDots() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="s-inline-block s-w-4 s-text-left">{".".repeat(dots)}</span>
  );
}

function ThinkingIndicator({
  done,
  isOpen,
  onToggle,
  summaryText,
}: {
  done: boolean;
  isOpen: boolean;
  onToggle: () => void;
  summaryText?: string;
}) {
  const label = done && summaryText ? summaryText : null;

  return (
    <button
      onClick={onToggle}
      className="s-flex s-w-full s-items-center s-gap-1.5 s-text-left s-text-sm s-font-medium s-text-muted-foreground s-transition-colors dark:s-text-muted-foreground-night hover:s-text-foreground dark:hover:s-text-foreground-night"
    >
      {!done && <Spinner size="xs" variant="dark" />}
      <span className="s-flex-1">
        {label ?? (
          <>
            Thinking
            <AnimatedDots />
          </>
        )}
      </span>
      {isOpen ? (
        <ChevronUpIcon className="s-h-3 s-w-3 s-flex-shrink-0" />
      ) : (
        <ChevronDownIcon className="s-h-3 s-w-3 s-flex-shrink-0" />
      )}
    </button>
  );
}

function AgentThinkingBlock({
  visibleSteps,
  allSteps,
  thinkingText,
  summaryText,
  isOpen,
  onToggle,
  onStepClick,
  done,
}: {
  visibleSteps: ThinkingStep[];
  allSteps: ThinkingStep[];
  thinkingText: string;
  summaryText: string;
  isOpen: boolean;
  onToggle: () => void;
  onStepClick: (step: ThinkingStep) => void;
  done: boolean;
}) {
  return (
    <div className="s-flex s-flex-col s-gap-1.5 s-pb-3 s-pt-1">
      <ThinkingIndicator
        done={done}
        isOpen={isOpen}
        onToggle={onToggle}
        summaryText={summaryText}
      />

      {/* Smooth expand/collapse via grid-rows transition */}
      <div
        className={cn(
          "s-grid s-transition-[grid-template-rows] s-duration-200 s-ease-out",
          isOpen ? "s-grid-rows-[1fr]" : "s-grid-rows-[0fr]"
        )}
      >
        <div className="s-overflow-hidden">
          <div className="s-flex s-flex-col s-gap-2 s-pt-1">
            <p className="s-truncate s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {thinkingText}
            </p>

            {(done ? allSteps : visibleSteps).map((step) => (
              <FadeIn key={step.id}>
                <button
                  onClick={() => onStepClick(step)}
                  className="s-flex s-w-full s-min-w-0 s-items-center s-gap-1 s-rounded-md s-py-0.5 s-text-left s-text-sm s-text-muted-foreground s-transition-colors dark:s-text-muted-foreground-night hover:s-text-foreground dark:hover:s-text-foreground-night"
                >
                  <span className="s-min-w-0 s-flex-1 s-truncate">
                    {step.thinkingLabel}
                  </span>
                  <ChevronRightIcon className="s-h-3 s-w-3 s-flex-shrink-0" />
                </button>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineStepContent({
  step,
  isExpanded,
}: {
  step: ThinkingStep;
  isExpanded: boolean;
}) {
  return (
    <div className="s-flex s-min-w-0 s-flex-col s-overflow-hidden">
      <div className="s-flex s-h-7 s-items-center s-justify-between s-gap-2">
        <span className="s-truncate s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
          {step.title}
        </span>
        <ChevronDownIcon
          className={cn(
            "s-h-3.5 s-w-3.5 s-flex-shrink-0 s-text-muted-foreground s-transition-transform s-duration-200 dark:s-text-muted-foreground-night",
            isExpanded ? "s-rotate-0" : "-s-rotate-90"
          )}
        />
      </div>

      <p className="s-truncate s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
        {step.thinkingLabel}
      </p>

      {/* Smooth expand/collapse via grid-rows transition */}
      <div
        className={cn(
          "s-grid s-transition-[grid-template-rows] s-duration-200 s-ease-out",
          isExpanded ? "s-grid-rows-[1fr]" : "s-grid-rows-[0fr]"
        )}
      >
        <div className="s-overflow-hidden">
          <p className="s-mt-1.5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            {step.description}
          </p>

          {step.terminalOutput && (
            <div className="s-mt-3 s-overflow-hidden s-rounded-xl s-bg-slate-800 s-p-4 dark:s-bg-slate-900">
              <div className="s-mb-2 s-flex s-items-center s-gap-1.5 s-text-xs s-text-slate-400">
                <CommandLineIcon className="s-h-3.5 s-w-3.5" />
                <span>terminal</span>
              </div>
              <pre className="s-text-sm s-leading-relaxed s-text-slate-200">
                {step.terminalOutput.split("\\n").map((line, i) => (
                  <div key={i}>
                    {line.startsWith("$") ? (
                      <>
                        <span className="s-text-emerald-400">$ </span>
                        <span className="s-font-medium">{line.slice(2)}</span>
                      </>
                    ) : (
                      <span>{line}</span>
                    )}
                  </div>
                ))}
              </pre>
            </div>
          )}

          {step.files && step.files.length > 0 && (
            <div className="s-mt-3">
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                Files created
              </span>
              <div className="s-mt-1.5 s-flex s-flex-wrap s-gap-2">
                {step.files.map((f) => (
                  <div
                    key={f.name}
                    className="s-flex s-items-center s-gap-2 s-rounded-lg s-border s-border-border s-px-3 s-py-2 dark:s-border-border-night"
                  >
                    <DocumentIcon className="s-h-4 s-w-4 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                    <div className="s-flex s-flex-col">
                      <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
                        {f.name}
                      </span>
                      <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {f.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.hasViewConversation && (
            <div className="s-mt-3">
              <Button
                variant="outline"
                size="xs"
                label="View full conversation"
                icon={ExternalLinkIcon}
              />
            </div>
          )}

          <div className="s-h-2" />
        </div>
      </div>
    </div>
  );
}

function MessageBreakdownPanel({
  step,
  allSteps,
  onClose,
  onStepSelect,
}: {
  step: ThinkingStep | null;
  allSteps: ThinkingStep[];
  onClose: () => void;
  onStepSelect: (step: ThinkingStep | null) => void;
}) {
  const handleToggle = (s: ThinkingStep) => {
    onStepSelect(step?.id === s.id ? null : s);
  };

  return (
    <div className="s-flex s-h-full s-flex-col s-bg-background dark:s-bg-background-night">
      <Bar
        position="top"
        variant="default"
        title="Message breakdown"
        rightActions={<Bar.ButtonBar variant="close" onClose={onClose} />}
      />

      <div className="s-flex s-flex-1 s-flex-col s-overflow-y-auto">
        <div className="s-px-4 s-pt-4 s-pb-2">
          {allSteps.map((s, i) => {
            const isExpanded = step?.id === s.id;
            const isLast = i === allSteps.length - 1;

            return (
              <div
                key={s.id}
                className="s-grid s-grid-cols-[28px,1fr] s-gap-x-3"
              >
                <div className="s-flex s-flex-col s-items-center">
                  <div className="s-flex-shrink-0">
                    <Avatar
                      icon={s.icon}
                      size="xs"
                      backgroundColor={s.iconBg}
                    />
                  </div>
                  {!isLast && (
                    <div className="s-w-[2px] s-flex-1 s-min-h-3 s-bg-border dark:s-bg-border-night" />
                  )}
                </div>

                <div
                  onClick={() => handleToggle(s)}
                  className="s-mb-2 s-min-w-0 s-cursor-pointer s-text-left"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleToggle(s);
                  }}
                >
                  <TimelineStepContent step={s} isExpanded={isExpanded} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="s-mt-auto s-border-t s-border-separator s-p-4 dark:s-border-separator-night">
          <p className="s-mb-3 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            The agent ran for 1m 47 sec
          </p>
          <div className="s-flex s-flex-col s-gap-1">
            {[
              { label: "Capabilities enabled", count: 3 },
              { label: "Sources used", count: 4 },
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main story — idle → thinking → asking → thinking2 → done
// ---------------------------------------------------------------------------

type Phase = "idle" | "thinking" | "asking" | "thinking2" | "done";

export default function AskUserQuestionInConversation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedOption, setSelectedOption] =
    useState<AskUserQuestionOption | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<ThinkingStep[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [visibleSteps2, setVisibleSteps2] = useState<ThinkingStep[]>([]);
  const [introStarted, setIntroStarted] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [finalStarted, setFinalStarted] = useState(false);
  const [selectedStep, setSelectedStep] = useState<ThinkingStep | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const secondSteps = selectedOption
    ? getSecondThinkingSteps(selectedOption.id)
    : [];
  const secondSummary = selectedOption
    ? getSecondThinkingSummary(selectedOption.label)
    : "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [phase, visibleSteps.length, visibleSteps2.length]);

  // Progressive thinking steps — phase 1
  useEffect(() => {
    if (phase !== "thinking") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP_DELAY = 1400;

    INITIAL_THINKING_STEPS.forEach((step, i) => {
      timers.push(
        setTimeout(
          () => setVisibleSteps((prev) => [...prev, step]),
          800 + i * STEP_DELAY
        )
      );
    });
    timers.push(
      setTimeout(
        () => setPhase("asking"),
        800 + INITIAL_THINKING_STEPS.length * STEP_DELAY + 600
      )
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Progressive thinking steps — phase 2
  useEffect(() => {
    if (phase !== "thinking2" || !selectedOption) return;
    const steps = getSecondThinkingSteps(selectedOption.id);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP_DELAY = 1200;

    steps.forEach((step, i) => {
      timers.push(
        setTimeout(
          () => setVisibleSteps2((prev) => [...prev, step]),
          600 + i * STEP_DELAY
        )
      );
    });
    timers.push(
      setTimeout(() => setPhase("done"), 600 + steps.length * STEP_DELAY + 400)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, selectedOption]);

  // Phase-driven UI transitions (collapse/expand, streaming delays)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (phase === "asking") {
      setIntroStarted(false);
      setIntroComplete(false);
      timers.push(setTimeout(() => setIntroStarted(true), 500));
    } else if (phase === "thinking2") {
      setIsThinkingOpen(true);
      setFinalStarted(false);
    } else if (phase === "done") {
      setIsThinkingOpen(false);
      timers.push(setTimeout(() => setFinalStarted(true), 600));
    }
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const handleSend = () => {
    if (phase !== "idle") return;
    setPhase("thinking");
  };

  const handleOptionSelect = (option: AskUserQuestionOption) => {
    setSelectedOption(option);
    setVisibleSteps2([]);
    setPhase("thinking2");
  };

  const handleStepClick = (step: ThinkingStep) => {
    setSelectedStep(step);
    setIsPanelOpen(true);
  };

  const conversationContent = (
    <div className="s-relative s-flex s-flex-1 s-flex-col s-overflow-hidden">
      <div className="s-flex s-flex-1 s-flex-col s-overflow-y-auto">
        <NewConversationContainer>
          <div className="s-h-12 s-shrink-0" />
          <NewConversationSectionHeading label="Today" />

          {phase !== "idle" && (
            <FadeIn>
              <NewConversationMessageGroup
                type="locutor"
                avatar={{ visual: locutor.portrait, isRounded: true }}
                timestamp="10:00"
              >
                <NewConversationUserMessage isLastMessage={false}>
                  <span>
                    <span className="s-font-medium s-text-highlight dark:s-text-highlight-night">
                      @monitor
                    </span>{" "}
                    I want to set up monitoring for our API. What approach do
                    you recommend?
                  </span>
                </NewConversationUserMessage>
              </NewConversationMessageGroup>
            </FadeIn>
          )}

          {phase !== "idle" && (
            <FadeIn delay={150}>
              <NewConversationMessageGroup
                type="agent"
                avatar={{
                  emoji: agent.emoji,
                  backgroundColor: agent.backgroundColor,
                }}
                name={`@${agent.name}`}
                timestamp="10:01"
              >
                <NewConversationAgentMessage
                  isLastMessage={phase !== "thinking"}
                  hideActions={phase === "thinking"}
                  className="s-pl-0"
                >
                  <div className="s-flex s-flex-col s-gap-0">
                    <AgentThinkingBlock
                      visibleSteps={[...visibleSteps, ...visibleSteps2]}
                      allSteps={[...INITIAL_THINKING_STEPS, ...secondSteps]}
                      thinkingText={
                        phase === "thinking2" || phase === "done"
                          ? `The user chose "${selectedOption?.label}". Let me plan the implementation.`
                          : INITIAL_THINKING_TEXT
                      }
                      summaryText={
                        phase === "done"
                          ? secondSummary
                          : INITIAL_THINKING_SUMMARY
                      }
                      isOpen={isThinkingOpen}
                      onToggle={() => setIsThinkingOpen((v) => !v)}
                      onStepClick={handleStepClick}
                      done={phase === "done"}
                    />

                    {phase === "asking" && (
                      <div className="s-flex s-flex-col s-gap-3">
                        <div className="s-pb-3 s-pt-2">
                          {introStarted && (
                            <StreamingMarkdown
                              content="There are a few directions we could take depending on your priorities. Which area would you like to focus on first?"
                              onComplete={() => setIntroComplete(true)}
                              charDelay={18}
                            />
                          )}
                        </div>
                        {introComplete && (
                          <FadeIn>
                            <AskUserQuestion
                              question={QUESTION}
                              options={QUESTION_OPTIONS}
                              onSelect={handleOptionSelect}
                              onSkip={() => setPhase("done")}
                            />
                          </FadeIn>
                        )}
                      </div>
                    )}

                    {phase === "done" && finalStarted && (
                      <FadeIn className="s-pb-3 s-pt-2">
                        <StreamingMarkdown
                          content={getFinalResponse(
                            selectedOption?.label ?? ""
                          )}
                          charDelay={10}
                        />
                      </FadeIn>
                    )}
                  </div>
                </NewConversationAgentMessage>
              </NewConversationMessageGroup>
            </FadeIn>
          )}

          <div ref={messagesEndRef} className="s-h-32 s-shrink-0" />
        </NewConversationContainer>
      </div>

      <div className="s-pointer-events-none s-absolute s-bottom-4 s-left-0 s-right-0 s-flex s-justify-center">
        <div className="s-pointer-events-auto s-w-full s-max-w-4xl s-px-4">
          {phase === "idle" ? (
            <div onClick={handleSend}>
              <InputBar
                initialValue="@monitor I want to set up monitoring for our API. What approach do you recommend?"
                className="s-shadow-xl"
              />
            </div>
          ) : (
            <InputBar placeholder="Reply..." className="s-shadow-xl" />
          )}
        </div>
      </div>
    </div>
  );

  const filteredConvs = SIDEBAR_CONVERSATIONS.filter((c) =>
    c.label.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  const sidebarContent = (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <div className="s-flex s-h-14 s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-pl-3 s-pr-2 dark:s-border-border-night">
        <div className="s-flex s-min-w-0 s-flex-1 s-items-center s-gap-2">
          <Avatar
            name={locutor.fullName}
            visual={locutor.portrait}
            size="sm"
            isRounded
          />
          <div className="s-flex s-min-w-0 s-flex-col">
            <span className="s-heading-sm s-truncate s-text-foreground dark:s-text-foreground-night">
              {locutor.fullName}
            </span>
            <span className="s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              ACME
            </span>
          </div>
        </div>
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
        />
      </div>

      <ScrollArea className="s-flex-1">
        <ScrollBar orientation="vertical" size="minimal" />
        <div className="s-flex s-items-center s-gap-1 s-p-2">
          <SearchInput
            name="sidebar-search"
            value={sidebarSearch}
            onChange={setSidebarSearch}
            placeholder="Search"
            className="s-flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            icon={ChatBubbleLeftRightIcon}
            label="New"
            tooltip="New Conversation"
          />
        </div>

        <NavigationList className="s-px-2">
          <NavigationListItem label="Inbox" icon={InboxIcon} count={3} />
          <NavigationListCollapsibleSection
            label="Conversations"
            type="collapse"
            defaultOpen
          >
            {filteredConvs.map((c) => (
              <NavigationListItem
                key={c.id}
                label={c.label}
                icon={ChatBubbleLeftRightIcon}
                selected={c.selected}
              />
            ))}
          </NavigationListCollapsibleSection>
        </NavigationList>
      </ScrollArea>
    </div>
  );

  const mainContent = (
    <div className="s-flex s-h-full s-w-full s-overflow-hidden">
      <div className="s-flex s-min-w-0 s-flex-1">{conversationContent}</div>

      <div
        className={cn(
          "s-h-full s-overflow-hidden s-border-l s-border-separator s-transition-[width] s-duration-300 s-ease-out dark:s-border-separator-night",
          isPanelOpen ? "s-w-[400px]" : "s-w-0 s-border-l-0"
        )}
      >
        <div className="s-h-full s-w-[400px]">
          <MessageBreakdownPanel
            step={selectedStep}
            allSteps={INITIAL_THINKING_STEPS}
            onClose={() => setIsPanelOpen(false)}
            onStepSelect={setSelectedStep}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <SidebarLayout
        ref={sidebarLayoutRef}
        sidebar={sidebarContent}
        content={mainContent}
        defaultSidebarWidth={260}
        minSidebarWidth={200}
        maxSidebarWidth={380}
        collapsible
        onSidebarToggle={setIsSidebarCollapsed}
      />
    </div>
  );
}
