import { ArrowRightIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { Grid, H2 } from "@app/components/home/ContentComponents";
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
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            Other integrations you might like
          </H2>

          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {integrations.map((integration) => {
              const IconComponent = getIcon(integration.icon);

              return (
                <Link
                  key={integration.slug}
                  href={`/integrations/${integration.slug}`}
                  className="group flex flex-col items-center rounded-2xl border border-border bg-white p-6 transition-all hover:border-green-200 hover:shadow-sm"
                >
                  <ResourceAvatar icon={IconComponent} size="md" />
                  <h3 className="mt-3 text-center text-sm font-semibold text-foreground">
                    {integration.name}
                  </h3>
                  <span className="mt-1 text-xs capitalize text-muted-foreground">
                    {integration.category}
                  </span>
                  <span className="mt-3 flex items-center gap-1 text-xs font-medium text-green-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Learn more
                    <ArrowRightIcon className="h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/integrations"
              className="inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700"
            >
              View all integrations
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Grid>
    </div>
  );
}
