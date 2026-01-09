import { CheckIcon, DashIcon, XMarkIcon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

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

const FEATURE_STATUS_CONFIG: Record<
  FeatureStatus,
  {
    Icon: ComponentType<{ className?: string }>;
    bgColor: string;
    iconColor: string;
  }
> = {
  yes: {
    Icon: CheckIcon,
    bgColor: "bg-green-100",
    iconColor: "text-green-600",
  },
  partial: {
    Icon: DashIcon,
    bgColor: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  no: { Icon: XMarkIcon, bgColor: "bg-gray-100", iconColor: "text-gray-400" },
};

function FeatureIndicator({ status }: FeatureIndicatorProps) {
  const { Icon, bgColor, iconColor } = FEATURE_STATUS_CONFIG[status];
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full ${bgColor}`}
    >
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
  );
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
