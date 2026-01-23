import type { CustomerStoriesSectionConfig } from "@app/components/home/content/Industry/configs/utils";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllCustomerStories,
} from "@app/lib/contentful/client";
import type { CustomerStorySummary } from "@app/lib/contentful/types";
import logger from "@app/logger/logger";

/**
 * Maps industry page identifiers to Contentful industry values
 */
const INDUSTRY_MAPPING: Record<string, string[]> = {
  "b2b-saas": ["B2B SaaS"],
  consulting: ["Consulting"],
  "retail-ecommerce": ["Retail & E-commerce"],
  marketplace: ["Marketplace"],
  media: ["Media"],
  insurance: ["Insurance"],
  "investment-firms": ["Investment Firms"],
  "industrial-manufacturing": ["Industrial & Manufacturing"],
  "financial-services": ["Financial Services"],
  "energy-utilities": ["Energy & Utilities"],
};

/**
 * Type guard to check if a story has a valid hero image with a URL
 */
function hasHeroImage(
  story: CustomerStorySummary
): story is CustomerStorySummary & {
  heroImage: NonNullable<CustomerStorySummary["heroImage"]> & { url: string };
} {
  return story.heroImage?.url !== undefined && story.heroImage.url !== null;
}

/**
 * Fetches customer stories for a given industry and maps them to the format
 * expected by CustomerStoriesSection
 */
export async function getCustomerStoriesForIndustry(
  industryKey: string
): Promise<CustomerStoriesSectionConfig | null> {
  const industries = INDUSTRY_MAPPING[industryKey];

  if (!industries || industries.length === 0) {
    logger.warn(
      { industryKey },
      `No industry mapping found for industry key: ${industryKey}`
    );
    return null;
  }

  const storiesResult = await getAllCustomerStories("", {
    industries,
  });

  if (storiesResult.isErr()) {
    logger.error(
      { error: storiesResult.error, industryKey },
      `Error fetching customer stories from Contentful for ${industryKey} page`
    );
    return null;
  }

  // Filter stories that have hero images and limit to 5
  const stories = storiesResult.value.filter(hasHeroImage).slice(0, 5);

  if (stories.length === 0) {
    return null;
  }

  // Map Contentful stories to the format expected by CustomerStoriesSection
  return {
    title: "Customer stories",
    stories: stories.map((story) => ({
      title: story.title,
      content: story.headlineMetric ?? story.description ?? "",
      href: `/customers/${story.slug}`,
      src: story.heroImage.url,
    })),
  };
}

export { CONTENTFUL_REVALIDATE_SECONDS };
