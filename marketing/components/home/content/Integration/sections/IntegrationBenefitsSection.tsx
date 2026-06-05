import { H2 } from "@app/components/home/ContentComponents";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";

import type { BenefitCard, BenefitCardColor } from "../types";

// Tailwind class pairs for the colored icon badge on each card. The Sparkle
// palette exposes these `bg-X-50` / `text-X-600` pairs for the marketing
// pages; matching the existing palette per [GEN1].
const COLOR_CLASSES: Record<
  BenefitCardColor,
  { bg: string; ring: string; iconText: string }
> = {
  blue: {
    bg: "bg-blue-50",
    ring: "ring-blue-100",
    iconText: "text-blue-600",
  },
  green: {
    bg: "bg-green-50",
    ring: "ring-green-100",
    iconText: "text-green-600",
  },
  golden: {
    bg: "bg-golden-50",
    ring: "ring-golden-100",
    iconText: "text-golden-700",
  },
  rose: {
    bg: "bg-rose-50",
    ring: "ring-rose-100",
    iconText: "text-rose-600",
  },
  pink: {
    bg: "bg-pink-50",
    ring: "ring-pink-100",
    iconText: "text-pink-600",
  },
  violet: {
    bg: "bg-violet-50",
    ring: "ring-violet-100",
    iconText: "text-violet-600",
  },
};

interface IntegrationBenefitsSectionProps {
  benefits: BenefitCard[];
  integrationName: string;
}

export function IntegrationBenefitsSection({
  benefits,
  integrationName,
}: IntegrationBenefitsSectionProps) {
  if (benefits.length === 0) {
    return null;
  }

  return (
    <div className="py-12 md:py-16">
      {/* Heading mirrors the legacy `UseCasesSection` per [GEN1]. The H2
          "What you can do with X" is already used by `ToolsSection` further
          down the page, so this section uses the buyer-focused phrasing
          instead. */}
      <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
        How teams use {integrationName} with Dust
      </H2>

      <div
        className={`mx-auto grid max-w-5xl gap-6 md:gap-8 ${
          benefits.length === 1
            ? "max-w-md"
            : benefits.length === 2
              ? "md:grid-cols-2"
              : "md:grid-cols-3"
        }`}
      >
        {benefits.map((benefit, index) => (
          <BenefitCardView key={index} benefit={benefit} />
        ))}
      </div>
    </div>
  );
}

interface BenefitCardViewProps {
  benefit: BenefitCard;
}

function BenefitCardView({ benefit }: BenefitCardViewProps) {
  const IconComponent = getIcon(benefit.icon);
  const colorClasses = COLOR_CLASSES[benefit.color];

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-white p-6 transition-all hover:border-foreground/20">
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${colorClasses.bg} ${colorClasses.ring}`}
      >
        <ResourceAvatar
          icon={IconComponent}
          size="xs"
          className={colorClasses.iconText}
        />
      </div>

      <h3 className="mb-2 text-lg font-semibold text-foreground">
        {benefit.title}
      </h3>

      <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">
        {benefit.description}
      </p>

      {benefit.toolMatches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {benefit.toolMatches.map((toolName) => (
            <span
              key={toolName}
              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {toolName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
