import { Grid, H2, P } from "@app/components/home/ContentComponents";
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
  return (
    <section className="py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-4 text-center">Use cases for {integrationName}</H2>
          <P
            size="lg"
            className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground"
          >
            See how teams use Dust with {integrationName}
          </P>
        </div>

        {useCases.map((useCase, index) => {
          const IconComponent = getIcon(useCase.icon);
          return (
            <div
              key={index}
              className="bg-card col-span-12 rounded-lg border border-border p-6 md:col-span-6 lg:col-span-4"
            >
              <ResourceAvatar icon={IconComponent} size="sm" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {useCase.title}
              </h3>
              <P size="sm" className="mt-2 text-muted-foreground">
                {useCase.description}
              </P>
            </div>
          );
        })}
      </Grid>
    </section>
  );
}
