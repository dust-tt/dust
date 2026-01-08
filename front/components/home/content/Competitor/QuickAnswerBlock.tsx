import { CheckIcon, XMarkIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import type { FC } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

interface QuickAnswerBlockProps {
  competitorName: string;
  competitorLogo?: string;
}

export const QuickAnswerBlock: FC<QuickAnswerBlockProps> = ({
  competitorName,
  competitorLogo,
}) => {
  // Key differentiators - visual comparison
  const differentiators = [
    {
      label: "Architecture",
      dust: "Agent-first from day one",
      competitor: "Search-first, agents added later",
    },
    {
      label: "Pricing",
      dust: "$29/user/month, transparent",
      competitor: "$50K+ minimum, hidden pricing",
    },
    {
      label: "Adoption",
      dust: "70-90% team adoption",
      competitor: "~40% typical adoption",
    },
    {
      label: "Time to value",
      dust: "5-minute agent creation",
      competitor: "Complex setup required",
    },
  ];

  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            The Key Differences
          </H2>

          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-white">
            {/* Header row */}
            <div className="hidden grid-cols-3 border-b border-border md:grid">
              <div className="px-6 py-4" />
              <div className="flex items-center justify-center border-l border-border bg-green-500 px-4 py-4">
                <Image
                  src="/static/landing/logos/dust/Dust_Logo_White.svg"
                  alt="Dust"
                  width={60}
                  height={20}
                  className="h-5 w-auto"
                />
              </div>
              <div className="flex items-center justify-center gap-2 border-l border-border bg-structure-50 px-4 py-4">
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

            {/* Comparison rows */}
            {differentiators.map((item, index) => (
              <div
                key={index}
                className={classNames(
                  "grid grid-cols-1 md:grid-cols-3",
                  index !== differentiators.length - 1 && "border-b border-border"
                )}
              >
                {/* Label */}
                <div className="flex items-center px-6 py-4 md:border-r md:border-border">
                  <span className="text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                </div>

                {/* Dust */}
                <div className="flex items-center gap-3 border-l border-border bg-green-50 px-4 py-4">
                  <CheckIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
                  <span className="text-sm text-foreground">{item.dust}</span>
                </div>

                {/* Competitor */}
                <div className="flex items-center gap-3 border-l border-border px-4 py-4">
                  <XMarkIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {item.competitor}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Grid>
    </div>
  );
};
