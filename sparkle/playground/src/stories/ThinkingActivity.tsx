import {
  Avatar,
  Bar,
  Button,
  ChatBubbleLeftRightIcon,
  Citation,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationTitle,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  cn,
  CommandLineIcon,
  DocumentIcon,
  ExternalLinkIcon,
  InboxIcon,
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
import {
  IconCircleCheck,
  IconCode,
  IconFileText,
  IconLock,
  IconSearch,
  IconServer,
  IconWorld,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

type ThinkingStepFile = { name: string; type: string; size?: string };

type ThinkingStepResult = {
  title: string;
  description: string;
  icon?: string;
};

type ThinkingStep = {
  id: string;
  thinkingLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  iconBg: string;
  title: string;
  description: string;
  resultCount?: number;
  hasViewConversation?: boolean;
  terminalOutput?: string;
  codeBlock?: { language: string; label: string; code: string };
  results?: ThinkingStepResult[];
  files?: ThinkingStepFile[];
  status?: "running" | "done";
};

const INITIAL_THINKING_TEXT =
  "The user wants to set up API monitoring. Let me analyze their current infrastructure, review what tooling is already in place, and figure out what's missing before I recommend anything.";
const INITIAL_THINKING_SUMMARY =
  "Analyzed current infrastructure and identified 3 monitoring areas to prioritize.";
const INITIAL_THINKING_STEPS: ThinkingStep[] = [
  {
    id: "docs",
    thinkingLabel:
      "Searching internal documentation for any existing monitoring setup — checking infra/, ops/, and monitoring/ directories for Datadog, Prometheus, or Grafana configs",
    icon: IconSearch,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Documentation Search",
    description:
      'Searched internal docs for "API monitoring" — 8 results across infra/, ops/, and monitoring/ directories. Found existing Datadog integration covering basic health checks on 3 of 7 services.',
    resultCount: 8,
    codeBlock: {
      language: "sql",
      label: "Query tables",
      code: `SELECT
    doc_title, doc_path, relevance_score
FROM INTERNAL_DOCS.SEARCH_INDEX
WHERE CONTAINS(content, 'monitoring OR datadog OR prometheus')
    AND workspace = 'engineering'
ORDER BY relevance_score DESC
LIMIT 20`,
    },
    results: [
      {
        title: "monitoring_setup.md",
        description:
          "Datadog agent config for api-gateway, auth-service, and payments. Last updated 4 months ago.",
      },
      {
        title: "infra/docker-compose.monitoring.yaml",
        description:
          "Docker Compose overlay with Datadog agent, StatsD, and basic health check probes.",
      },
      {
        title: "ops/runbooks/incident-response.md",
        description:
          "Runbook referencing Datadog dashboards for CPU/memory but no latency or error tracking.",
      },
    ],
    files: [{ name: "search_results.csv", type: "csv", size: "2.4 KB" }],
  },
  {
    id: "websearch",
    thinkingLabel:
      "Searching the web for current monitoring best practices, comparing Datadog vs Grafana vs OpenTelemetry for API latency and error tracking in production environments",
    icon: IconWorld,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Web Search",
    description:
      'Searched "API monitoring best practices 2026" — 11 results from Datadog, Grafana, and OpenTelemetry docs. Key finding: OpenTelemetry is now the standard instrumentation layer, with vendor-agnostic export to Datadog/Grafana.',
    resultCount: 11,
    results: [
      {
        title: "OpenTelemetry: The Future of Observability (opentelemetry.io)",
        description:
          "Official guide on instrumenting Node.js APIs with auto-instrumentation and manual spans.",
      },
      {
        title: "Datadog vs Grafana Cloud 2026 Comparison (infoq.com)",
        description:
          "Side-by-side comparison of pricing, features, and integration depth for API monitoring at scale.",
      },
      {
        title: "P99 Latency Monitoring Best Practices (grafana.com)",
        description:
          "How to set up percentile-based latency tracking with Tempo and Prometheus for microservices.",
      },
    ],
  },
  {
    id: "infra",
    thinkingLabel:
      "Scanning infrastructure configuration files to map the full service topology — parsing docker-compose.yaml, Kubernetes manifests, and Terraform modules to understand service dependencies",
    icon: IconServer,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Infrastructure Scan",
    description:
      "Parsed infra/docker-compose.yaml, k8s manifests in deploy/, and Terraform modules — mapped 7 services, 3 databases (PostgreSQL, Redis, Elasticsearch), and 2 external dependencies (Stripe API, SendGrid).",
    resultCount: 7,
    terminalOutput:
      "$ find . -name '*.yaml' -path '*/k8s/*' | xargs grep 'kind: Service'\n./deploy/k8s/api-gateway.yaml: kind: Service\n./deploy/k8s/auth-service.yaml: kind: Service\n./deploy/k8s/payments.yaml: kind: Service\n./deploy/k8s/notifications.yaml: kind: Service\n./deploy/k8s/search.yaml: kind: Service\n./deploy/k8s/analytics.yaml: kind: Service\n./deploy/k8s/worker.yaml: kind: Service\n\n$ terraform graph -type=resource | grep 'aws_rds\\|aws_elasticache'\naws_rds_cluster.main → aws_rds_cluster_instance.primary\naws_elasticache_cluster.redis → aws_elasticache_subnet_group.main",
    files: [
      { name: "service_topology.json", type: "json", size: "8.1 KB" },
      { name: "dependency_graph.dot", type: "dot", size: "3.2 KB" },
    ],
  },
  {
    id: "security",
    thinkingLabel:
      "Reviewing IAM roles, network policies, and security groups to verify the monitoring agent will have the right permissions without opening unnecessary access",
    icon: IconLock,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Security Review",
    description:
      "Audited IAM roles in terraform/iam.tf and Kubernetes NetworkPolicies. The monitoring agent needs read access to CloudWatch and X-Ray APIs. Current role 'monitoring-reader' has CloudWatch:Get* but is missing xray:GetTraceSummaries and xray:BatchGetTraces.",
    codeBlock: {
      language: "json",
      label: "IAM Policy (required additions)",
      code: `{
  "Effect": "Allow",
  "Action": [
    "xray:GetTraceSummaries",
    "xray:BatchGetTraces",
    "xray:GetServiceGraph"
  ],
  "Resource": "*"
}`,
    },
    results: [
      {
        title: "monitoring-reader IAM role",
        description:
          "Has CloudWatch:Get*, CloudWatch:List*, logs:Get*. Missing X-Ray permissions.",
      },
      {
        title: "k8s NetworkPolicy: monitoring namespace",
        description:
          "Allows egress to kube-dns and AWS endpoints. No changes needed.",
      },
    ],
  },
  {
    id: "analysis",
    thinkingLabel:
      "Cross-referencing the current monitoring setup with industry best practices to identify blind spots — focusing on latency percentiles, error classification, and uptime SLAs",
    icon: IconCode,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Gap Analysis",
    description:
      "Compared current setup against best practices. Found 3 critical gaps: no latency percentile tracking (only avg response time), no structured error classification (errors logged but not categorized), and health checks are shallow (HTTP 200 only, no dependency validation).",
    results: [
      {
        title: "Latency tracking",
        description:
          "Current: average response time only. Missing: p50/p95/p99 percentiles, per-endpoint breakdown, slow query correlation.",
      },
      {
        title: "Error monitoring",
        description:
          "Current: unstructured error logs in CloudWatch. Missing: error classification by type, stack trace grouping, error budget tracking.",
      },
      {
        title: "Uptime checks",
        description:
          "Current: basic HTTP 200 health checks. Missing: deep dependency checks, synthetic monitoring, SLA compliance tracking.",
      },
    ],
    hasViewConversation: true,
  },
  {
    id: "summary",
    thinkingLabel:
      "Compiling all findings into a prioritized list of recommendations with estimated effort, risk assessment, and expected impact on reliability metrics",
    icon: IconFileText,
    iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
    title: "Recommendation Summary",
    description:
      "Synthesized findings from documentation search, web research, infrastructure scan, security audit, and gap analysis into 3 prioritized recommendations.",
    results: [
      {
        title: "Priority 1: Latency & performance",
        description:
          "Add OpenTelemetry instrumentation → Grafana dashboards. Effort: 2-3 days. Impact: visibility into p50/p95/p99 across all 7 services.",
      },
      {
        title: "Priority 2: Error tracking",
        description:
          "Upgrade Sentry integration → add error classification + PagerDuty alerts. Effort: 1-2 days. Impact: MTTR reduction by ~40%.",
      },
      {
        title: "Priority 3: Uptime & availability",
        description:
          "Implement deep health checks → Statuspage.io integration. Effort: 3-4 days. Impact: automated incident detection and public status page.",
      },
    ],
    files: [
      { name: "monitoring_recommendations.pdf", type: "pdf", size: "148 KB" },
      { name: "implementation_timeline.md", type: "md", size: "4.6 KB" },
    ],
  },
];

function getSecondThinkingSteps(optionId: string): ThinkingStep[] {
  const byOption: Record<string, ThinkingStep[]> = {
    latency: [
      {
        id: "t2-otel",
        thinkingLabel:
          "Researching OpenTelemetry middleware options compatible with the current Node.js stack — comparing @opentelemetry/instrumentation-http, auto-instrumentation, and manual span creation approaches",
        icon: IconSearch,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "OpenTelemetry Research",
        description:
          "Found 3 compatible middleware packages for the current Node.js stack. @opentelemetry/instrumentation-http provides automatic span creation for all HTTP requests with zero code changes. The auto-instrumentation agent supports Express, Fastify, and Koa.",
        resultCount: 3,
        results: [
          {
            title: "@opentelemetry/instrumentation-http (recommended)",
            description:
              "Auto-instruments all HTTP client/server calls. Captures method, status code, URL, and latency. 2.1M weekly downloads.",
          },
          {
            title: "@opentelemetry/auto-instrumentations-node",
            description:
              "Bundle of all Node.js instrumentations including HTTP, gRPC, database drivers, and Redis. Higher overhead but comprehensive.",
          },
          {
            title: "Manual span creation with @opentelemetry/api",
            description:
              "Full control over span attributes and naming. Best for custom business logic tracing. Requires code changes per endpoint.",
          },
        ],
      },
      {
        id: "t2-grafana",
        thinkingLabel:
          "Generating a Grafana dashboard configuration with p50/p95/p99 latency panels, a top-10 slow endpoints breakdown, and a 7-day trend chart with alerting thresholds",
        icon: IconCode,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Dashboard Generation",
        description:
          "Generated a complete Grafana dashboard with 4 panels: latency overview (p50/p95/p99 timeseries), top-10 slow endpoints (bar chart), 7-day trend comparison, and real-time request rate. Also configured alert rules for p95 > 500ms and p99 > 2s.",
        terminalOutput:
          "$ grafana-cli dashboard generate --template latency\n✓ Panel: Latency overview (p50/p95/p99)\n✓ Panel: Top-10 slow endpoints\n✓ Panel: 7-day trend comparison\n✓ Panel: Request rate (rpm)\n✓ Alert: p95 > 500ms → warning\n✓ Alert: p99 > 2s → critical\n→ Output: dashboard.json (14.2 KB)\n→ Output: alert-rules.yaml (2.8 KB)",
        codeBlock: {
          language: "json",
          label: "Dashboard config (excerpt)",
          code: `{
  "dashboard": {
    "title": "API Latency Monitor",
    "panels": [
      {
        "title": "Response Time Percentiles",
        "type": "timeseries",
        "targets": [{
          "expr": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))",
          "legendFormat": "p99"
        }]
      }
    ]
  }
}`,
        },
        files: [
          { name: "dashboard.json", type: "json", size: "14.2 KB" },
          { name: "alert-rules.yaml", type: "yaml", size: "2.8 KB" },
        ],
      },
    ],
    errors: [
      {
        id: "t2-sentry",
        thinkingLabel:
          "Auditing the existing Sentry error tracking setup in infra/ — checking for missing stack trace grouping rules, source map uploads, and PagerDuty webhook integration",
        icon: IconSearch,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Error Tracking Audit",
        description:
          "Found partial Sentry setup in infra/sentry.config.js. DSN is configured for api-gateway only. Missing: stack trace fingerprinting rules, source map uploads in CI, and PagerDuty webhook for critical alerts.",
        resultCount: 5,
        codeBlock: {
          language: "javascript",
          label: "Current Sentry config",
          code: `// infra/sentry.config.js — only covers api-gateway
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // Too low for error tracking
  // Missing: integrations, beforeSend, fingerprinting
});`,
        },
        results: [
          {
            title: "api-gateway: Sentry initialized",
            description:
              "Basic init with 10% trace sampling. No error grouping rules, no source maps.",
          },
          {
            title: "auth-service: No Sentry setup",
            description:
              "Errors go to CloudWatch only. No structured error tracking.",
          },
          {
            title: "payments: No Sentry setup",
            description:
              "Critical service with no error tracking beyond console.error statements.",
          },
        ],
      },
      {
        id: "t2-alerts",
        thinkingLabel:
          "Configuring PagerDuty alert thresholds based on error rate patterns — setting warning at 1% and critical at 5% with 5-minute evaluation windows and auto-resolve",
        icon: IconCode,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Alert Configuration",
        description:
          "Generated PagerDuty integration config with tiered error-rate thresholds. Warning triggers at 1% error rate (5-min window), critical at 5%. Auto-resolve after 10 minutes below threshold. Escalation policy routes to on-call engineer after 5 minutes.",
        terminalOutput:
          "$ alerts-cli configure --provider pagerduty\n✓ Rule: error_rate > 1% (5min) → warning\n✓ Rule: error_rate > 5% (5min) → critical\n✓ Escalation: on-call after 5min\n✓ Auto-resolve: 10min below threshold\n→ Output: alerting.yaml\n→ Output: sentry-config.js",
        files: [
          { name: "alerting.yaml", type: "yaml", size: "3.1 KB" },
          { name: "sentry-config.js", type: "js", size: "1.8 KB" },
        ],
      },
    ],
    uptime: [
      {
        id: "t2-healthcheck",
        thinkingLabel:
          "Designing health check endpoints for all 12 critical API routes — implementing /health for shallow checks and /ready for deep dependency validation including database and cache connectivity",
        icon: IconSearch,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Health Check Design",
        description:
          "Mapped 12 critical API routes across 7 services for health check coverage. Designed a two-tier system: /health for fast liveness probes (< 50ms) and /ready for deep readiness checks validating PostgreSQL, Redis, and Elasticsearch connectivity.",
        resultCount: 12,
        results: [
          {
            title: "/health — Liveness probe",
            description:
              "Returns 200 if process is running. No dependency checks. Target: < 50ms. Used by k8s livenessProbe.",
          },
          {
            title: "/ready — Readiness probe",
            description:
              "Validates PostgreSQL connection pool, Redis ping, Elasticsearch cluster health. Target: < 500ms. Used by k8s readinessProbe.",
          },
          {
            title: "/health/detailed — Deep check",
            description:
              "Returns JSON with per-dependency status, response times, and connection pool stats. For internal dashboards only.",
          },
        ],
      },
      {
        id: "t2-statuspage",
        thinkingLabel:
          "Setting up Statuspage.io component configuration — mapping each internal service to a public-facing component with automated incident creation based on health check failures",
        icon: IconWorld,
        iconBg: "s-bg-slate-100 dark:s-bg-slate-800",
        title: "Status Page Setup",
        description:
          "Generated Statuspage.io component config mapping 7 internal services to 4 public-facing components (API, Authentication, Payments, Search). Configured automated incident creation when health checks fail for > 2 minutes.",
        codeBlock: {
          language: "json",
          label: "Statuspage components",
          code: `{
  "components": [
    { "name": "API", "services": ["api-gateway", "worker"], "group": "Core" },
    { "name": "Authentication", "services": ["auth-service"], "group": "Core" },
    { "name": "Payments", "services": ["payments"], "group": "Transactions" },
    { "name": "Search", "services": ["search", "elasticsearch"], "group": "Features" }
  ],
  "automation": {
    "create_incident_after": "2m",
    "resolve_after": "5m"
  }
}`,
        },
        files: [
          { name: "statuspage-components.json", type: "json", size: "4.2 KB" },
          { name: "healthcheck-routes.ts", type: "ts", size: "6.7 KB" },
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

const PLAN_TITLE = "Set up API monitoring for production services";
const PLAN_STEPS = [
  "Search internal documentation and infrastructure configs for existing monitoring setup.",
  "Research current best practices for API monitoring — latency, errors, and uptime.",
  "Scan service topology and security policies to map dependencies and access requirements.",
  "Identify monitoring gaps by cross-referencing current setup against industry standards.",
  "Ask which monitoring area to prioritize, then generate dashboard and alert configs.",
];
const PLAN_COUNTDOWN_SECONDS = 60;

function CountdownRing({
  secondsLeft,
  total,
}: {
  secondsLeft: number;
  total: number;
}) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - secondsLeft / total);

  return (
    <div className="s-relative s-flex s-items-center s-justify-center">
      <svg width="22" height="22" viewBox="0 0 22 22" className="-s-rotate-90">
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.15"
        />
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="s-transition-[stroke-dashoffset] s-duration-1000 s-ease-linear"
        />
      </svg>
      <span className="s-absolute s-text-[9px] s-font-medium s-text-foreground dark:s-text-foreground-night">
        {secondsLeft}
      </span>
    </div>
  );
}

function PlanCard({
  onStart,
  onEdit,
  onCancel,
}: {
  onStart: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(PLAN_COUNTDOWN_SECONDS);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) onStart();
  }, [secondsLeft, onStart]);

  return (
    <div className="s-flex s-flex-col s-gap-4 s-rounded-t-xl s-border s-border-b-0 s-border-border s-bg-background s-px-5 s-py-4 dark:s-border-border-night dark:s-bg-background-night">
      <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
        {PLAN_TITLE}
      </span>

      <div className="s-flex s-flex-col s-gap-3">
        {PLAN_STEPS.map((step, i) => (
          <div key={i} className="s-flex s-items-center s-gap-2.5">
            <span className="s-flex s-h-5 s-w-5 s-flex-shrink-0 s-items-center s-justify-center s-rounded-full s-border s-border-border s-text-xs s-font-medium s-text-muted-foreground dark:s-border-border-night dark:s-text-muted-foreground-night">
              {i + 1}
            </span>
            <span className="s-text-sm s-text-foreground dark:s-text-foreground-night">
              {step}
            </span>
          </div>
        ))}
      </div>

      <div className="s-flex s-items-center s-gap-2 s-pt-1">
        <Button
          variant="ghost-secondary"
          size="sm"
          label="Edit"
          onClick={onEdit}
        />
        <div className="s-flex-1" />
        <Button
          variant="ghost-secondary"
          size="sm"
          label="Cancel"
          onClick={onCancel}
        />
        <button
          onClick={onStart}
          className="s-flex s-items-center s-gap-1.5 s-rounded-xl s-border s-border-border s-px-3 s-py-1 s-text-sm s-font-medium s-text-foreground s-transition-colors hover:s-bg-muted-background dark:s-border-border-night dark:s-text-foreground-night dark:hover:s-bg-muted-background-night"
        >
          Start
          <CountdownRing
            secondsLeft={secondsLeft}
            total={PLAN_COUNTDOWN_SECONDS}
          />
        </button>
      </div>
    </div>
  );
}

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
  phase1Text,
  phase2Text,
  phase1StepCount,
  summaryText,
  isOpen,
  onToggle,
  onStepClick,
  done,
}: {
  visibleSteps: ThinkingStep[];
  allSteps: ThinkingStep[];
  phase1Text: string;
  phase2Text?: string;
  phase1StepCount: number;
  summaryText: string;
  isOpen: boolean;
  onToggle: () => void;
  onStepClick: (step: ThinkingStep) => void;
  done: boolean;
}) {
  const steps = done ? allSteps : visibleSteps;

  return (
    <div className="s-flex s-flex-col s-pb-3 s-pt-1">
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
          <div className="s-flex s-flex-col s-pt-5">
            <p className="s-pb-5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {phase1Text}
            </p>

            {steps.map((step, i, arr) => {
              const isLastOverall = i === arr.length - 1 && !done;
              const showLine = !isLastOverall;
              const showPhase2Separator =
                phase2Text &&
                i === phase1StepCount - 1 &&
                arr.length > phase1StepCount;

              return (
                <FadeIn key={step.id}>
                  <div className="s-flex">
                    <div className="s-flex s-w-4 s-flex-shrink-0 s-flex-col s-items-center s-pt-0.5">
                      <step.icon
                        size={16}
                        stroke={1.5}
                        className="s-flex-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night"
                      />
                      {showLine && (
                        <div className="s-w-px s-flex-1 s-bg-border dark:s-bg-border-night" />
                      )}
                    </div>
                    <div className="s-ml-2.5 s-min-w-0 s-flex-1">
                      <button
                        onClick={() => onStepClick(step)}
                        className={cn(
                          "s-flex s-w-full s-items-start s-gap-1.5 s-text-left s-text-sm s-text-muted-foreground s-transition-colors dark:s-text-muted-foreground-night hover:s-text-foreground dark:hover:s-text-foreground-night",
                          showLine ? "s-pb-5" : ""
                        )}
                      >
                        <span className="s-relative s-min-w-0 s-flex-1">
                          {step.status === "running" ? (
                            <>
                              <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                                {step.thinkingLabel}
                              </span>
                              <span className="s-absolute s-inset-0 s-animate-shiny-text s-truncate s-bg-gradient-to-r s-from-transparent s-via-foreground s-via-50% s-to-transparent s-bg-clip-text s-bg-no-repeat s-text-black/0 [background-position:0_0] [background-size:50%_100%] dark:s-via-foreground-night">
                                {step.thinkingLabel}
                              </span>
                            </>
                          ) : (
                            step.thinkingLabel
                          )}
                        </span>
                        <ChevronRightIcon className="s-mt-0.5 s-h-3 s-w-3 s-flex-shrink-0" />
                      </button>
                      {showPhase2Separator && (
                        <p className="s-pb-5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                          {phase2Text}
                        </p>
                      )}
                    </div>
                  </div>
                </FadeIn>
              );
            })}
            {done && (
              <FadeIn>
                <div className="s-flex s-items-center">
                  <div className="s-flex s-w-4 s-flex-shrink-0 s-justify-center">
                    <IconCircleCheck
                      size={16}
                      stroke={1.5}
                      className="s-text-muted-foreground dark:s-text-muted-foreground-night"
                    />
                  </div>
                  <span className="s-ml-2.5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                    Done
                  </span>
                </div>
              </FadeIn>
            )}
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

      <div
        className={cn(
          "s-grid s-transition-[grid-template-rows] s-duration-200 s-ease-out",
          isExpanded ? "s-grid-rows-[1fr]" : "s-grid-rows-[0fr]"
        )}
      >
        <div className="s-overflow-hidden">
          <p className="s-mt-2 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            {step.description}
          </p>

          {step.codeBlock && (
            <div className="s-mt-3">
              <div className="s-mb-1 s-flex s-items-center s-gap-1.5 s-text-xs s-font-medium s-text-foreground dark:s-text-foreground-night">
                <IconCode
                  size={14}
                  stroke={1.5}
                  className="s-text-muted-foreground dark:s-text-muted-foreground-night"
                />
                {step.codeBlock.label}
              </div>
              <div className="s-overflow-hidden s-rounded-xl s-bg-slate-800 s-p-4 dark:s-bg-slate-900">
                <pre className="s-overflow-x-auto s-text-xs s-leading-relaxed s-text-slate-200">
                  {step.codeBlock.code}
                </pre>
              </div>
            </div>
          )}

          {step.terminalOutput && (
            <div className="s-mt-3">
              <div className="s-overflow-hidden s-rounded-xl s-bg-slate-800 s-p-4 dark:s-bg-slate-900">
                <div className="s-mb-2 s-flex s-items-center s-gap-1.5 s-text-xs s-text-slate-400">
                  <CommandLineIcon className="s-h-3.5 s-w-3.5" />
                  <span>terminal</span>
                </div>
                <pre className="s-overflow-x-auto s-text-xs s-leading-relaxed s-text-slate-200">
                  {step.terminalOutput.split("\\n").map((line, i) => (
                    <div key={i}>
                      {line.startsWith("$") ? (
                        <>
                          <span className="s-text-emerald-400">$ </span>
                          <span className="s-font-medium">{line.slice(2)}</span>
                        </>
                      ) : line.startsWith("✓") ? (
                        <span className="s-text-emerald-400">{line}</span>
                      ) : line.startsWith("→") ? (
                        <span className="s-text-sky-400">{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}

          {step.results && step.results.length > 0 && (
            <div className="s-mt-3">
              <span className="s-mb-1.5 s-block s-text-xs s-font-medium s-text-foreground dark:s-text-foreground-night">
                Results{step.resultCount ? ` (${step.resultCount})` : ""}
              </span>
              <div className="s-flex s-flex-col s-gap-1.5">
                {step.results.map((r) => (
                  <div
                    key={r.title}
                    className="s-rounded-lg s-border s-border-border s-px-3 s-py-2 dark:s-border-border-night"
                  >
                    <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
                      {r.title}
                    </span>
                    <p className="s-mt-0.5 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                      {r.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.files && step.files.length > 0 && (
            <div className="s-mt-3">
              <span className="s-mb-1.5 s-block s-text-xs s-font-medium s-text-foreground dark:s-text-foreground-night">
                Files
              </span>
              <CitationGrid variant="list">
                {step.files.map((f) => (
                  <Citation key={f.name} variant="secondary">
                    <CitationIcons>
                      <DocumentIcon className="s-h-4 s-w-4 s-text-muted-foreground dark:s-text-muted-foreground-night" />
                    </CitationIcons>
                    <CitationTitle>{f.name}</CitationTitle>
                    <CitationDescription>
                      {f.type.toUpperCase()}
                      {f.size ? ` · ${f.size}` : ""}
                    </CitationDescription>
                  </Citation>
                ))}
              </CitationGrid>
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
  allSteps,
  onClose,
}: {
  allSteps: ThinkingStep[];
  onClose: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = (s: ThinkingStep) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) {
        next.delete(s.id);
      } else {
        next.add(s.id);
      }
      return next;
    });
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
            const isExpanded = expandedIds.has(s.id);
            const isLast = i === allSteps.length - 1;

            return (
              <div
                key={s.id}
                className="s-grid s-grid-cols-[28px,1fr] s-gap-x-3"
              >
                <div className="s-flex s-flex-col s-items-center">
                  <Avatar
                    size="xs"
                    visual={
                      <s.icon
                        size={14}
                        stroke={1.5}
                        className="s-text-muted-foreground dark:s-text-muted-foreground-night"
                      />
                    }
                    backgroundColor={s.iconBg}
                  />
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

type Phase =
  | "idle"
  | "sent"
  | "planning"
  | "thinking"
  | "asking"
  | "thinking2"
  | "done";

export default function ThinkingActivity() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedOption, setSelectedOption] =
    useState<AskUserQuestionOption | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<ThinkingStep[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [visibleSteps2, setVisibleSteps2] = useState<ThinkingStep[]>([]);
  const [introStarted, setIntroStarted] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [finalStarted, setFinalStarted] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [inputValue, setInputValue] = useState(
    "@monitor I want to set up monitoring for our API. What approach do you recommend?"
  );
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
  }, [phase, visibleSteps.length, visibleSteps2.length, introComplete]);

  // Delay between user message and plan appearing
  useEffect(() => {
    if (phase !== "sent") return;
    const t = setTimeout(() => setPhase("planning"), 1500);
    return () => clearTimeout(t);
  }, [phase]);

  // Progressive thinking steps — phase 1 (4 steps in parallel, then 2 more)
  useEffect(() => {
    if (phase !== "thinking") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const s = INITIAL_THINKING_STEPS;
    const done = (id: string) =>
      setVisibleSteps((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "done" } : x))
      );

    // Reveal first 4 steps together
    timers.push(
      setTimeout(() => {
        setVisibleSteps([
          { ...s[0], status: "running" },
          { ...s[1], status: "running" },
          { ...s[2], status: "running" },
          { ...s[3], status: "running" },
        ]);
      }, 800)
    );
    // Steps complete at different times
    timers.push(setTimeout(() => done(s[0].id), 2000));
    timers.push(setTimeout(() => done(s[2].id), 2600));
    timers.push(setTimeout(() => done(s[3].id), 3200));
    timers.push(setTimeout(() => done(s[1].id), 3600));

    // Reveal steps 4 & 5
    timers.push(
      setTimeout(() => {
        setVisibleSteps((prev) => [
          ...prev,
          { ...s[4], status: "running" },
          { ...s[5], status: "running" },
        ]);
      }, 3800)
    );
    timers.push(setTimeout(() => done(s[4].id), 5000));
    timers.push(setTimeout(() => done(s[5].id), 5400));

    // Transition to asking
    timers.push(setTimeout(() => setPhase("asking"), 6000));

    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Progressive thinking steps — phase 2 (both steps in parallel)
  useEffect(() => {
    if (phase !== "thinking2" || !selectedOption) return;
    const steps = getSecondThinkingSteps(selectedOption.id);
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Reveal both steps together
    timers.push(
      setTimeout(() => {
        setVisibleSteps2(steps.map((s) => ({ ...s, status: "running" })));
      }, 600)
    );
    // Step 0 completes
    if (steps[0]) {
      timers.push(
        setTimeout(() => {
          setVisibleSteps2((prev) =>
            prev.map((x) =>
              x.id === steps[0].id ? { ...x, status: "done" } : x
            )
          );
        }, 1400)
      );
    }
    // Step 1 completes
    if (steps[1]) {
      timers.push(
        setTimeout(() => {
          setVisibleSteps2((prev) =>
            prev.map((x) =>
              x.id === steps[1].id ? { ...x, status: "done" } : x
            )
          );
        }, 2000)
      );
    }
    // Transition to done
    timers.push(setTimeout(() => setPhase("done"), 2600));

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
    setInputValue("");
    setPhase("sent");
  };

  const handlePlanStart = useCallback(() => {
    setPhase("thinking");
  }, []);

  const handlePlanEdit = useCallback(() => {
    setInputValue(
      "@monitor I want to set up monitoring for our API. What approach do you recommend?"
    );
    setPhase("idle");
  }, []);

  const handlePlanCancel = useCallback(() => {
    setInputValue("");
    setPhase("idle");
  }, []);

  const handleRelaunch = useCallback(() => {
    setPhase("idle");
    setVisibleSteps([]);
    setVisibleSteps2([]);
    setSelectedOption(null);
    setIntroStarted(false);
    setIntroComplete(false);
    setFinalStarted(false);
    setIsPanelOpen(false);
    setInputValue(
      "@monitor I want to set up monitoring for our API. What approach do you recommend?"
    );
  }, []);

  const handleOptionSelect = (option: AskUserQuestionOption) => {
    setSelectedOption(option);
    setVisibleSteps2([]);
    setPhase("thinking2");
  };

  const handleStepClick = (_step: ThinkingStep) => {
    setIsPanelOpen(true);
  };

  const conversationContent = (
    <div className="s-relative s-flex s-flex-1 s-flex-col s-overflow-hidden">
      {phase !== "idle" && (
        <div className="s-absolute s-right-4 s-top-3 s-z-10">
          <Button
            variant="ghost"
            size="sm"
            label="Relaunch"
            onClick={handleRelaunch}
          />
        </div>
      )}
      {phase === "idle" && (
        <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-gap-3">
          <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            Ready to start
          </p>
          <Button
            variant="primary"
            size="md"
            label="Launch conversation"
            onClick={handleSend}
          />
        </div>
      )}
      <div
        className={cn(
          "s-flex s-flex-1 s-flex-col s-overflow-y-auto",
          phase === "idle" && "s-hidden"
        )}
      >
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

          {phase === "sent" && (
            <FadeIn delay={300}>
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
                  isLastMessage
                  hideActions
                  className="s-pl-0"
                >
                  <div className="s-flex s-items-center s-gap-2 s-py-1">
                    <Spinner size="xs" variant="dark" />
                    <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                      Thinking…
                    </span>
                  </div>
                </NewConversationAgentMessage>
              </NewConversationMessageGroup>
            </FadeIn>
          )}


          {phase !== "idle" && phase !== "sent" && phase !== "planning" && (
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
                      phase1Text={INITIAL_THINKING_TEXT}
                      phase2Text={
                        phase === "thinking2" || phase === "done"
                          ? `The user chose "${selectedOption?.label}". Let me plan the implementation.`
                          : undefined
                      }
                      phase1StepCount={INITIAL_THINKING_STEPS.length}
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
          <div className="s-flex s-flex-col">
            {phase === "planning" && (
              <FadeIn className="s-mx-auto s-w-[96%]">
                <PlanCard
                  onStart={handlePlanStart}
                  onEdit={handlePlanEdit}
                  onCancel={handlePlanCancel}
                />
              </FadeIn>
            )}
            {phase === "asking" && introComplete && (
              <FadeIn className="s-mx-auto s-w-[96%]">
                <AskUserQuestion
                  question={QUESTION}
                  options={QUESTION_OPTIONS}
                  onSelect={handleOptionSelect}
                  onSkip={() => setPhase("done")}
                />
              </FadeIn>
            )}
            {phase === "idle" && inputValue ? (
              <div onClick={handleSend}>
                <InputBar key={inputValue} initialValue={inputValue} />
              </div>
            ) : (
              <InputBar placeholder="Reply..." />
            )}
          </div>
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
          isPanelOpen ? "s-w-[680px]" : "s-w-0 s-border-l-0"
        )}
      >
        <div className="s-h-full s-w-[680px]">
          <MessageBreakdownPanel
            allSteps={INITIAL_THINKING_STEPS}
            onClose={() => setIsPanelOpen(false)}
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
