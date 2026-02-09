import { Markdown } from "@dust-tt/sparkle";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";

import { AcademyQuiz } from "@app/components/academy/AcademyQuiz";
import {
  AcademySidebar,
  MobileMenuButton,
} from "@app/components/academy/AcademySidebar";
import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { hasAcademyAccess } from "@app/lib/api/academy";
import {
  buildPreviewQueryString,
  getLessonBySlug,
  getSearchableItems,
} from "@app/lib/contentful/client";
import {
  renderRichTextFromContentful,
  richTextToMarkdown,
} from "@app/lib/contentful/richTextRenderer";
import { extractTableOfContents } from "@app/lib/contentful/tableOfContents";
import type {
  ContentSummary,
  LessonPageProps,
} from "@app/lib/contentful/types";
import { isCourseSummary } from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export const getServerSideProps: GetServerSideProps<LessonPageProps> = async (
  context
) => {
  const hasAccess = await hasAcademyAccess(context.req, context.res);
  if (!hasAccess) {
    return { notFound: true };
  }

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

  const searchableResult = await getSearchableItems(resolvedUrl);

  return {
    props: {
      lesson,
      searchableItems: searchableResult.isOk() ? searchableResult.value : [],
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      preview: context.preview ?? false,
    },
  };
};

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

function getContentUrl(content: ContentSummary): string {
  if (isCourseSummary(content)) {
    return `/academy/${content.slug}`;
  }
  return `/academy/lessons/${content.slug}`;
}

function getContentTypeLabel(content: ContentSummary): string {
  if (isCourseSummary(content)) {
    return "Course";
  }
  return "Lesson";
}

export default function LessonPage({
  lesson,
  searchableItems,
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

      <div className="flex min-h-screen">
        <AcademySidebar searchableItems={searchableItems} tocItems={tocItems} />
        <article className="min-w-0 flex-1">
          {/* Mobile menu button - full width on mobile */}
          <div className="-mx-6 sticky top-16 z-40 flex items-center border-b border-gray-200 bg-white/95 px-6 py-2 backdrop-blur-sm lg:hidden">
            <MobileMenuButton
              searchableItems={searchableItems}
              tocItems={tocItems}
            />
            <span className="ml-2 truncate text-sm font-medium text-muted-foreground">
              {lesson.title}
            </span>
          </div>
          <Grid>
            <div className={classNames(WIDE_CLASSES, "pb-2 pt-6")}>
              {lesson.parentCourse ? (
                <Link
                  href={`/academy/${lesson.parentCourse.slug}`}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>&larr;</span> Back to {lesson.parentCourse.title}
                </Link>
              ) : (
                <Link
                  href="/academy"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>&larr;</span> Back to Academy
                </Link>
              )}
            </div>

            <header className={WIDE_CLASSES}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <H1 className="text-4xl md:text-5xl">{lesson.title}</H1>
                  {(lesson.category ?? lesson.tools.length > 0) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {lesson.category && (
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                          {lesson.category}
                        </span>
                      )}
                      {lesson.tools.map((tool) => (
                        <span
                          key={tool}
                          className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {lesson.estimatedDurationMinutes && (
                    <div className="flex items-center gap-1 rounded-full bg-highlight/10 px-3 py-1.5 text-xs font-medium text-gray-700">
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      <span>{lesson.estimatedDurationMinutes} min</span>
                    </div>
                  )}
                  {lesson.complexity && (
                    <div className="rounded-full bg-highlight/10 px-3 py-1.5 text-xs font-medium text-gray-700">
                      {lesson.complexity}
                    </div>
                  )}
                </div>
              </div>
            </header>

            {lesson.lessonObjectives && (
              <div className={classNames(WIDE_CLASSES, "mt-4")}>
                <div className="rounded-2xl border border-highlight/20 bg-highlight/5 p-4 backdrop-blur-sm">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-highlight">
                    Lesson Objectives
                  </h3>
                  <Markdown content={lesson.lessonObjectives} />
                </div>
              </div>
            )}

            {lesson.preRequisites && (
              <div className={classNames(WIDE_CLASSES, "mt-3")}>
                <div className="rounded-2xl border border-amber-200/50 bg-amber-50/80 p-4 backdrop-blur-sm">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
                    Prerequisites
                  </h3>
                  <div className="prose-amber">
                    {renderRichTextFromContentful(lesson.preRequisites)}
                  </div>
                </div>
              </div>
            )}

            <div className={classNames(WIDE_CLASSES, "mt-4")}>
              {renderRichTextFromContentful(lesson.lessonContent)}
            </div>

            <div className={WIDE_CLASSES}>
              <AcademyQuiz
                contentType="lesson"
                title={lesson.title}
                content={richTextToMarkdown(lesson.lessonContent)}
              />
            </div>

            {(lesson.previousContent ?? lesson.nextContent) && (
              <div
                className={classNames(
                  WIDE_CLASSES,
                  "mt-12 border-t border-gray-200 pt-8"
                )}
              >
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
      </div>
    </>
  );
}

LessonPage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
