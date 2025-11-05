import { format } from "date-fns";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { BroadcastModel } from "@app/lib/models/broadcast";
import type { BroadcastType } from "@app/pages/api/poke/broadcasts/index";

interface ChangelogProps extends LandingLayoutProps {
  entries: BroadcastType[];
}

export const getStaticProps: GetStaticProps<ChangelogProps> = async () => {
  // Fetch published changelog entries
  const broadcasts = await BroadcastModel.findAll({
    where: {
      status: "published",
      publishToChangelog: true,
    },
    order: [["publishedAt", "DESC"]],
  });

  const entries: BroadcastType[] = broadcasts.map((b) => ({
    sId: b.sId,
    title: b.title,
    shortDescription: b.shortDescription,
    longDescription: b.longDescription,
    mediaUrl: b.mediaUrl,
    mediaType: b.mediaType,
    publishToChangelog: b.publishToChangelog,
    shouldBroadcast: b.shouldBroadcast,
    targetingType: b.targetingType,
    targetingData: b.targetingData,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate ? b.endDate.toISOString() : null,
    priority: b.priority,
    status: b.status,
    publishedAt: b.publishedAt ? b.publishedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  return {
    props: {
      entries,
      shape: getParticleShapeIndexByName(shapeNames.bigCube),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
    revalidate: 60 * 5, // Revalidate every 5 minutes
  };
};

export default function Changelog({ entries }: ChangelogProps) {
  return (
    <>
      <Head>
        <title>Changelog - Dust</title>
        <meta
          name="description"
          content="Stay up to date with the latest features and improvements to Dust."
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Dust Changelog RSS Feed"
          href="/api/changelog.rss"
        />
      </Head>

      <HeaderContentBlock
        title="Changelog"
        subtitle="Stay up to date with the latest features and improvements to Dust."
        hasCTA={false}
      />

      <Grid className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-12">
          {entries.length === 0 && (
            <div className="text-center text-element-600">
              No changelog entries yet. Check back soon!
            </div>
          )}

          {entries.map((entry) => (
            <article
              key={entry.sId}
              className="border-b border-structure-200 pb-12 last:border-0"
            >
              <div className="mb-4 flex items-center gap-4">
                <time
                  dateTime={entry.publishedAt || entry.createdAt}
                  className="text-sm text-element-600"
                >
                  {format(
                    new Date(entry.publishedAt || entry.createdAt),
                    "MMMM d, yyyy"
                  )}
                </time>
              </div>

              {entry.mediaUrl && (
                <div className="mb-6">
                  {entry.mediaType === "image" && (
                    <img
                      src={entry.mediaUrl}
                      alt={entry.title}
                      className="w-full rounded-lg object-cover"
                      style={{ maxHeight: "400px" }}
                    />
                  )}
                  {entry.mediaType === "gif" && (
                    <img
                      src={entry.mediaUrl}
                      alt={entry.title}
                      className="w-full rounded-lg"
                    />
                  )}
                  {entry.mediaType === "video" && (
                    <video
                      src={entry.mediaUrl}
                      className="w-full rounded-lg"
                      controls
                      muted
                      autoPlay={false}
                    />
                  )}
                </div>
              )}

              <h2 className="mb-3 text-2xl font-semibold text-element-900">
                {entry.title}
              </h2>

              <p className="mb-4 text-lg text-element-700">
                {entry.shortDescription}
              </p>

              {entry.longDescription && (
                <div className="prose prose-stone max-w-none">
                  <ReactMarkdown>{entry.longDescription}</ReactMarkdown>
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="mt-12 border-t border-structure-200 pt-8 text-center">
          <Link
            href="/api/changelog.rss"
            className="inline-flex items-center gap-2 text-sm text-action-500 hover:text-action-600"
          >
            <svg
              className="h-4 w-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3.75 3a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c6.075 0 11 4.925 11 11v.25c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75V16C17 8.82 11.18 3 4 3h-.25z"></path>
              <path d="M3 8.75A.75.75 0 013.75 8H4a8 8 0 018 8v.25a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75V16a6 6 0 00-6-6h-.25A.75.75 0 013 9.25v-.5zM7 15a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
            Subscribe to RSS Feed
          </Link>
        </div>
      </Grid>
    </>
  );
}

Changelog.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout {...pageProps}>{page}</LandingLayout>;
};