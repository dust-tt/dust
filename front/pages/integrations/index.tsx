import {
  Button,
  Chip,
  MagnifyingGlassIcon,
  RocketIcon,
} from "@dust-tt/sparkle";
import type { GetStaticProps, InferGetStaticPropsType } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useMemo } from "react";

import type {
  IntegrationBase,
  IntegrationCategory,
} from "@app/components/home/content/Integration/types";
import {
  buildIntegrationRegistry,
  getAllCategories,
} from "@app/components/home/content/Integration/utils/integrationRegistry";
import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { isString } from "@app/types";

interface IntegrationsPageProps {
  integrations: IntegrationBase[];
  categories: IntegrationCategory[];
}

// Serialize for static props (convert to plain objects)
function serializeIntegration(integration: IntegrationBase): IntegrationBase {
  return {
    ...integration,
    tools: integration.tools.map((t) => ({ ...t })),
  };
}

export const getStaticProps: GetStaticProps<
  IntegrationsPageProps
> = async () => {
  const integrations = buildIntegrationRegistry();
  const categories = getAllCategories();

  return {
    props: {
      integrations: integrations.map(serializeIntegration),
      categories,
    },
  };
};

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

// Define a consistent category order for display
const CATEGORY_ORDER: IntegrationCategory[] = [
  "communication",
  "productivity",
  "crm",
  "support",
  "development",
  "data",
  "storage",
  "email",
  "calendar",
  "transcripts",
  "security",
  "ai",
];

// Generate structured data for the listing page
function generateListingSchema(integrations: IntegrationBase[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Dust AI Integrations",
    description: "Browse all integrations available with Dust AI agents",
    numberOfItems: integrations.length,
    itemListElement: integrations.slice(0, 20).map((integration, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareApplication",
        name: `Dust ${integration.name} Integration`,
        description: integration.description,
        url: `https://dust.tt/integrations/${integration.slug}`,
      },
    })),
  };
}

// Integration card component
function IntegrationCard({ integration }: { integration: IntegrationBase }) {
  const IconComponent = getIcon(integration.icon);
  return (
    <Link
      href={`/integrations/${integration.slug}`}
      className="bg-card rounded-lg border border-border p-6 transition-all hover:border-primary hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <ResourceAvatar icon={IconComponent} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">
              {integration.name}
            </h3>
            {integration.isPreview && (
              <span className="rounded-full bg-info-100 px-2 py-0.5 text-[10px] font-medium text-info-800">
                Preview
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[integration.category]}
          </span>
        </div>
      </div>
      <P size="xs" className="mt-3 line-clamp-2 text-muted-foreground">
        {integration.description}
      </P>
    </Link>
  );
}

export default function IntegrationsPage({
  integrations,
  categories,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const router = useRouter();

  // Read category from URL params
  const selectedCategory = useMemo(() => {
    const param = router.query.category;
    if (!param || !isString(param)) {
      return null;
    }
    // Validate that it's a valid category
    if (categories.includes(param as IntegrationCategory)) {
      return param as IntegrationCategory;
    }
    return null;
  }, [router.query.category, categories]);

  // Read search from URL params
  const searchQuery = useMemo(() => {
    const param = router.query.q;
    return isString(param) ? param : "";
  }, [router.query.q]);

  // Update URL when category changes
  const setSelectedCategory = useCallback(
    (category: IntegrationCategory | null) => {
      const newQuery = { ...router.query };
      if (category) {
        newQuery.category = category;
      } else {
        delete newQuery.category;
      }
      void router.push(
        { pathname: router.pathname, query: newQuery },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  // Update URL when search changes
  const setSearchQuery = useCallback(
    (query: string) => {
      const newQuery = { ...router.query };
      if (query) {
        newQuery.q = query;
      } else {
        delete newQuery.q;
      }
      void router.push(
        { pathname: router.pathname, query: newQuery },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  // Filter integrations based on search
  const searchFilteredIntegrations = useMemo(() => {
    if (!searchQuery) {
      return integrations;
    }
    return integrations.filter(
      (integration) =>
        integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        integration.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
    );
  }, [integrations, searchQuery]);

  // Group integrations by category
  const integrationsByCategory = useMemo(() => {
    const grouped: Record<IntegrationCategory, IntegrationBase[]> =
      {} as Record<IntegrationCategory, IntegrationBase[]>;

    for (const integration of searchFilteredIntegrations) {
      if (!grouped[integration.category]) {
        grouped[integration.category] = [];
      }
      grouped[integration.category].push(integration);
    }

    return grouped;
  }, [searchFilteredIntegrations]);

  // Get ordered categories that have integrations
  const orderedCategories = useMemo(() => {
    return CATEGORY_ORDER.filter(
      (cat) => integrationsByCategory[cat]?.length > 0
    );
  }, [integrationsByCategory]);

  return (
    <>
      <PageMetadata
        title="AI Integrations | Connect Your Tools to Dust AI Agents"
        description="Browse 50+ integrations for Dust AI. Connect Slack, Notion, GitHub, Salesforce, and more. Automate workflows with AI agents. Start free trial."
        pathname={router.asPath}
      />

      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateListingSchema(integrations)),
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
                <H1 className="mb-4 text-center text-4xl font-medium leading-tight text-foreground md:text-5xl">
                  AI Integrations for Every Tool
                </H1>

                <P size="lg" className="mb-8 max-w-2xl text-muted-foreground">
                  Connect your favorite apps to Dust and let AI agents automate
                  your workflows.
                </P>

                <Link href="/home" shallow>
                  <Button
                    variant="highlight"
                    size="md"
                    label="Get started with Dust"
                    icon={RocketIcon}
                    onClick={withTracking(
                      TRACKING_AREAS.HOME,
                      "integrations_listing_hero_cta"
                    )}
                  />
                </Link>
              </div>
            </Grid>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="container px-6 py-8">
          <div className="mx-auto max-w-4xl">
            {/* Search Input */}
            <div className="relative mb-6">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-3 pl-12 pr-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Category Filters using Chip */}
            <div className="flex flex-wrap justify-center gap-2">
              <Chip
                label="All"
                color={!selectedCategory ? "highlight" : undefined}
                className={
                  !selectedCategory
                    ? undefined
                    : "hover:s-bg-highlight-50 hover:s-border-highlight-200"
                }
                onClick={() => setSelectedCategory(null)}
              />
              {categories.map((category) => (
                <Chip
                  key={category}
                  label={CATEGORY_LABELS[category]}
                  color={
                    selectedCategory === category ? "highlight" : undefined
                  }
                  className={
                    selectedCategory === category
                      ? undefined
                      : "hover:s-bg-highlight-50 hover:s-border-highlight-200"
                  }
                  onClick={() => setSelectedCategory(category)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Integrations Content */}
        <div className="container px-6 pb-16">
          {selectedCategory ? (
            // Single category view
            <div>
              <H2 className="mb-8 text-center">
                {CATEGORY_LABELS[selectedCategory]}
              </H2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {integrationsByCategory[selectedCategory]?.map(
                  (integration) => (
                    <IntegrationCard
                      key={integration.slug}
                      integration={integration}
                    />
                  )
                )}
              </div>
              {(!integrationsByCategory[selectedCategory] ||
                integrationsByCategory[selectedCategory].length === 0) && (
                <div className="py-12 text-center">
                  <P size="lg" className="text-muted-foreground">
                    No integrations found in this category.
                  </P>
                </div>
              )}
            </div>
          ) : (
            // All categories view - grouped by category
            <div className="space-y-12">
              {orderedCategories.map((category) => (
                <section key={category}>
                  <h2 className="mb-6 text-2xl font-semibold text-foreground">
                    {CATEGORY_LABELS[category]}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {integrationsByCategory[category].map((integration) => (
                      <IntegrationCard
                        key={integration.slug}
                        integration={integration}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {orderedCategories.length === 0 && (
                <div className="py-12 text-center">
                  <P size="lg" className="text-muted-foreground">
                    No integrations found matching your search.
                  </P>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-4 text-primary hover:underline"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Final CTA - Full width blue section */}
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-primary-800 py-20 md:py-28">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex flex-col items-center justify-center text-center">
              <H2 className="mb-4 text-4xl font-medium text-white sm:text-5xl md:text-6xl">
                Ready to automate your workflows?
              </H2>
              <P size="lg" className="mb-8 max-w-2xl text-blue-100">
                Connect your favorite tools to Dust and let AI agents handle the
                rest.
              </P>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Link href="/home/pricing" shallow={true}>
                  <Button
                    variant="highlight"
                    size="md"
                    label="Start Free Trial"
                    className="w-full sm:w-auto"
                  />
                </Link>
                <Link href="/home/contact" shallow={true}>
                  <Button
                    variant="outline"
                    size="md"
                    label="Contact Sales"
                    className="w-full sm:w-auto"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

IntegrationsPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
