import type { getCustomerStoriesForIndustry } from "@app/lib/contentful/industryStories";

/**
 * Shared props interface for all industry pages
 */
export interface IndustryPageProps {
  gtmTrackingId: string | null;
  customerStories: Awaited<
    ReturnType<typeof getCustomerStoriesForIndustry>
  > | null;
}
