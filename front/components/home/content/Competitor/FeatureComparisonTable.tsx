import { CheckIcon, DashIcon, XMarkIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import type { FC } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

import type { FeatureComparisonConfig } from "./types";

interface FeatureComparisonTableProps {
  config: FeatureComparisonConfig;
  competitorName: string;
  competitorLogo?: string;
}

// Simple visual indicator
const FeatureIndicator: FC<{ status: "yes" | "partial" | "no" }> = ({
  status,
}) => {
  switch (status) {
    case "yes":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <CheckIcon className="h-5 w-5 text-green-600" />
        </div>
      );
    case "partial":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
          <DashIcon className="h-5 w-5 text-amber-600" />
        </div>
      );
    case "no":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
          <XMarkIcon className="h-5 w-5 text-gray-400" />
        </div>
      );
  }
};

// Visual feature comparison data
const FEATURE_ROWS = [
  {
    feature: "Agent-first architecture",
    description: "Built from day one for workflow automation, not search",
    dust: "yes" as const,
    competitor: "partial" as const,
  },
  {
    feature: "No-code agent builder",
    description: "Create agents in 5 minutes without technical knowledge",
    dust: "yes" as const,
    competitor: "partial" as const,
  },
  {
    feature: "Multi-agent orchestration",
    description: "Parallel sub-agents for complex cross-system workflows",
    dust: "yes" as const,
    competitor: "partial" as const,
  },
  {
    feature: "20+ AI models",
    description: "GPT-4, Claude, Gemini, Mistral—choose per task",
    dust: "yes" as const,
    competitor: "yes" as const,
  },
  {
    feature: "Transparent pricing",
    description: "$29/user/month with no hidden fees or minimums",
    dust: "yes" as const,
    competitor: "no" as const,
  },
  {
    feature: "50+ integrations",
    description: "Slack, Notion, Salesforce, GitHub, and more",
    dust: "yes" as const,
    competitor: "yes" as const,
  },
  {
    feature: "Write actions (CRM, tickets)",
    description: "Update records, create docs, post messages",
    dust: "yes" as const,
    competitor: "yes" as const,
  },
  {
    feature: "Interactive dashboards (Frames)",
    description: "Real-time React components for data visualization",
    dust: "yes" as const,
    competitor: "no" as const,
  },
  {
    feature: "SOC 2 Type II certified",
    description: "Enterprise-grade security and compliance",
    dust: "yes" as const,
    competitor: "yes" as const,
  },
  {
    feature: "Self-hosted deployment",
    description: "Deploy in your own cloud infrastructure",
    dust: "no" as const,
    competitor: "yes" as const,
  },
];

export const FeatureComparisonTable: FC<FeatureComparisonTableProps> = ({
  config,
  competitorName,
  competitorLogo,
}) => {
  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            {config.title}
          </H2>

          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-white">
            {/* Header */}
            <div className="hidden grid-cols-3 border-b border-border md:grid">
              <div className="px-6 py-4">
                <span className="text-sm font-semibold text-foreground">
                  Feature
                </span>
              </div>
              <div className="flex items-center justify-center border-l border-border bg-green-500 px-4 py-4">
                <Image
                  src="/static/landing/logos/dust/Dust_Logo_White.svg"
                  alt="Dust"
                  width={60}
                  height={20}
                  className="h-5 w-auto"
                />
              </div>
              <div className="flex items-center justify-center border-l border-border bg-structure-50 px-4 py-4">
                {competitorLogo ? (
                  <Image
                    src={competitorLogo}
                    alt={competitorName}
                    width={80}
                    height={24}
                    className="h-5 w-auto"
                  />
                ) : (
                  <span className="text-sm font-semibold text-foreground">
                    {competitorName}
                  </span>
                )}
              </div>
            </div>

            {/* Rows */}
            {FEATURE_ROWS.map((row, index) => (
              <div
                key={index}
                className={classNames(
                  "grid grid-cols-1 md:grid-cols-3",
                  index !== FEATURE_ROWS.length - 1 && "border-b border-border"
                )}
              >
                <div className="flex flex-col justify-center px-6 py-4 md:border-r md:border-border">
                  <span className="text-sm font-medium text-foreground">
                    {row.feature}
                  </span>
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    {row.description}
                  </span>
                </div>
                <div className="flex items-center justify-center border-l border-border bg-green-50 px-4 py-4">
                  <FeatureIndicator status={row.dust} />
                </div>
                <div className="flex items-center justify-center border-l border-border px-4 py-4">
                  <FeatureIndicator status={row.competitor} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Grid>
    </div>
  );
};
