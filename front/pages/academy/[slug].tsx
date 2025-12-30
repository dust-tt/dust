import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { TableOfContents } from "@app/components/blog/TableOfContents";
import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  buildPreviewQueryString,
  CONTENTFUL_REVALIDATE_SECONDS,
  getCourseBySlug,
} from "@app/lib/contentful/client";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import { renderRichTextFromContentful } from "@app/lib/contentful/richTextRenderer";
import { extractTableOfContents } from "@app/lib/contentful/tableOfContents";
import type { CoursePageProps } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
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

export const getStaticProps: GetStaticProps<CoursePageProps> = async (
  context
) => {
  const { slug } = context.params ?? {};

  if (!isString(slug)) {
    return { notFound: true };
  }

  const resolvedUrl = buildPreviewQueryString(context.preview ?? false);

  const courseResult = await getCourseBySlug(slug, resolvedUrl);

  if (courseResult.isErr()) {
    logger.error(
      { slug, error: courseResult.error },
      `Error fetching course "${slug}"`
    );
    return { notFound: true };
  }

  const course = courseResult.value;

  if (!course) {
    return { notFound: true };
  }

  return {
    props: {
      course,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      preview: context.preview ?? false,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

export default function CoursePage({
  course,
  preview,
}: CoursePageProps) {
  const ogImageUrl = course.image?.url ?? "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/academy/${course.slug}`;
  const tocItems = extractTableOfContents(course.courseContent);

  return (
    <>
      {preview && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-amber-100 px-4 py-2 text-center text-amber-800">
          Preview Mode - This is a draft
        </div>
      )}
      <Head>
        <title>{course.title} | Dust Academy</title>
        {preview && <meta name="robots" content="noindex, nofollow" />}
        {course.description && (
          <meta name="description" content={course.description} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:title" content={course.title} />
        {course.description && (
          <meta property="og:description" content={course.description} />
        )}
        <meta property="og:type" content="article" />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Dust" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={course.title} />
        {course.description && (
          <meta name="twitter:description" content={course.description} />
        )}
        <meta name="twitter:image" content={ogImageUrl} />
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
              {course.courseId && (
                <span>Course {course.courseId}</span>
              )}
              {course.estimatedDurationMinutes && (
                <>
                  {course.courseId && <span>•</span>}
                  <span>{course.estimatedDurationMinutes} min</span>
                </>
              )}
            </div>

            <H1 className="text-4xl md:text-5xl">{course.title}</H1>

            {(course.author || course.dateOfAddition) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {course.author && (
                  <>
                    <div className="flex items-center gap-2">
                      {course.author.image ? (
                        <Image
                          src={course.author.image.url}
                          alt={course.author.name}
                          width={24}
                          height={24}
                          loader={contentfulImageLoader}
                          sizes="24px"
                          className="rounded-full"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                          {course.author.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{course.author.name}</span>
                    </div>
                    {course.dateOfAddition && <span>-</span>}
                  </>
                )}
                {course.dateOfAddition && (
                  <span>
                    {formatTimestampToFriendlyDate(
                      new Date(course.dateOfAddition).getTime(),
                      "short"
                    )}
                  </span>
                )}
              </div>
            )}
          </header>

          {course.image && (
            <div className={classNames(WIDE_CLASSES, "mt-2")}>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <Image
                  src={course.image.url}
                  alt={course.image.alt}
                  width={course.image.width}
                  height={course.image.height}
                  loader={contentfulImageLoader}
                  className="h-full w-full object-cover"
                  sizes="(min-width: 1536px) 1280px, (min-width: 1280px) 1067px, (min-width: 1024px) 853px, 100vw"
                  priority
                />
              </div>
            </div>
          )}

          {course.tableOfContents && (
            <div className={classNames(WIDE_CLASSES, "mt-6")}>
              <H2 className="mb-4">Course Objectives</H2>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                <P className="whitespace-pre-line text-muted-foreground">
                  {course.tableOfContents}
                </P>
              </div>
            </div>
          )}

          {course.preRequisites && (
            <div className={classNames(WIDE_CLASSES, "mt-6")}>
              <H2 className="mb-4">Prerequisites</H2>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                {renderRichTextFromContentful(course.preRequisites)}
              </div>
            </div>
          )}

          <div className={classNames(WIDE_CLASSES, "mt-4")}>
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-9">
                {renderRichTextFromContentful(course.courseContent)}
              </div>
              {tocItems.length > 0 && (
                <div className="hidden lg:col-span-3 lg:block">
                  <TableOfContents items={tocItems} />
                </div>
              )}
            </div>
          </div>

          {(course.previousCourse || course.nextCourse) && (
            <div className={classNames(WIDE_CLASSES, "mt-12 border-t border-gray-200 pt-8")}>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                {course.previousCourse && (
                  <Link
                    href={`/academy/${course.previousCourse.slug}`}
                    className="group flex flex-col"
                  >
                    <P size="sm" className="text-muted-foreground">
                      Previous Course
                    </P>
                    <span className="mt-1 text-base font-medium text-foreground transition-colors group-hover:text-highlight">
                      &larr; {course.previousCourse.title}
                    </span>
                  </Link>
                )}
                {course.nextCourse && (
                  <Link
                    href={`/academy/${course.nextCourse.slug}`}
                    className="group flex flex-col items-end sm:items-start"
                  >
                    <P size="sm" className="text-muted-foreground">
                      Next Course
                    </P>
                    <span className="mt-1 text-base font-medium text-foreground transition-colors group-hover:text-highlight">
                      {course.nextCourse.title} &rarr;
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

CoursePage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

