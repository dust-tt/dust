import { CheckIcon, XMarkIcon } from "@dust-tt/sparkle";

import { Grid, H2 } from "@app/components/home/ContentComponents";

import {
  COMPARISON_TABLE_CONTAINER_CLASSES,
  ComparisonTableHeader,
  getFirstColumnClasses,
  getLastColumnClasses,
  getMiddleColumnClasses,
} from "./ComparisonTableComponents";
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

          <div className={COMPARISON_TABLE_CONTAINER_CLASSES}>
            <ComparisonTableHeader
              competitorName={competitorName}
              competitorLogo={competitorLogo}
            />

            {rows.map((row, index) => {
              const isFirst = index === 0;
              const isLast = index === rows.length - 1;

              return (
                <div key={index} className="grid grid-cols-1 md:grid-cols-3">
                  <div
                    className={getFirstColumnClasses(
                      { isFirst, isLast },
                      "flex items-center"
                    )}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {row.label}
                    </span>
                  </div>

                  <div
                    className={getMiddleColumnClasses(
                      { isFirst },
                      "flex items-center gap-3 bg-green-50"
                    )}
                  >
                    <CheckIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
                    <span className="text-sm text-foreground">{row.dust}</span>
                  </div>

                  <div
                    className={getLastColumnClasses(
                      { isFirst, isLast },
                      "flex items-center gap-3"
                    )}
                  >
                    <XMarkIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {row.competitor}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Grid>
    </div>
  );
}
