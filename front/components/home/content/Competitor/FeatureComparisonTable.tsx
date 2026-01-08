import { CheckIcon, DashIcon, XMarkIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import type { FC } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

import type { FeatureComparisonConfig, FeatureStatus } from "./types";

interface FeatureComparisonTableProps {
  config: FeatureComparisonConfig;
  competitorName: string;
  competitorLogo?: string;
}

// Simple visual indicator
const FeatureIndicator: FC<{ status: FeatureStatus }> = ({ status }) => {
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

export const FeatureComparisonTable: FC<FeatureComparisonTableProps> = ({
  config,
  competitorName,
  competitorLogo,
}) => {
  const rows = config.rows;

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
              <div className="flex items-center justify-center border-l border-border bg-white px-4 py-4">
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
            {rows.map((row, index) => (
              <div
                key={index}
                className={classNames(
                  "grid grid-cols-1 md:grid-cols-3",
                  index !== rows.length - 1 && "border-b border-border"
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
