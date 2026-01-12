import Link from "next/link";

import { Grid, H2, P } from "@app/components/home/ContentComponents";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";

import type { IntegrationBase } from "../types";

interface RelatedIntegrationsSectionProps {
  integrations: IntegrationBase[];
}

export function RelatedIntegrationsSection({
  integrations,
}: RelatedIntegrationsSectionProps) {
  if (integrations.length === 0) {
    return null;
  }

  return (
    <section className="py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-4 text-center">Related integrations</H2>
          <P size="lg" className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            Explore other tools that work great with Dust
          </P>
        </div>

        {integrations.map((integration) => {
          const IconComponent = getIcon(integration.icon);
          return (
            <Link
              key={integration.slug}
              href={`/integrations/${integration.slug}`}
              className="col-span-6 rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary md:col-span-3"
            >
              <ResourceAvatar icon={IconComponent} size="sm" />
              <h3 className="mt-4 font-semibold text-foreground">
                {integration.name}
              </h3>
              <P size="xs" className="mt-1 line-clamp-2 text-muted-foreground">
                {integration.description}
              </P>
            </Link>
          );
        })}
      </Grid>
    </section>
  );
}
