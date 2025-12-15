import { Chip, CollapsibleComponent, Pagination } from "@dust-tt/sparkle";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Grid, H1, P } from "@app/components/home/ContentComponents";
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
import logger from "@app/logger/logger";

const GRID_PAGE_SIZE = 12;

function sortCompanySizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const getFirstNumber = (size: string): number => {
      const match = size.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return getFirstNumber(a) - getFirstNumber(b);
  });
}

function extractFilterOptions(
  stories: CustomerStorySummary[]
): CustomerStoryFilterOptions {
  const industries = new Set<string>();
  const departments = new Set<string>();
  const companySizes = new Set<string>();
  const regions = new Set<string>();

  for (const story of stories) {
    for (const ind of story.industries) {
      industries.add(ind);
    }
    for (const dept of story.department) {
      departments.add(dept);
    }
    if (story.companySize) {
      companySizes.add(story.companySize);
    }
    for (const region of story.region) {
      regions.add(region);
    }
  }

  return {
    industries: [...industries].sort(),
    departments: [...departments].sort(),
    companySizes: sortCompanySizes([...companySizes]),
    regions: [...regions].sort(),
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
        filterOptions: {
          industries: [],
          departments: [],
          companySizes: [],
          regions: [],
        },
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
  defaultOpen?: boolean;
}

function FilterSection({
  title,
  options,
  selected,
  onChange,
  defaultOpen = false,
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
      <CollapsibleComponent
        rootProps={{ defaultOpen }}
        triggerProps={{
          label: title,
          variant: "secondary",
        }}
        contentChildren={
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
        }
      />
    </div>
  );
}

export default function CustomerStoriesListing({
  stories,
  filterOptions,
}: CustomerStoryListingPageProps) {
  const router = useRouter();
  const initialPage = useMemo(() => {
    const queryPage = Array.isArray(router.query.page)
      ? router.query.page[0]
      : router.query.page;
    const parsed = queryPage ? parseInt(queryPage, 10) : 1;
    return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }, [router.query.page]);

  const [page, setPage] = useState<number>(initialPage);

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

  const selectedRegions = useMemo(() => {
    const param = router.query.region;
    if (!param) {
      return [];
    }
    return Array.isArray(param) ? param : [param];
  }, [router.query.region]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [
    selectedIndustries,
    selectedDepartments,
    selectedCompanySizes,
    selectedRegions,
  ]);

  useEffect(() => {
    const queryPage = Array.isArray(router.query.page)
      ? router.query.page[0]
      : router.query.page;
    const parsed = queryPage ? parseInt(queryPage, 10) : 1;
    setPage(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
  }, [router.query.page]);

  const buildQuery = useCallback(
    (
      query: Record<string, string | string[] | undefined>,
      pageNumber: number
    ): Record<string, string | string[] | undefined> => {
      const nextQuery = { ...query };
      if (pageNumber > 1) {
        nextQuery.page = pageNumber.toString();
      } else {
        delete nextQuery.page;
      }
      return nextQuery;
    },
    []
  );

  const updateFilters = useCallback(
    (key: string, values: string[]) => {
      const newQuery = { ...router.query };
      if (values.length > 0) {
        newQuery[key] = values;
      } else {
        delete newQuery[key];
      }
      const finalQuery = buildQuery(newQuery, 1);
      setPage(1);
      void router.push(
        { pathname: router.pathname, query: finalQuery },
        undefined,
        {
          shallow: true,
          scroll: true,
        }
      );
    },
    [buildQuery, router]
  );

  const filteredStories = useMemo(() => {
    return stories.filter((story) => {
      if (
        selectedIndustries.length > 0 &&
        !story.industries.some((ind) => selectedIndustries.includes(ind))
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
      if (
        selectedRegions.length > 0 &&
        !story.region.some((r) => selectedRegions.includes(r))
      ) {
        return false;
      }
      return true;
    });
  }, [
    stories,
    selectedIndustries,
    selectedDepartments,
    selectedCompanySizes,
    selectedRegions,
  ]);

  const hasActiveFilters =
    selectedIndustries.length > 0 ||
    selectedDepartments.length > 0 ||
    selectedCompanySizes.length > 0 ||
    selectedRegions.length > 0;

  const clearAllFilters = useCallback(() => {
    setPage(1);
    void router.push({ pathname: router.pathname }, undefined, {
      shallow: true,
      scroll: true,
    });
  }, [router]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredStories.length / GRID_PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * GRID_PAGE_SIZE;
  const endIndex = startIndex + GRID_PAGE_SIZE;
  const paginatedStories = filteredStories.slice(startIndex, endIndex);

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      setPage(pageNumber);
      const nextQuery = buildQuery(router.query, pageNumber);
      void router.push(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        {
          shallow: true,
          scroll: true,
        }
      );
    },
    [buildQuery, router]
  );

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
          <H1 className="text-5xl">Customer Stories</H1>
          <P size="lg" className="mt-4 text-muted-foreground">
            See how teams across industries are transforming their work with
            Dust
          </P>
        </div>

        {/* Main content area */}
        <div className="col-span-12 mt-8 flex flex-col gap-8 lg:flex-row">
          {/* Filters sidebar */}
          <aside className="w-full shrink-0 lg:w-64">
            <div className="sticky top-24 rounded-2xl border border-gray-100 bg-white p-6">
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
                title="Department"
                options={filterOptions.departments}
                selected={selectedDepartments}
                onChange={(values) => updateFilters("department", values)}
                defaultOpen={true}
              />

              <FilterSection
                title="Industry"
                options={filterOptions.industries}
                selected={selectedIndustries}
                onChange={(values) => updateFilters("industry", values)}
              />

              <FilterSection
                title="Region"
                options={filterOptions.regions}
                selected={selectedRegions}
                onChange={(values) => updateFilters("region", values)}
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
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedStories.map((story) => (
                    <Link
                      key={story.id}
                      href={`/customers/${story.slug}`}
                      className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-colors"
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
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="h-full w-full object-cover"
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

                      <div className="flex flex-1 flex-col gap-3 px-6 py-6">
                        <div className="text-sm text-muted-foreground">
                          {story.companyName}
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                          {story.title}
                        </h3>
                        {story.headlineMetric && (
                          <p className="text-base text-muted-foreground">
                            {story.headlineMetric}
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap gap-2">
                          {story.industries.map((industry) => (
                            <Chip
                              key={industry}
                              label={industry}
                              size="xs"
                              color="primary"
                            />
                          ))}
                          {story.department.map((dept) => (
                            <Chip
                              key={dept}
                              label={dept}
                              size="xs"
                              color="primary"
                            />
                          ))}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {filteredStories.length > GRID_PAGE_SIZE && (
                  <div className="mt-6 flex items-center justify-center">
                    <Pagination
                      rowCount={filteredStories.length}
                      pagination={{
                        pageIndex: currentPage - 1,
                        pageSize: GRID_PAGE_SIZE,
                      }}
                      setPagination={({ pageIndex }) =>
                        handlePageChange(pageIndex + 1)
                      }
                      size="sm"
                    />
                  </div>
                )}
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
