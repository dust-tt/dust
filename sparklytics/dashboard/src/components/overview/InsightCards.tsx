import Link from "next/link";
import type { InsightItem } from "@/lib/types";

function insightHref(title: string): string {
  if (title.toLowerCase().includes("color") || title.toLowerCase().includes("typography") || title.toLowerCase().includes("spacing")) return "/tokens";
  if (title.toLowerCase().includes("adoption")) return "/components";
  if (title.toLowerCase().includes("health") || title.toLowerCase().includes("regression")) return "/reports";
  return "/overview";
}

function TriangleAlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CircleAlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

const SEVERITY_CONFIG = {
  critical: {
    Icon: TriangleAlertIcon,
    iconClass: "text-rose-400",
    label: "Critical",
    badgeStyle: { background: "rgba(251, 86, 91, 0.15)", color: "#fb565b" },
    cardStyle: {
      background: "rgba(251, 86, 91, 0.04)",
      border: "1px solid rgba(251, 86, 91, 0.35)",
    },
  },
  warning: {
    Icon: CircleAlertIcon,
    iconClass: "text-amber-400",
    label: "Warning",
    badgeStyle: { background: "rgba(255, 186, 0, 0.18)", color: "#ffba00" },
    cardStyle: {
      background: "rgba(255, 186, 0, 0.04)",
      border: "1px solid rgba(255, 186, 0, 0.35)",
    },
  },
  info: {
    Icon: CircleAlertIcon,
    iconClass: "text-emerald-400",
    label: "Info",
    badgeStyle: { background: "rgba(0, 217, 146, 0.12)", color: "#00d992" },
    cardStyle: {
      background: "rgba(0, 217, 146, 0.03)",
      border: "1px solid rgba(0, 217, 146, 0.25)",
    },
  },
} as const;

interface InsightCardsProps {
  insights: InsightItem[];
}

export function InsightCards({ insights }: InsightCardsProps) {
  return (
    <div className="space-y-2">
      {insights.map((insight, i) => {
        const config = SEVERITY_CONFIG[insight.severity];
        const { Icon } = config;

        // Prefer insight.metrics; fall back to legacy single value
        const metrics =
          insight.metrics ??
          (insight.value !== undefined
            ? [{ value: insight.value, label: "" }]
            : []);

        return (
          <Link
            key={i}
            href={insightHref(insight.title)}
            className="flex items-center gap-4 px-5 py-4 rounded-xl hover:opacity-80 transition-opacity"
            style={config.cardStyle}
          >
            {/* Severity icon */}
            <Icon className={`w-5 h-5 shrink-0 ${config.iconClass}`} />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[#f2f2f2]">
                  {insight.title}
                </span>
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={config.badgeStyle}
                >
                  {config.label}
                </span>
              </div>
            </div>

            {/* Metrics */}
            {metrics.length > 0 && (
              <div className="flex items-start gap-5 shrink-0">
                {metrics.map((m, mi) => (
                  <div key={mi} className="text-right">
                    <div className="text-base font-bold text-[#f2f2f2] leading-tight tabular-nums">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Chevron */}
            <ChevronRightIcon className="w-4 h-4 text-[#8b949e] shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
