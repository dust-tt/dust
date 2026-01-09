import { Button, MagnifyingGlassIcon, RocketIcon } from "@dust-tt/sparkle";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import type {
  IntegrationBase,
  IntegrationCategory,
} from "@app/components/home/content/Integration/types";
import {
  buildIntegrationRegistry,
  getAllCategories,
} from "@app/components/home/content/Integration/utils/integrationRegistry";
import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";

interface IntegrationsPageProps {
  integrations: IntegrationBase[];
  categories: IntegrationCategory[];
}

// Generate Schema.org ItemList JSON-LD
function generateItemListSchema(integrations: IntegrationBase[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Dust Integrations",
    description:
      "Connect Dust AI agents to your favorite tools and data sources",
    numberOfItems: integrations.length,
    itemListElement: integrations.map((integration, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: integration.name,
      description: integration.description,
      url: `https://dust.tt/integrations/${integration.slug}`,
    })),
  };
}

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  communication: "Communication",
  productivity: "Productivity",
  crm: "CRM & Sales",
  development: "Development",
  data: "Data & Analytics",
  email: "Email",
  calendar: "Calendar",
  storage: "Storage",
  support: "Support",
  security: "Security",
  ai: "AI & ML",
  transcripts: "Meeting Transcripts",
};

export const getStaticProps: GetStaticProps<IntegrationsPageProps> = async () => {
  const integrations = buildIntegrationRegistry();
  const categories = getAllCategories();

  return {
    props: {
      integrations,
      categories,
    },
  };
};

export default function IntegrationsPage({
  integrations,
  categories,
}: IntegrationsPageProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<IntegrationCategory | null>(null);

  // Filter integrations based on search and category
  const filteredIntegrations = useMemo(() => {
    return integrations.filter((integration) => {
      const matchesSearch =
        searchQuery === "" ||
        integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        integration.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === null || integration.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [integrations, searchQuery, selectedCategory]);

  // Group by category for display
  const integrationsByCategory = useMemo(() => {
    const grouped = new Map<IntegrationCategory, IntegrationBase[]>();
    for (const integration of filteredIntegrations) {
      const existing = grouped.get(integration.category) ?? [];
      grouped.set(integration.category, [...existing, integration]);
    }
    return grouped;
  }, [filteredIntegrations]);

  return (
    <>
      <PageMetadata
        title="Integrations | Dust AI Agents"
        description="Connect Dust to 50+ tools and data sources. Slack, Notion, GitHub, Salesforce, Google Drive, and more. Build AI agents that work with your entire stack."
        pathname={router.asPath}
      />

      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateItemListSchema(integrations)),
          }}
        />
      </Head>

      <div className="-mb-24 flex w-full flex-col">
        {/* Hero Section */}
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-col px-6 pb-12 pt-16 md:pb-16 md:pt-24">
            <Grid>
              <div
                className={cn(
                  "col-span-12 flex flex-col items-center justify-center text-center",
                  "lg:col-span-10 lg:col-start-2",
                  "xl:col-span-8 xl:col-start-3"
                )}
              >
                <H1
                  mono
                  className="mb-4 text-center text-4xl font-medium leading-tight text-foreground md:text-5xl"
                >
                  Integrations
                </H1>
                <P size="lg" className="mb-8 max-w-2xl text-muted-foreground">
                  Connect Dust to your favorite tools and data sources. Build AI
                  agents that work with your entire stack.
                </P>

                {/* Search */}
                <div className="mb-8 w-full max-w-md">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search integrations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    />
                  </div>
                </div>

                {/* Category filters */}
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-all",
                      selectedCategory === null
                        ? "bg-green-600 text-white"
                        : "bg-white text-muted-foreground hover:bg-gray-100"
                    )}
                  >
                    All
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-medium transition-all",
                        selectedCategory === category
                          ? "bg-green-600 text-white"
                          : "bg-white text-muted-foreground hover:bg-gray-100"
                      )}
                    >
                      {CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </div>

                {/* Count */}
                <p className="mt-6 text-sm text-muted-foreground">
                  {filteredIntegrations.length} integration
                  {filteredIntegrations.length !== 1 ? "s" : ""} available
                </p>
              </div>
            </Grid>
          </div>
        </div>

        {/* Integrations Grid */}
        <div className="container px-2 py-12 md:py-16">
          <Grid>
            <div className="col-span-12">
              {selectedCategory === null ? (
                // Show by category
                <div className="space-y-12">
                  {Array.from(integrationsByCategory.entries()).map(
                    ([category, categoryIntegrations]) => (
                      <div key={category}>
                        <h2 className="mb-6 text-xl font-semibold text-foreground">
                          {CATEGORY_LABELS[category]}
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {categoryIntegrations.map((integration) => (
                            <IntegrationCard
                              key={integration.slug}
                              integration={integration}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                // Show flat grid for selected category
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {filteredIntegrations.map((integration) => (
                    <IntegrationCard
                      key={integration.slug}
                      integration={integration}
                    />
                  ))}
                </div>
              )}

              {filteredIntegrations.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No integrations found matching your search.
                  </p>
                </div>
              )}
            </div>
          </Grid>
        </div>

        {/* CTA Section */}
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-blue-50 py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-6">
            <Grid>
              <div className="col-span-12">
                <div className="px-6 py-16 md:px-12 md:py-20">
                  <div className="mx-auto max-w-3xl text-center">
                    <h2 className="mb-4 text-center text-3xl font-semibold text-foreground md:text-4xl">
                      Ready to connect your tools?
                    </h2>
                    <P size="lg" className="mb-8 text-muted-foreground">
                      Start building AI agents that work with your entire tech
                      stack.
                    </P>

                    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                      <Link href="/home" shallow>
                        <Button
                          variant="highlight"
                          size="md"
                          label="Start free trial"
                          icon={RocketIcon}
                          onClick={withTracking(
                            TRACKING_AREAS.HOME,
                            "integrations_listing_cta_primary"
                          )}
                        />
                      </Link>
                      <Link href="/home/booking" shallow>
                        <Button
                          variant="outline"
                          size="md"
                          label="Talk to sales"
                          onClick={withTracking(
                            TRACKING_AREAS.HOME,
                            "integrations_listing_cta_secondary"
                          )}
                        />
                      </Link>
                    </div>

                    <P size="sm" className="mt-6 text-muted-foreground">
                      14-day free trial. No credit card required.
                    </P>
                  </div>
                </div>
              </div>
            </Grid>
          </div>
        </div>
      </div>
    </>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationBase }) {
  const IconComponent = getIcon(integration.icon);
  const typeLabel =
    integration.type === "both"
      ? "Tools & Data"
      : integration.type === "mcp_server"
        ? "Tools"
        : "Data";

  return (
    <Link
      href={`/integrations/${integration.slug}`}
      className="group flex flex-col rounded-2xl border border-border bg-white p-6 transition-all hover:border-green-200 hover:shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between">
        <ResourceAvatar icon={IconComponent} size="md" />
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {typeLabel}
        </span>
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {integration.name}
      </h3>
      <p className="mt-1 line-clamp-2 flex-grow text-sm text-muted-foreground">
        {integration.description}
      </p>
      {integration.tools.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {integration.tools.length} action
          {integration.tools.length !== 1 ? "s" : ""} available
        </p>
      )}
    </Link>
  );
}

IntegrationsPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
