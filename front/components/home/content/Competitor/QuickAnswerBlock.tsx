import { CheckIcon, XMarkIcon } from "@dust-tt/sparkle";
import Image from "next/image";

import { Grid, H2 } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";

import type { QuickAnswerConfig } from "./types";

interface QuickAnswerBlockProps {
  config: QuickAnswerConfig;
  competitorName: string;
  competitorLogo?: string;
}

export function QuickAnswerBlock({
  config,
  competitorName,
  competitorLogo,
}: QuickAnswerBlockProps) {
  const rows = config.rows;
  const title = config.title ?? "The Key Differences";

  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            {title}
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
              <div className="flex items-center justify-center gap-2 border-l border-border bg-white px-4 py-4">
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
            {rows.map((row, index) => (
              <div
                key={index}
                className={cn(
                  "grid grid-cols-1 md:grid-cols-3",
                  index !== rows.length - 1 && "border-b border-border"
                )}
              >
                {/* Label */}
                <div className="flex items-center px-6 py-4 md:border-r md:border-border">
                  <span className="text-sm font-semibold text-foreground">
                    {row.label}
                  </span>
                </div>

                {/* Dust */}
                <div className="flex items-center gap-3 border-l border-border bg-green-50 px-4 py-4">
                  <CheckIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
                  <span className="text-sm text-foreground">{row.dust}</span>
                </div>

                {/* Competitor */}
                <div className="flex items-center gap-3 border-l border-border px-4 py-4">
                  <XMarkIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {row.competitor}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Grid>
    </div>
  );
}
