import { CheckIcon, DashIcon, XMarkIcon } from "@dust-tt/sparkle";

import { Grid, H2 } from "@app/components/home/ContentComponents";

import {
  COMPARISON_TABLE_CONTAINER_CLASSES,
  ComparisonTableHeader,
  getFirstColumnClasses,
  getLastColumnClasses,
  getMiddleColumnClasses,
} from "./ComparisonTableComponents";
import type { FeatureComparisonConfig, FeatureStatus } from "./types";

interface FeatureComparisonTableProps {
  config: FeatureComparisonConfig;
  competitorName: string;
  competitorLogo?: string;
}

interface FeatureIndicatorProps {
  status: FeatureStatus;
}

function FeatureIndicator({ status }: FeatureIndicatorProps) {
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
}

export function FeatureComparisonTable({
  config,
  competitorName,
  competitorLogo,
}: FeatureComparisonTableProps) {
  const rows = config.rows;

  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            {config.title}
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
                      "flex flex-col justify-center"
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {row.feature}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {row.description}
                    </span>
                  </div>

                  <div
                    className={getMiddleColumnClasses(
                      { isFirst },
                      "flex items-center justify-center bg-green-50"
                    )}
                  >
                    <FeatureIndicator status={row.dust} />
                  </div>

                  <div
                    className={getLastColumnClasses(
                      { isFirst, isLast },
                      "flex items-center justify-center"
                    )}
                  >
                    <FeatureIndicator status={row.competitor} />
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
