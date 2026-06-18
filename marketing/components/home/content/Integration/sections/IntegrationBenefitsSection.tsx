import { H2 } from "@marketing/components/home/ContentComponents";
import {
  getIcon,
  ResourceAvatar,
} from "@marketing/components/resources/resources_icons";
import { Chip, cn } from "@dust-tt/sparkle";

import type { BenefitCard, BenefitCardColor } from "../types";

// `iconColor` + `backgroundColor` token pairs passed to ResourceAvatar so the
// benefit card icons share the same visual language as the tool-call chips
// and any other place Dust renders an Action icon. Each pair includes the
// `dark:` variant so the marketing page stays consistent in dark mode.
const COLOR_TOKENS: Record<
  BenefitCardColor,
  { iconColor: string; backgroundColor: string }
> = {
  blue: {
    iconColor: "text-blue-600 dark:text-blue-400",
    backgroundColor: "bg-blue-50 dark:bg-blue-900/30",
  },
  green: {
    iconColor: "text-green-600 dark:text-green-400",
    backgroundColor: "bg-green-50 dark:bg-green-900/30",
  },
  golden: {
    iconColor: "text-golden-700 dark:text-golden-300",
    backgroundColor: "bg-golden-50 dark:bg-golden-900/30",
  },
  rose: {
    iconColor: "text-rose-600 dark:text-rose-400",
    backgroundColor: "bg-rose-50 dark:bg-rose-900/30",
  },
  pink: {
    iconColor: "text-pink-600 dark:text-pink-400",
    backgroundColor: "bg-pink-50 dark:bg-pink-900/30",
  },
  violet: {
    iconColor: "text-violet-600 dark:text-violet-400",
    backgroundColor: "bg-violet-50 dark:bg-violet-900/30",
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
      <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
        What you can do with {integrationName}
      </H2>

      <div
        className={cn(
          "mx-auto grid gap-6 md:gap-8",
          benefits.length === 1
            ? "max-w-md"
            : benefits.length === 2
              ? "max-w-5xl md:grid-cols-2"
              : "max-w-5xl md:grid-cols-3"
        )}
      >
        {benefits.map((benefit) => (
          <BenefitCardView key={benefit.title} benefit={benefit} />
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
  const tokens = COLOR_TOKENS[benefit.color];

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-white p-6 transition-all hover:border-foreground/20">
      <div className="mb-4">
        {/* ResourceAvatar's iconColor + backgroundColor props are the canonical
            way to render a colored Action icon in Dust — keeps us in sync
            with how the same icons render in the in-app chat and elsewhere. */}
        <ResourceAvatar
          icon={IconComponent}
          size="md"
          iconColor={tokens.iconColor}
          backgroundColor={tokens.backgroundColor}
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
            <Chip key={toolName} label={toolName} size="mini" color="primary" />
          ))}
        </div>
      )}
    </div>
  );
}
