import { H2, P } from "@app/components/home/ContentComponents";
import { cn } from "@dust-tt/sparkle";
import { AlertTriangle, Check, Cpu, Lock, Settings } from "lucide-react";
import type { ReactNode } from "react";

// ─── "What is Glean?" ─────────────────────────────────────────────────

interface ComparisonCardItem {
  text: string;
}

interface ComparisonApproach {
  title: string;
  items: ComparisonCardItem[];
  variant: "warning" | "positive";
}

interface WhatSectionProps {
  title: string;
  description: string;
  catchLine: ReactNode;
  approaches: [ComparisonApproach, ComparisonApproach];
}

export function GleanWhatSection({
  title,
  description,
  catchLine,
  approaches,
}: WhatSectionProps) {
  return (
    <section className="w-full py-12 md:py-6">
      <div className="mb-16 text-center">
        <H2 className="mb-4 text-center">{title}</H2>
        <P size="md" className="mx-auto mb-6 max-w-3xl text-muted-foreground">
          {description}
        </P>
        <P
          size="md"
          className="mx-auto max-w-3xl font-medium text-muted-foreground"
        >
          {catchLine}
        </P>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        {approaches.map((approach) => (
          <ApproachCard key={approach.title} {...approach} />
        ))}
      </div>
    </section>
  );
}

function ApproachCard({ title, items, variant }: ComparisonApproach) {
  const isPositive = variant === "positive";

  return (
    <div
      className={cn(
        "rounded-2xl p-8 shadow-sm",
        isPositive
          ? "relative overflow-hidden border border-[#1C91FF]/20 bg-[#1C91FF]/5"
          : "border border-gray-100 bg-white"
      )}
    >
      {isPositive && (
        <div className="absolute -mr-16 -mt-16 right-0 top-0 h-32 w-32 rounded-bl-full bg-[#1C91FF]/10" />
      )}
      <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-[#111418]">
        {title}
      </h3>
      <ul className="relative z-10 space-y-4">
        {items.map((item) => (
          <li key={item.text} className="flex items-start gap-3">
            {isPositive ? (
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#1C91FF]" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            )}
            <span
              className={cn(
                isPositive ? "font-medium text-gray-800" : "text-gray-600"
              )}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── "Why teams look for alternatives" ─────────────────────────────────

interface WhyReason {
  title: string;
  description: string;
  iconColor: "amber" | "red" | "purple" | "blue";
}

interface WhySectionProps {
  title: string;
  subtitle: string;
  reasons: WhyReason[];
}

const ICON_MAP = {
  amber: <AlertTriangle className="h-6 w-6 text-amber-500" />,
  red: <Lock className="h-6 w-6 text-red-500" />,
  purple: <Settings className="h-6 w-6 text-purple-500" />,
  blue: <Cpu className="h-6 w-6 text-blue-500" />,
} as const;

export function GleanWhySection({ title, subtitle, reasons }: WhySectionProps) {
  return (
    <section className="w-full pt-4 pb-12 md:pt-2 md:pb-6">
      <div className="mb-16 text-center">
        <H2 className="mb-4 text-center">{title}</H2>
        <P size="md" className="mx-auto max-w-2xl text-muted-foreground">
          {subtitle}
        </P>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {reasons.map((reason) => (
          <div
            key={reason.title}
            className="rounded-2xl border border-gray-100 bg-gray-50 p-8 transition-all hover:shadow-lg"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
              {ICON_MAP[reason.iconColor]}
            </div>
            <h3 className="mb-3 text-xl font-bold text-[#111418]">
              {reason.title}
            </h3>
            <P size="sm" className="text-muted-foreground">
              {reason.description}
            </P>
          </div>
        ))}
      </div>
    </section>
  );
}
