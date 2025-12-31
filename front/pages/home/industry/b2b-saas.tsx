import type { GetStaticProps } from "next";
import type { ReactElement } from "react";

import { b2bSaasConfig } from "@app/components/home/content/Industry/configs/b2bSaasConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllCustomerStories,
} from "@app/lib/contentful/client";
import logger from "@app/logger/logger";

export const getStaticProps: GetStaticProps = async () => {
  // Fetch customer stories filtered by B2B SaaS industry
  const storiesResult = await getAllCustomerStories("", {
    industries: ["B2B SaaS"],
  });

  let customerStories = null;

  if (storiesResult.isErr()) {
    logger.error(
      { error: storiesResult.error },
      "Error fetching customer stories from Contentful for B2B SaaS page"
    );
  } else {
    // Filter stories that have hero images and limit to 5
    const stories = storiesResult.value
      .filter((story) => story.heroImage?.url)
      .slice(0, 5);

    // Map Contentful stories to the format expected by CustomerStoriesSection
    if (stories.length > 0) {
      customerStories = {
        title: "Customer stories",
        stories: stories.map((story) => ({
          title: story.title,
          content: story.headlineMetric ?? story.description ?? "",
          href: `/customers/${story.slug}`,
          src: story.heroImage!.url,
        })),
      };
    }
  }

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      customerStories,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

interface B2BSaaSProps {
  gtmTrackingId: string | null;
  customerStories: {
    title: string;
    stories: Array<{
      title: string;
      content: string;
      href: string;
      src: string;
    }>;
  } | null;
}

export default function B2BSaaS({ customerStories }: B2BSaaSProps) {
  // Merge fetched customer stories into the config
  const config = {
    ...b2bSaasConfig,
    ...(customerStories && { customerStories }),
  };

  return <IndustryTemplate config={config} trackingPrefix="b2b" />;
}

B2BSaaS.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
