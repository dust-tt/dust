import type { FC } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";

import type { CorePositioningConfig } from "./types";

interface CorePositioningTableProps {
  config: CorePositioningConfig;
  competitorName: string;
}

export const CorePositioningTable: FC<CorePositioningTableProps> = ({
  config,
  competitorName,
}) => {
  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-2xl font-semibold md:text-3xl lg:text-4xl">
            {config.title}
          </H2>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 md:block">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-1/4 border-b border-gray-200 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Dimension
                  </th>
                  <th className="w-[37.5%] border-b border-l border-gray-200 px-6 py-4 text-left text-sm font-semibold text-gray-600">
                    {competitorName}
                  </th>
                  <th className="w-[37.5%] border-b border-l border-gray-200 bg-green-50 px-6 py-4 text-left text-sm font-semibold text-green-700">
                    Dust
                  </th>
                </tr>
              </thead>
              <tbody>
                {config.rows.map((row, index) => (
                  <tr
                    key={index}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                  >
                    <td className="border-b border-gray-200 px-6 py-4 text-sm font-medium text-gray-900">
                      {row.dimension}
                    </td>
                    <td className="border-b border-l border-gray-200 px-6 py-4 text-sm text-gray-600">
                      {row.competitor}
                    </td>
                    <td className="border-b border-l border-gray-200 bg-green-50/50 px-6 py-4 text-sm text-gray-700">
                      {row.dust}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-4 md:hidden">
            {config.rows.map((row, index) => (
              <div
                key={index}
                className="rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-900">
                    {row.dimension}
                  </span>
                </div>
                <div className="divide-y divide-gray-200">
                  <div className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {competitorName}
                    </span>
                    <p className="mt-1 text-sm text-gray-600">
                      {row.competitor}
                    </p>
                  </div>
                  <div className="bg-green-50/50 px-4 py-3">
                    <span className="text-xs font-medium text-green-600 uppercase tracking-wide">
                      Dust
                    </span>
                    <p className="mt-1 text-sm text-gray-700">{row.dust}</p>
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
