import { ExclamationCircleIcon } from "@dust-tt/sparkle";
import type { FC } from "react";

import { Grid, H2, H3, P } from "@app/components/home/ContentComponents";

import type { WhenCompetitorBetterConfig } from "./types";

interface WhenCompetitorBetterSectionProps {
  config: WhenCompetitorBetterConfig;
  competitorName: string;
}

export const WhenCompetitorBetterSection: FC<
  WhenCompetitorBetterSectionProps
> = ({ config, competitorName }) => {
  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
              <ExclamationCircleIcon className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-medium uppercase tracking-wide text-amber-600">
              Fair Assessment
            </span>
          </div>
          <H2 className="mb-12 text-2xl font-semibold md:text-3xl lg:text-4xl">
            {config.title}
          </H2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {config.cards.map((card, index) => (
              <div
                key={index}
                className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden"
              >
                {/* Header */}
                <div className="border-b border-amber-200 bg-amber-100 px-6 py-4">
                  <H3 className="text-base font-semibold text-amber-900 md:text-lg">
                    {card.title}
                  </H3>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  {/* Advantages */}
                  <div className="mb-4">
                    <P className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      {competitorName}&apos;s Advantages:
                    </P>
                    <ul className="space-y-1.5">
                      {card.advantages.map((advantage, advIndex) => (
                        <li
                          key={advIndex}
                          className="flex items-start gap-2 text-sm text-amber-800"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                          <span>{advantage}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Counter Argument */}
                  <div className="mb-4 flex-1">
                    <P className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                      Dust&apos;s Counter:
                    </P>
                    <P size="sm" className="text-gray-700">
                      {card.counterArgument}
                    </P>
                  </div>

                  {/* When to Concede */}
                  <div className="mt-auto rounded-lg bg-white/60 p-3">
                    <P className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      When to Consider {competitorName}:
                    </P>
                    <P size="sm" className="text-gray-600">
                      {card.whenToConcede}
                    </P>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Grid>
    </div>
  );
};
