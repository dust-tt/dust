import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";

import { TableOfContents } from "@app/components/blog/TableOfContents";
import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  buildPreviewQueryString,
  CONTENTFUL_REVALIDATE_SECONDS,
  getLessonBySlug,
} from "@app/lib/contentful/client";
import { renderRichTextFromContentful } from "@app/lib/contentful/richTextRenderer";
import { extractTableOfContents } from "@app/lib/contentful/tableOfContents";
import type { ContentSummary, LessonPageProps } from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export const getStaticPaths: GetStaticPaths = async () => {
  // Don't pre-generate any paths at build time to minimize Contentful API calls.
  // Pages are generated on-demand via fallback: "blocking" and cached with ISR.
  return {
    paths: [],
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<LessonPageProps> = async (
  context
) => {
  const { slug } = context.params ?? {};

  if (!isString(slug)) {
    return { notFound: true };
  }

  const resolvedUrl = buildPreviewQueryString(context.preview ?? false);

  const lessonResult = await getLessonBySlug(slug, resolvedUrl);

  if (lessonResult.isErr()) {
    logger.error(
      { slug, error: lessonResult.error },
      `Error fetching lesson "${slug}"`
    );
    return { notFound: true };
  }

  const lesson = lessonResult.value;

  if (!lesson) {
    return { notFound: true };
  }

  return {
    props: {
      lesson,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      preview: context.preview ?? false,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

function getContentUrl(content: ContentSummary): string {
  // Check if it's a lesson by checking if it has the image field
  // (courses have image, lessons don't in the summary)
  if ("image" in content) {
    return `/academy/${content.slug}`;
  }
  return `/academy/lessons/${content.slug}`;
}

function getContentTypeLabel(content: ContentSummary): string {
  // Check if it's a course by checking if it has the image field
  if ("image" in content) {
    return "Course";
  }
  return "Lesson";
}

export default function LessonPage({
  lesson,
  preview,
}: LessonPageProps) {
  const canonicalUrl = `https://dust.tt/academy/lessons/${lesson.slug}`;
  const tocItems = extractTableOfContents(lesson.lessonContent);

  return (
    <>
      {preview && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-amber-100 px-4 py-2 text-center text-amber-800">
          Preview Mode - This is a draft
        </div>
      )}
      <Head>
        <title>{lesson.title} | Dust Academy</title>
        {preview && <meta name="robots" content="noindex, nofollow" />}
        {lesson.description && (
          <meta name="description" content={lesson.description} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:title" content={lesson.title} />
        {lesson.description && (
          <meta property="og:description" content={lesson.description} />
        )}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Dust" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={lesson.title} />
        {lesson.description && (
          <meta name="twitter:description" content={lesson.description} />
        )}
      </Head>

      <article>
        <Grid>
          <div className={classNames(WIDE_CLASSES, "pb-2 pt-6")}>
            <Link
              href="/academy"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>&larr;</span> Back to Academy
            </Link>
          </div>

          <header className={WIDE_CLASSES}>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {lesson.courseId && (
                <span>Lesson {lesson.courseId}</span>
              )}
              {lesson.estimatedDurationMinutes && (
                <>
                  {lesson.courseId && <span>•</span>}
                  <span>{lesson.estimatedDurationMinutes} min</span>
                </>
              )}
            </div>

            <H1 className="text-4xl md:text-5xl">{lesson.title}</H1>
          </header>

          {lesson.lessonObjectives && (
            <div className={classNames(WIDE_CLASSES, "mt-6")}>
              <H2 className="mb-4">Lesson Objectives</H2>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                <P className="whitespace-pre-line text-muted-foreground">
                  {lesson.lessonObjectives}
                </P>
              </div>
            </div>
          )}

          {lesson.preRequisites && (
            <div className={classNames(WIDE_CLASSES, "mt-6")}>
              <H2 className="mb-4">Prerequisites</H2>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                {renderRichTextFromContentful(lesson.preRequisites)}
              </div>
            </div>
          )}

          <div className={classNames(WIDE_CLASSES, "mt-4")}>
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-9">
                {renderRichTextFromContentful(lesson.lessonContent)}
              </div>
              {tocItems.length > 0 && (
                <div className="hidden lg:col-span-3 lg:block">
                  <TableOfContents items={tocItems} />
                </div>
              )}
            </div>
          </div>

          {(lesson.previousContent || lesson.nextContent) && (
            <div className={classNames(WIDE_CLASSES, "mt-12 border-t border-gray-200 pt-8")}>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                {lesson.previousContent && (
                  <Link
                    href={getContentUrl(lesson.previousContent)}
                    className="group flex flex-col"
                  >
                    <P size="sm" className="text-muted-foreground">
                      Previous {getContentTypeLabel(lesson.previousContent)}
                    </P>
                    <span className="mt-1 text-base font-medium text-foreground transition-colors group-hover:text-highlight">
                      &larr; {lesson.previousContent.title}
                    </span>
                  </Link>
                )}
                {lesson.nextContent && (
                  <Link
                    href={getContentUrl(lesson.nextContent)}
                    className="group flex flex-col items-end sm:items-start"
                  >
                    <P size="sm" className="text-muted-foreground">
                      Next {getContentTypeLabel(lesson.nextContent)}
                    </P>
                    <span className="mt-1 text-base font-medium text-foreground transition-colors group-hover:text-highlight">
                      {lesson.nextContent.title} &rarr;
                    </span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </Grid>
      </article>
    </>
  );
}

LessonPage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

