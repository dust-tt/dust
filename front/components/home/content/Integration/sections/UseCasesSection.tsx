import { Grid, H2 } from "@app/components/home/ContentComponents";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";

import type { IntegrationUseCase } from "../types";

interface UseCasesSectionProps {
  useCases: IntegrationUseCase[];
  integrationName: string;
}

export function UseCasesSection({
  useCases,
  integrationName,
}: UseCasesSectionProps) {
  if (useCases.length === 0) {
    return null;
  }

  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            How teams use {integrationName} with Dust
          </H2>

          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase, index) => {
              const IconComponent = getIcon(useCase.icon);

              return (
                <div
                  key={index}
                  className="rounded-2xl border border-border bg-white p-6 transition-all hover:border-green-200"
                >
                  <ResourceAvatar icon={IconComponent} size="sm" />
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {useCase.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {useCase.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Grid>
    </div>
  );
}
