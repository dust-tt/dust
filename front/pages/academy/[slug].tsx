// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { AcademyQuiz } from "@app/components/academy/AcademyQuiz";
import {
  AcademySidebar,
  MobileMenuButton,
} from "@app/components/academy/AcademySidebar";
import {
  ChapterMobileMenuButton,
  ChapterSidebar,
} from "@app/components/academy/ChapterSidebar";
import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getAcademyUser } from "@app/lib/api/academy";
import {
  buildPreviewQueryString,
  getChaptersByCourseSlug,
  getCourseBySlug,
  getSearchableItems,
} from "@app/lib/contentful/client";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import {
  renderRichTextFromContentful,
  richTextToMarkdown,
} from "@app/lib/contentful/richTextRenderer";
import { extractTableOfContents } from "@app/lib/contentful/tableOfContents";
import type { CoursePageProps } from "@app/lib/contentful/types";
import {
  useAcademyBrowserId,
  useAcademyCourseProgress,
} from "@app/lib/swr/academy";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  cn,
  Markdown,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

export const getServerSideProps: GetServerSideProps<CoursePageProps> = async (
  context
) => {
  const user = await getAcademyUser(context.req, context.res);

  const { slug } = context.params ?? {};

  if (!isString(slug)) {
    return { notFound: true };
  }

  const resolvedUrl = buildPreviewQueryString(context.preview ?? false);

  const [courseResult, chaptersResult, searchableResult] = await Promise.all([
    getCourseBySlug(slug, resolvedUrl),
    getChaptersByCourseSlug(slug, resolvedUrl),
    getSearchableItems(resolvedUrl),
  ]);

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

  const chapters = chaptersResult.isOk() ? chaptersResult.value : [];

  return {
    props: {
      course,
      courses: [],
      chapters,
      searchableItems: searchableResult.isOk() ? searchableResult.value : [],
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      academyUser: user ? { firstName: user.firstName, sId: user.sId } : null,
      fullWidth: true,
      preview: context.preview ?? false,
    },
  };
};

const WIDE_CLASSES = cn("col-span-12", "lg:col-span-10 lg:col-start-2");

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function CoursePage({
  course,
  chapters,
  searchableItems,
  academyUser,
  preview,
}: CoursePageProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const ogImageUrl = course.image?.url ?? "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/academy/${course.slug}`;
  const tocItems = extractTableOfContents(course.courseContent);
  const hasChapters = chapters.length > 0;
  const browserId = useAcademyBrowserId();
  const anonBrowserId = academyUser ? undefined : browserId;
  const { courseProgress } = useAcademyCourseProgress({
    disabled: (!academyUser && !browserId) || !hasChapters,
    browserId: anonBrowserId,
  });
  const completedChapterSlugs =
    courseProgress?.[course.slug]?.completedChapterSlugs;

  const handleCopyAsMarkdown = () => {
    const markdown = richTextToMarkdown(course.courseContent);
    const fullContent = `# ${course.title}\n\n${markdown}`;
    void copyToClipboard(fullContent);
  };

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

      <div className="flex min-h-screen">
        {hasChapters ? (
          <ChapterSidebar
            searchableItems={searchableItems}
            courseSlug={course.slug}
            courseTitle={course.title}
            chapters={chapters}
            completedChapterSlugs={completedChapterSlugs}
          />
        ) : (
          <AcademySidebar
            searchableItems={searchableItems}
            tocItems={tocItems}
          />
        )}
        <article className="min-w-0 flex-1">
          {/* Mobile menu button - full width on mobile */}
          <div className="-mx-6 sticky top-16 z-40 flex items-center border-b border-gray-200 bg-white/95 px-6 py-2 backdrop-blur-sm lg:hidden">
            {hasChapters ? (
              <ChapterMobileMenuButton
                searchableItems={searchableItems}
                courseSlug={course.slug}
                courseTitle={course.title}
                chapters={chapters}
                completedChapterSlugs={completedChapterSlugs}
              />
            ) : (
              <MobileMenuButton
                searchableItems={searchableItems}
                tocItems={tocItems}
              />
            )}
            <span className="ml-2 truncate text-sm font-medium text-muted-foreground">
              {course.title}
            </span>
          </div>
          {/* Hero section with background image - full width on mobile */}
          <div className="-mx-6 relative overflow-hidden lg:mx-0 lg:rounded-t-2xl">
            {course.image && (
              <>
                <Image
                  src={course.image.url}
                  alt={course.image.alt}
                  fill
                  loader={contentfulImageLoader}
                  className="object-cover"
                  sizes="100vw"
                  priority
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-50% to-white" />
              </>
            )}
            <Grid className="relative px-6 lg:px-0">
              <header className={cn(WIDE_CLASSES, "pt-6")}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <H1 className="text-4xl md:text-5xl">{course.title}</H1>
                    {hasChapters && course.description && (
                      <p className="mt-3 text-lg text-muted-foreground">
                        {course.description}
                      </p>
                    )}
                    {!hasChapters && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="xs"
                          icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                          label={isCopied ? "Copied!" : "Copy as Markdown"}
                          onClick={handleCopyAsMarkdown}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {course.estimatedDurationMinutes && (
                      <div className="flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur-sm">
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
                        <span>{course.estimatedDurationMinutes} min</span>
                      </div>
                    )}
                    {course.author && (
                      <div className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur-sm">
                        {course.author.image ? (
                          <Image
                            src={course.author.image.url}
                            alt={course.author.name}
                            width={18}
                            height={18}
                            loader={contentfulImageLoader}
                            sizes="18px"
                            className="rounded-full"
                          />
                        ) : (
                          <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gray-300 text-[10px] font-semibold text-gray-600">
                            {course.author.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{course.author.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {course.tableOfContents && (
                <div className={cn(WIDE_CLASSES, "mt-4")}>
                  <div className="rounded-2xl border border-highlight/20 bg-highlight/5 p-4 backdrop-blur-sm">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-highlight">
                      Course Objectives
                    </h3>
                    <Markdown content={course.tableOfContents} />
                  </div>
                </div>
              )}

              {course.preRequisites && (
                <div className={cn(WIDE_CLASSES, "mt-3 pb-6")}>
                  <div className="rounded-2xl border border-amber-200/50 bg-amber-50/80 p-4 backdrop-blur-sm">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
                      Prerequisites
                    </h3>
                    <div className="prose-amber">
                      {renderRichTextFromContentful(course.preRequisites)}
                    </div>
                  </div>
                </div>
              )}
            </Grid>
          </div>

          <Grid>
            {hasChapters ? (
              <div className={cn(WIDE_CLASSES, "mt-6")}>
                {course.courseContent.content.length > 0 && (
                  <div className="mb-8">
                    {renderRichTextFromContentful(course.courseContent)}
                  </div>
                )}
                <h2 className="mb-4 text-2xl font-semibold text-foreground">
                  Chapters
                </h2>
                <div className="space-y-3">
                  {chapters.map((chapter, index) => {
                    const isChapterCompleted =
                      completedChapterSlugs?.includes(chapter.slug) ?? false;

                    return (
                      <Link
                        key={chapter.id}
                        href={`/academy/${course.slug}/chapter/${chapter.slug}`}
                        className="group flex items-start gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                            isChapterCompleted
                              ? "bg-green-100 text-green-600"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {isChapterCompleted ? (
                            <svg
                              className="h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-foreground transition-colors group-hover:text-highlight">
                            {chapter.title}
                          </h3>
                          {chapter.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {chapter.description}
                            </p>
                          )}
                          {chapter.tocItems.length > 0 &&
                            (() => {
                              const minLevel = Math.min(
                                ...chapter.tocItems.map((i) => i.level)
                              );
                              return (
                                <ul className="mt-2 space-y-0.5">
                                  {chapter.tocItems
                                    .filter((item) => item.level === minLevel)
                                    .map((item) => (
                                      <li
                                        key={item.id}
                                        className="text-xs text-muted-foreground"
                                      >
                                        {item.text}
                                      </li>
                                    ))}
                                </ul>
                              );
                            })()}
                        </div>
                        {chapter.estimatedDurationMinutes && (
                          <div className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
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
                            <span>{chapter.estimatedDurationMinutes} min</span>
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className={cn(WIDE_CLASSES, "mt-6")}>
                  {renderRichTextFromContentful(course.courseContent)}
                </div>

                <div className={WIDE_CLASSES}>
                  <AcademyQuiz
                    contentType="course"
                    title={course.title}
                    content={richTextToMarkdown(course.courseContent)}
                    userName={academyUser?.firstName}
                    contentSlug={course.slug}
                    browserId={anonBrowserId}
                  />
                </div>
              </>
            )}
            {(course.previousCourse ?? course.nextCourse) && (
              <div
                className={cn(
                  WIDE_CLASSES,
                  "mt-12 border-t border-gray-200 pt-8"
                )}
              >
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
      </div>
    </>
  );
}

CoursePage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
