import type { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useMemo } from "react";

import { Grid, H1, H5, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllCustomerStories,
} from "@app/lib/contentful/client";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type {
  CustomerStoryFilterOptions,
  CustomerStoryListingPageProps,
  CustomerStorySummary,
} from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";

function extractFilterOptions(
  stories: CustomerStorySummary[]
): CustomerStoryFilterOptions {
  const industries = new Set<string>();
  const departments = new Set<string>();
  const companySizes = new Set<string>();

  for (const story of stories) {
    if (story.industry) {
      industries.add(story.industry);
    }
    for (const dept of story.department) {
      departments.add(dept);
    }
    if (story.companySize) {
      companySizes.add(story.companySize);
    }
  }

  return {
    industries: [...industries].sort(),
    departments: [...departments].sort(),
    companySizes: [...companySizes].sort(),
  };
}

export const getStaticProps: GetStaticProps<
  CustomerStoryListingPageProps
> = async () => {
  const storiesResult = await getAllCustomerStories();

  if (storiesResult.isErr()) {
    logger.error(
      { error: storiesResult.error },
      "Error fetching customer stories from Contentful"
    );
    return {
      props: {
        stories: [],
        filterOptions: { industries: [], departments: [], companySizes: [] },
        gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      },
      revalidate: CONTENTFUL_REVALIDATE_SECONDS,
    };
  }

  const stories = storiesResult.value;

  return {
    props: {
      stories,
      filterOptions: extractFilterOptions(stories),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

interface FilterCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function FilterCheckbox({ label, checked, onChange }: FilterCheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-highlight focus:ring-highlight"
      />
      {label}
    </label>
  );
}

interface FilterSectionProps {
  title: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function FilterSection({
  title,
  options,
  selected,
  onChange,
}: FilterSectionProps) {
  const handleToggle = useCallback(
    (option: string, checked: boolean) => {
      if (checked) {
        onChange([...selected, option]);
      } else {
        onChange(selected.filter((s) => s !== option));
      }
    },
    [selected, onChange]
  );

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <FilterCheckbox
            key={option}
            label={option}
            checked={selected.includes(option)}
            onChange={(checked) => handleToggle(option, checked)}
          />
        ))}
      </div>
    </div>
  );
}

export default function CustomerStoriesListing({
  stories,
  filterOptions,
}: CustomerStoryListingPageProps) {
  const router = useRouter();

  // Parse filters from URL query params
  const selectedIndustries = useMemo(() => {
    const param = router.query.industry;
    if (!param) {
      return [];
    }
    return Array.isArray(param) ? param : [param];
  }, [router.query.industry]);

  const selectedDepartments = useMemo(() => {
    const param = router.query.department;
    if (!param) {
      return [];
    }
    return Array.isArray(param) ? param : [param];
  }, [router.query.department]);

  const selectedCompanySizes = useMemo(() => {
    const param = router.query.size;
    if (!param) {
      return [];
    }
    return Array.isArray(param) ? param : [param];
  }, [router.query.size]);

  // Update URL with new filters
  const updateFilters = useCallback(
    (key: string, values: string[]) => {
      const newQuery = { ...router.query };
      if (values.length > 0) {
        newQuery[key] = values;
      } else {
        delete newQuery[key];
      }
      void router.push(
        { pathname: router.pathname, query: newQuery },
        undefined,
        {
          shallow: true,
        }
      );
    },
    [router]
  );

  // Filter stories based on selected filters
  const filteredStories = useMemo(() => {
    return stories.filter((story) => {
      if (
        selectedIndustries.length > 0 &&
        !selectedIndustries.includes(story.industry)
      ) {
        return false;
      }
      if (
        selectedDepartments.length > 0 &&
        !story.department.some((d) => selectedDepartments.includes(d))
      ) {
        return false;
      }
      if (
        selectedCompanySizes.length > 0 &&
        story.companySize &&
        !selectedCompanySizes.includes(story.companySize)
      ) {
        return false;
      }
      return true;
    });
  }, [stories, selectedIndustries, selectedDepartments, selectedCompanySizes]);

  const hasActiveFilters =
    selectedIndustries.length > 0 ||
    selectedDepartments.length > 0 ||
    selectedCompanySizes.length > 0;

  const clearAllFilters = useCallback(() => {
    void router.push({ pathname: router.pathname }, undefined, {
      shallow: true,
    });
  }, [router]);

  return (
    <>
      <Head>
        <title>Customer Stories | Dust</title>
        <meta
          name="description"
          content="Discover how leading companies use Dust to transform their workflows with AI agents. Read customer success stories from Sales, Marketing, Customer Support, and more."
        />
        <meta property="og:title" content="Customer Stories | Dust" />
        <meta
          property="og:description"
          content="Discover how leading companies use Dust to transform their workflows with AI agents."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://dust.tt/customers" />
        <meta property="og:image" content="/static/og_image.png" />
      </Head>

      <Grid>
        <div className="col-span-12 pt-12">
          <H1 mono>Customer Stories</H1>
          <P size="lg" className="mt-4 text-muted-foreground">
            See how teams across industries are transforming their work with
            Dust
          </P>
        </div>

        {/* Main content area */}
        <div className="col-span-12 mt-8 flex flex-col gap-8 lg:flex-row">
          {/* Filters sidebar */}
          <aside className="w-full shrink-0 lg:w-64">
            <div className="sticky top-24 rounded-xl bg-muted-background p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Filters</h2>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="text-sm text-highlight hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <FilterSection
                title="Industry"
                options={filterOptions.industries}
                selected={selectedIndustries}
                onChange={(values) => updateFilters("industry", values)}
              />

              <FilterSection
                title="Department"
                options={filterOptions.departments}
                selected={selectedDepartments}
                onChange={(values) => updateFilters("department", values)}
              />

              <FilterSection
                title="Company Size"
                options={filterOptions.companySizes}
                selected={selectedCompanySizes}
                onChange={(values) => updateFilters("size", values)}
              />
            </div>
          </aside>

          {/* Stories grid */}
          <div className="flex-1">
            {filteredStories.length > 0 ? (
              <>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredStories.map((story) => (
                    <Link
                      key={story.id}
                      href={`/customers/${story.slug}`}
                      className={classNames(
                        "flex h-full flex-col overflow-hidden rounded-xl bg-muted-background",
                        "group transition duration-300 ease-out",
                        "hover:bg-primary-100"
                      )}
                    >
                      {/* Hero image or logo */}
                      <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-gray-100">
                        {story.heroImage ? (
                          <Image
                            src={story.heroImage.url}
                            alt={story.heroImage.alt}
                            width={640}
                            height={360}
                            loader={contentfulImageLoader}
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="h-full w-full object-cover brightness-100 transition duration-300 ease-out group-hover:brightness-110"
                          />
                        ) : story.companyLogo ? (
                          <div className="flex h-full w-full items-center justify-center bg-white p-8">
                            <Image
                              src={story.companyLogo.url}
                              alt={story.companyLogo.alt}
                              width={160}
                              height={80}
                              className="max-h-16 w-auto object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-primary-100">
                            <span className="text-2xl font-bold text-primary-400">
                              {story.companyName.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-6">
                        {/* Company name and headline metric */}
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {story.companyName}
                          </span>
                          {story.headlineMetric && (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                              {story.headlineMetric}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <H5 className="line-clamp-3 text-foreground" mono>
                          {story.title}
                        </H5>

                        {/* Tags */}
                        <div className="mt-auto flex flex-wrap gap-1 pt-4">
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {story.industry}
                          </span>
                          {story.department.slice(0, 2).map((dept) => (
                            <span
                              key={dept}
                              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                            >
                              {dept}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-12 text-center">
                <P size="md" className="text-muted-foreground">
                  {hasActiveFilters
                    ? "No stories match your filters. Try adjusting your selection."
                    : "No customer stories available yet. Check back soon!"}
                </P>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="mt-4 text-highlight hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </Grid>
    </>
  );
}

CustomerStoriesListing.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
