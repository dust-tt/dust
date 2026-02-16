import { Grid, H1 } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { TransistorPlayer } from "@app/components/podcast/PodcastComponents";
import {
  getPodcastEpisodeBySlug,
  PODCAST_REVALIDATE_SECONDS,
} from "@app/lib/podcast/client";
import type { PodcastEpisodePageProps } from "@app/lib/podcast/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<PodcastEpisodePageProps> = async (
  context
) => {
  const { slug } = context.params ?? {};

  if (!isString(slug)) {
    return { notFound: true };
  }

  const result = await getPodcastEpisodeBySlug(slug);

  if (result.isErr()) {
    logger.error(
      { slug, error: result.error },
      `Error fetching podcast episode "${slug}"`
    );
    return { notFound: true };
  }

  if (!result.value) {
    return { notFound: true };
  }

  return {
    props: {
      episode: result.value.episode,
      channel: result.value.channel,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
    revalidate: PODCAST_REVALIDATE_SECONDS,
  };
};

function formatDuration(durationSeconds: number | null): string | null {
  if (durationSeconds === null) {
    return null;
  }
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

export default function PodcastEpisodePage({
  episode,
  channel,
}: PodcastEpisodePageProps) {
  const canonicalUrl = `https://dust.tt/podcast/${episode.slug}`;
  const ogImageUrl = episode.imageUrl ?? "https://dust.tt/static/og_image.png";
  const duration = formatDuration(episode.durationSeconds);

  return (
    <>
      <Head>
        <title>
          {episode.title} | {channel.title} | Dust
        </title>
        {episode.description && (
          <meta name="description" content={episode.description} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:title" content={episode.title} />
        {episode.description && (
          <meta property="og:description" content={episode.description} />
        )}
        <meta property="og:type" content="music.song" />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Dust" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={episode.title} />
        {episode.description && (
          <meta name="twitter:description" content={episode.description} />
        )}
        <meta name="twitter:image" content={ogImageUrl} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "PodcastEpisode",
              name: episode.title,
              ...(episode.description && {
                description: episode.description,
              }),
              url: canonicalUrl,
              datePublished: episode.publishedAt,
              ...(episode.durationSeconds && {
                timeRequired: `PT${Math.ceil(episode.durationSeconds / 60)}M`,
              }),
              ...(episode.episodeNumber !== null && {
                episodeNumber: episode.episodeNumber,
              }),
              image: ogImageUrl,
              associatedMedia: {
                "@type": "MediaObject",
                contentUrl: episode.audioUrl,
              },
              partOfSeries: {
                "@type": "PodcastSeries",
                name: channel.title,
                url: "https://dust.tt/podcast",
              },
            }),
          }}
        />
      </Head>

      <article>
        <Grid>
          <div className={classNames(WIDE_CLASSES, "pb-2 pt-6")}>
            <Link
              href="/podcast"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>&larr;</span> Back to Podcast
            </Link>
          </div>

          <header className={WIDE_CLASSES}>
            <H1 className="text-4xl md:text-5xl">{episode.title}</H1>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {formatTimestampToFriendlyDate(
                  new Date(episode.publishedAt).getTime(),
                  "short"
                )}
              </span>
              {duration && (
                <>
                  <span>&middot;</span>
                  <span>{duration}</span>
                </>
              )}
              {episode.episodeNumber !== null && (
                <>
                  <span>&middot;</span>
                  <span>Episode {episode.episodeNumber}</span>
                </>
              )}
            </div>
          </header>

          <div className={classNames(WIDE_CLASSES, "mt-6")}>
            <TransistorPlayer
              transistorId={episode.transistorId}
              title={episode.title}
            />
          </div>

          {episode.descriptionHtml && (
            <div
              className={classNames(
                WIDE_CLASSES,
                "prose prose-lg mt-8 max-w-none"
              )}
              dangerouslySetInnerHTML={{ __html: episode.descriptionHtml }}
            />
          )}
        </Grid>
      </article>
    </>
  );
}

PodcastEpisodePage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
