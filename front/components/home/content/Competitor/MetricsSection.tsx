import type { FC } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";

interface Metric {
  value: string;
  label: string;
  description: string;
}

interface MetricsSectionProps {
  title?: string;
  metrics: Metric[];
}

export const MetricsSection: FC<MetricsSectionProps> = ({
  title = "Why teams choose Dust",
  metrics,
}) => {
  return (
    <div className="py-12 md:py-20">
      <div className="container px-4">
        <div className="rounded-3xl bg-green-600">
          <Grid>
            <div className="col-span-12 px-6 py-12 md:px-12 md:py-16">
              <H2 className="mb-12 text-center text-2xl font-semibold text-white md:text-3xl">
                {title}
              </H2>

              <div className="grid gap-8 md:grid-cols-3">
                {metrics.map((metric, index) => (
                  <div key={index} className="text-center">
                    <div className="mb-2 text-5xl font-bold text-white md:text-6xl">
                      {metric.value}
                    </div>
                    <div className="mb-1 text-lg font-semibold text-green-100">
                      {metric.label}
                    </div>
                    <div className="text-sm text-green-200">
                      {metric.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Grid>
        </div>
      </div>
    </div>
  );
};
