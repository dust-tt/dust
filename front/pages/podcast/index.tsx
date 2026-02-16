import {
  PODCAST_PAGE_SIZE,
  PodcastEpisodeGrid,
  PodcastHeader,
  PodcastLayout,
} from "@app/components/podcast/PodcastComponents";
import { PodcastPagination } from "@app/components/podcast/PodcastPagination";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getAllPodcastEpisodes } from "@app/lib/podcast/client";
import type { PodcastListingPageProps } from "@app/lib/podcast/types";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo } from "react";

export const getServerSideProps: GetServerSideProps<
  PodcastListingPageProps
> = async () => {
  const result = await getAllPodcastEpisodes();

  if (result.isErr()) {
    logger.error(
      { error: result.error },
      "Error fetching podcast episodes from RSS feed"
    );
    return {
      props: {
        episodes: [],
        channel: {
          title: "Podcast",
          description: "",
          imageUrl: null,
          link: "",
        },
        gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      },
    };
  }

  return {
    props: {
      episodes: result.value.episodes,
      channel: result.value.channel,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
};

export default function PodcastListing({
  episodes,
  channel,
}: PodcastListingPageProps) {
  const router = useRouter();

  const page = useMemo(() => {
    const queryPage = isString(router.query.page)
      ? router.query.page
      : undefined;
    const parsed = parseInt(queryPage ?? "1", 10);
    return parsed > 0 ? parsed : 1;
  }, [router.query.page]);

  const totalPages = Math.max(
    1,
    Math.ceil(episodes.length / PODCAST_PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PODCAST_PAGE_SIZE;
  const endIndex = startIndex + PODCAST_PAGE_SIZE;
  const paginatedEpisodes = episodes.slice(startIndex, endIndex);

  return (
    <>
      <Head>
        <title>{channel.title} | Dust</title>
        <meta
          name="description"
          content={
            channel.description ||
            "Listen to the Dust podcast for insights on AI agents, enterprise productivity, and building with AI."
          }
        />
        <meta property="og:title" content={`${channel.title} | Dust`} />
        <meta
          property="og:description"
          content={
            channel.description ||
            "Listen to the Dust podcast for insights on AI agents and enterprise productivity."
          }
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://dust.tt/podcast" />
        <meta property="og:image" content="/static/og_image.png" />
        <link rel="canonical" href="https://dust.tt/podcast" />
      </Head>

      <PodcastLayout>
        <PodcastHeader channel={channel} />

        <PodcastEpisodeGrid episodes={paginatedEpisodes} />

        {episodes.length > PODCAST_PAGE_SIZE && (
          <div className="col-span-12 mt-6 flex items-center justify-center">
            <PodcastPagination
              currentPage={currentPage}
              totalPages={totalPages}
              rowCount={episodes.length}
              pageSize={PODCAST_PAGE_SIZE}
            />
          </div>
        )}
      </PodcastLayout>
    </>
  );
}

PodcastListing.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
