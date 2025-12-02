import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { Grid, H1, H2, H5 } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import config from "@app/lib/api/config";
import {
  getCustomerStoryBySlug,
  getRelatedCustomerStories,
} from "@app/lib/contentful/client";
import { renderRichTextFromContentful } from "@app/lib/contentful/richTextRenderer";
import type { CustomerStoryPageProps } from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export const getServerSideProps: GetServerSideProps<
  CustomerStoryPageProps
> = async (context) => {
  const { slug } = context.params ?? {};
  const { preview, secret } = context.query;

  if (!isString(slug)) {
    return { notFound: true };
  }

  const previewSecret = config.getContentfulPreviewSecret();
  const isPreview =
    preview === "true" &&
    isString(secret) &&
    isString(previewSecret) &&
    secret === previewSecret;

  const storyResult = await getCustomerStoryBySlug(slug, isPreview);

  if (storyResult.isErr()) {
    logger.error(
      { slug, error: storyResult.error, isPreview },
      `Error fetching customer story "${slug}"`
    );
    return { notFound: true };
  }

  const story = storyResult.value;

  if (!story) {
    return { notFound: true };
  }

  const relatedStoriesResult = await getRelatedCustomerStories(
    slug,
    story.industry,
    story.department,
    3,
    isPreview
  );

  if (relatedStoriesResult.isErr()) {
    logger.error(
      { slug, error: relatedStoriesResult.error },
      `Error fetching related stories for "${slug}"`
    );
  }

  return {
    props: {
      story,
      relatedStories: relatedStoriesResult.isOk()
        ? relatedStoriesResult.value
        : [],
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      preview: isPreview,
    },
  };
};

const CONTENT_CLASSES = classNames("col-span-12", "lg:col-span-8");

const SIDEBAR_CLASSES = classNames(
  "col-span-12",
  "lg:col-span-4 lg:col-start-9"
);

const WIDE_CLASSES = classNames("col-span-12");

export default function CustomerStoryPage({
  story,
  relatedStories,
  preview,
}: CustomerStoryPageProps) {
  const ogImageUrl =
    story.heroImage?.url ??
    story.companyLogo?.url ??
    "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/customers/${story.slug}`;

  return (
    <>
      {preview && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-amber-100 px-4 py-2 text-center text-amber-800">
          Preview Mode - This is a draft
        </div>
      )}
      <Head>
        <title>
          {story.companyName}: {story.title} | Dust Customer Story
        </title>
        {preview && <meta name="robots" content="noindex, nofollow" />}
        {story.description && (
          <meta name="description" content={story.description} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        <meta
          property="og:title"
          content={`${story.companyName}: ${story.title}`}
        />
        {story.description && (
          <meta property="og:description" content={story.description} />
        )}
        <meta property="og:type" content="article" />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Dust" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content={`${story.companyName}: ${story.title}`}
        />
        {story.description && (
          <meta name="twitter:description" content={story.description} />
        )}
        <meta name="twitter:image" content={ogImageUrl} />

        <meta property="article:published_time" content={story.createdAt} />
        <meta property="article:modified_time" content={story.updatedAt} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: `${story.companyName}: ${story.title}`,
              ...(story.description && { description: story.description }),
              image: ogImageUrl,
              url: canonicalUrl,
              datePublished: story.createdAt,
              dateModified: story.updatedAt,
              author: {
                "@type": "Organization",
                name: "Dust",
              },
              publisher: {
                "@type": "Organization",
                name: "Dust",
                logo: {
                  "@type": "ImageObject",
                  url: "https://dust.tt/static/og_image.png",
                },
              },
              about: {
                "@type": "Organization",
                name: story.companyName,
                ...(story.companyWebsite && { url: story.companyWebsite }),
              },
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": canonicalUrl,
              },
            }),
          }}
        />
      </Head>

      <article>
        <Grid>
          {/* Header */}
          <header className={classNames(WIDE_CLASSES, "pt-16")}>
            <Link
              href="/customers"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>&larr;</span> All Customer Stories
            </Link>

            {/* Tags */}
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-highlight/10 px-3 py-1 text-sm font-medium text-highlight">
                {story.industry}
              </span>
              {story.department.map((dept) => (
                <span
                  key={dept}
                  className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600"
                >
                  {dept}
                </span>
              ))}
            </div>

            <H1 mono>{story.title}</H1>

            {/* Headline metric */}
            {story.headlineMetric && (
              <div className="mt-6">
                <span className="inline-block rounded-lg bg-emerald-50 px-4 py-2 text-xl font-bold text-emerald-600">
                  {story.headlineMetric}
                </span>
              </div>
            )}
          </header>

          {/* Hero image */}
          {story.heroImage && (
            <div className={classNames(WIDE_CLASSES, "mt-8")}>
              <Image
                src={story.heroImage.url}
                alt={story.heroImage.alt}
                width={story.heroImage.width}
                height={story.heroImage.height}
                className="rounded-2xl"
                priority
              />
            </div>
          )}

          {/* Main content and sidebar */}
          <div className={classNames(CONTENT_CLASSES, "mt-12")}>
            {/* Rich text body */}
            {renderRichTextFromContentful(story.body)}

            {/* Gallery */}
            {story.gallery.length > 0 && (
              <div className="mt-12">
                <H2 className="mb-6">Gallery</H2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {story.gallery.map((image, index) => (
                    <Image
                      key={index}
                      src={image.url}
                      alt={image.alt}
                      width={image.width}
                      height={image.height}
                      className="rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className={classNames(SIDEBAR_CLASSES, "mt-12 lg:mt-12")}>
            <div className="sticky top-24 space-y-6">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-center border-b border-gray-100 bg-white px-6 py-8">
                  {story.companyLogo ? (
                    <Image
                      src={story.companyLogo.url}
                      alt={story.companyLogo.alt}
                      width={200}
                      height={100}
                      className="h-16 w-auto object-contain"
                    />
                  ) : (
                    <span className="text-xl font-bold text-foreground">
                      {story.companyName}
                    </span>
                  )}
                </div>

                <div className="p-6">
                  <dl className="space-y-4">
                    <div className="flex items-start justify-between">
                      <dt className="text-sm text-muted-foreground">
                        Industry
                      </dt>
                      <dd className="text-right text-sm font-medium text-foreground">
                        {story.industry}
                      </dd>
                    </div>
                    {story.companySize && (
                      <div className="flex items-start justify-between">
                        <dt className="text-sm text-muted-foreground">
                          Company Size
                        </dt>
                        <dd className="text-right text-sm font-medium text-foreground">
                          {story.companySize}
                        </dd>
                      </div>
                    )}
                    {story.department.length > 0 && (
                      <div className="flex items-start justify-between">
                        <dt className="text-sm text-muted-foreground">
                          Departments
                        </dt>
                        <dd className="text-right text-sm font-medium text-foreground">
                          {story.department.join(", ")}
                        </dd>
                      </div>
                    )}
                    {story.companyWebsite && (
                      <div className="pt-2">
                        <a
                          href={story.companyWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-gray-50"
                        >
                          Visit website
                          <span className="text-muted-foreground">&rarr;</span>
                        </a>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {(story.contactName !== null || story.contactTitle !== null) && (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    {story.contactPhoto && (
                      <Image
                        src={story.contactPhoto.url}
                        alt={story.contactPhoto.alt}
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    )}
                    {!story.contactPhoto && story.contactName && (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-highlight/10">
                        <span className="text-lg font-semibold text-highlight">
                          {story.contactName.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {story.contactName && (
                        <p className="font-semibold text-foreground">
                          {story.contactName}
                        </p>
                      )}
                      {story.contactTitle && (
                        <p className="truncate text-sm text-muted-foreground">
                          {story.contactTitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </Grid>
      </article>

      {relatedStories.length > 0 && (
        <section className="mt-20">
          <Grid>
            <div className={WIDE_CLASSES}>
              <H2 className="mb-8">More Customer Stories</H2>
            </div>
            <div
              className={classNames(
                WIDE_CLASSES,
                "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {relatedStories.map((relatedStory) => (
                <Link
                  key={relatedStory.id}
                  href={`/customers/${relatedStory.slug}`}
                  className={classNames(
                    "flex h-full flex-col overflow-hidden rounded-xl bg-muted-background",
                    "group transition duration-300 ease-out",
                    "hover:bg-primary-100"
                  )}
                >
                  <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-gray-100">
                    {relatedStory.heroImage ? (
                      <Image
                        src={relatedStory.heroImage.url}
                        alt={relatedStory.heroImage.alt}
                        fill
                        className="object-cover brightness-100 transition duration-300 ease-out group-hover:brightness-110"
                      />
                    ) : relatedStory.companyLogo ? (
                      <div className="flex h-full w-full items-center justify-center bg-white p-8">
                        <Image
                          src={relatedStory.companyLogo.url}
                          alt={relatedStory.companyLogo.alt}
                          width={120}
                          height={60}
                          className="max-h-12 w-auto object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary-100">
                        <span className="text-2xl font-bold text-primary-400">
                          {relatedStory.companyName.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <span className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {relatedStory.companyName}
                    </span>
                    <H5 className="line-clamp-2 text-foreground" mono>
                      {relatedStory.title}
                    </H5>
                    {relatedStory.headlineMetric && (
                      <span className="mt-2 inline-block self-start rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                        {relatedStory.headlineMetric}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Grid>
        </section>
      )}
    </>
  );
}

CustomerStoryPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
