import { CheckIcon, XMarkIcon } from "@dust-tt/sparkle";
import type { FC } from "react";

import { Grid, H2, H3, P } from "@app/components/home/ContentComponents";

import type { UseCaseFitConfig } from "./types";

interface UseCaseFitGuideProps {
  config: UseCaseFitConfig;
  competitorName: string;
}

export const UseCaseFitGuide: FC<UseCaseFitGuideProps> = ({
  config,
  competitorName,
}) => {
  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-12 text-center text-2xl font-semibold md:text-3xl lg:text-4xl">
            {config.title}
          </H2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Dust Use Cases */}
            <div className="rounded-2xl border-2 border-green-200 bg-green-50 overflow-hidden">
              <div className="border-b border-green-200 bg-green-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
                    <CheckIcon className="h-5 w-5" />
                  </div>
                  <H3 className="text-lg font-semibold text-green-900">
                    Dust is the Best Choice If:
                  </H3>
                </div>
              </div>
              <div className="p-6">
                <ul className="space-y-4">
                  {config.dustUseCases.map((useCase, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                        <CheckIcon className="h-3 w-3" />
                      </div>
                      <P size="md" className="text-green-900">
                        {useCase.description}
                      </P>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Competitor Use Cases */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white">
                    <XMarkIcon className="h-5 w-5" />
                  </div>
                  <H3 className="text-lg font-semibold text-gray-700">
                    {competitorName} May Be Better If:
                  </H3>
                </div>
              </div>
              <div className="p-6">
                <ul className="space-y-4">
                  {config.competitorUseCases.map((useCase, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-400 text-white">
                        <span className="text-xs font-bold">!</span>
                      </div>
                      <P size="md" className="text-gray-700">
                        {useCase.description}
                      </P>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Grid>
    </div>
  );
};
