import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { AcademyQuiz } from "@app/components/academy/AcademyQuiz";
import {
  ChapterMobileMenuButton,
  ChapterSidebar,
} from "@app/components/academy/ChapterSidebar";
import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getAcademyAccessAndUser } from "@app/lib/api/academy";
import {
  buildPreviewQueryString,
  getChapterBySlug,
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
import type { ChapterPageProps } from "@app/lib/contentful/types";
import { clientFetch } from "@app/lib/egress/client";
import { AcademyChapterVisitResource } from "@app/lib/resources/academy_chapter_visit_resource";
import {
  useAcademyBrowserId,
  useAcademyCourseProgress,
} from "@app/lib/swr/academy";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";

export const getServerSideProps: GetServerSideProps<ChapterPageProps> = async (
  context
) => {
  const { user: academyUser } = await getAcademyAccessAndUser(
    context.req,
    context.res
  );

  const { slug, chapterSlug } = context.params ?? {};

  if (!isString(slug) || !isString(chapterSlug)) {
    return { notFound: true };
  }

  const resolvedUrl = buildPreviewQueryString(context.preview ?? false);

  const [courseResult, chapterResult, chaptersResult, searchableResult] =
    await Promise.all([
      getCourseBySlug(slug, resolvedUrl),
      getChapterBySlug(chapterSlug, resolvedUrl),
      getChaptersByCourseSlug(slug, resolvedUrl),
      getSearchableItems(resolvedUrl),
    ]);

  if (courseResult.isErr() || !courseResult.value) {
    logger.error(
      { slug, error: courseResult.isErr() ? courseResult.error : null },
      `Error fetching course "${slug}" for chapter page`
    );
    return { notFound: true };
  }

  if (chapterResult.isErr() || !chapterResult.value) {
    logger.error(
      {
        chapterSlug,
        error: chapterResult.isErr() ? chapterResult.error : null,
      },
      `Error fetching chapter "${chapterSlug}"`
    );
    return { notFound: true };
  }

  const chapter = chapterResult.value;
  const course = courseResult.value;
  const chapters = chaptersResult.isOk() ? chaptersResult.value : [];

  // Validate that the chapter belongs to this course
  if (!chapters.some((c) => c.slug === chapter.slug)) {
    return { notFound: true };
  }

  // Record chapter visit server-side for logged-in users.
  if (academyUser) {
    await AcademyChapterVisitResource.recordVisit(
      { userId: academyUser.id },
      slug,
      chapterSlug
    );
  }

  return {
    props: {
      chapter,
      chapters,
      courseSlug: slug,
      courseTitle: course.title,
      courseImage: course.image,
      courseAuthor: course.author,
      searchableItems: searchableResult.isOk() ? searchableResult.value : [],
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      academyUser: academyUser
        ? { firstName: academyUser.firstName, sId: academyUser.sId }
        : null,
      fullWidth: true,
      preview: context.preview ?? false,
    },
  };
};

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

export default function ChapterPage({
  chapter,
  chapters,
  courseSlug,
  courseTitle,
  courseImage,
  courseAuthor,
  searchableItems,
  academyUser,
  preview,
}: ChapterPageProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const ogImageUrl = courseImage?.url ?? "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/academy/${courseSlug}/chapter/${chapter.slug}`;
  const tocItems = extractTableOfContents(chapter.chapterContent);
  const browserId = useAcademyBrowserId();

  const { courseProgress, mutateCourseProgress } = useAcademyCourseProgress({
    disabled: !academyUser && !browserId,
    browserId,
  });

  // For logged-in users, the visit was recorded server-side. Force SWR refetch.
  // For anonymous users, record the visit client-side via the API.
  useEffect(() => {
    if (academyUser) {
      void mutateCourseProgress();
    } else if (browserId) {
      void (async () => {
        await clientFetch("/api/academy/progress/visit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Academy-Browser-Id": browserId,
          },
          body: JSON.stringify({ courseSlug, chapterSlug: chapter.slug }),
        });
        void mutateCourseProgress();
      })();
    }
  }, [courseSlug, chapter.slug, academyUser, browserId, mutateCourseProgress]);
  const completedChapterSlugs =
    courseProgress?.[courseSlug]?.completedChapterSlugs;
  const attemptedChapterSlugs =
    courseProgress?.[courseSlug]?.attemptedChapterSlugs;

  const currentIndex = chapters.findIndex((c) => c.slug === chapter.slug);
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const handleCopyAsMarkdown = () => {
    const markdown = richTextToMarkdown(chapter.chapterContent);
    const fullContent = `# ${chapter.title}\n\n${markdown}`;
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
        <title>
          {chapter.title} | {courseTitle} | Dust Academy
        </title>
        {preview && <meta name="robots" content="noindex, nofollow" />}
        {chapter.description && (
          <meta name="description" content={chapter.description} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:title" content={chapter.title} />
        {chapter.description && (
          <meta property="og:description" content={chapter.description} />
        )}
        <meta property="og:type" content="article" />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Dust" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={chapter.title} />
        {chapter.description && (
          <meta name="twitter:description" content={chapter.description} />
        )}
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <div className="flex min-h-screen">
        <ChapterSidebar
          searchableItems={searchableItems}
          courseSlug={courseSlug}
          courseTitle={courseTitle}
          chapters={chapters}
          activeChapterSlug={chapter.slug}
          tocItems={tocItems}
          completedChapterSlugs={completedChapterSlugs}
          attemptedChapterSlugs={attemptedChapterSlugs}
        />
        <article className="min-w-0 flex-1">
          {/* Mobile menu button */}
          <div className="-mx-6 sticky top-16 z-40 flex items-center border-b border-gray-200 bg-white/95 px-6 py-2 backdrop-blur-sm lg:hidden">
            <ChapterMobileMenuButton
              searchableItems={searchableItems}
              courseSlug={courseSlug}
              courseTitle={courseTitle}
              chapters={chapters}
              activeChapterSlug={chapter.slug}
              tocItems={tocItems}
              completedChapterSlugs={completedChapterSlugs}
              attemptedChapterSlugs={attemptedChapterSlugs}
            />
            <span className="ml-2 truncate text-sm font-medium text-muted-foreground">
              {chapter.title}
            </span>
          </div>

          {/* Hero section with course background image */}
          <div className="-mx-6 relative overflow-hidden lg:mx-0 lg:rounded-t-2xl">
            {courseImage && (
              <>
                <Image
                  src={courseImage.url}
                  alt={courseImage.alt}
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
              <header className={classNames(WIDE_CLASSES, "pt-6 pb-6")}>
                <div className="mb-4">
                  <Link
                    href={`/academy/${courseSlug}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {courseTitle}
                  </Link>
                  <span className="mx-2 text-sm text-muted-foreground">/</span>
                  <span className="text-sm text-foreground">
                    {chapter.title}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <H1 className="text-4xl md:text-5xl">{chapter.title}</H1>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="xs"
                        icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                        label={isCopied ? "Copied!" : "Copy as Markdown"}
                        onClick={handleCopyAsMarkdown}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {chapter.estimatedDurationMinutes && (
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
                        <span>{chapter.estimatedDurationMinutes} min</span>
                      </div>
                    )}
                    {courseAuthor && (
                      <div className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur-sm">
                        {courseAuthor.image ? (
                          <Image
                            src={courseAuthor.image.url}
                            alt={courseAuthor.name}
                            width={18}
                            height={18}
                            loader={contentfulImageLoader}
                            sizes="18px"
                            className="rounded-full"
                          />
                        ) : (
                          <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gray-300 text-[10px] font-semibold text-gray-600">
                            {courseAuthor.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{courseAuthor.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </header>
            </Grid>
          </div>

          <Grid>
            <div className={classNames(WIDE_CLASSES, "mt-6")}>
              {renderRichTextFromContentful(chapter.chapterContent)}
            </div>

            <div className={WIDE_CLASSES}>
              <AcademyQuiz
                contentType="chapter"
                title={chapter.title}
                content={richTextToMarkdown(chapter.chapterContent)}
                userName={academyUser?.firstName}
                contentSlug={chapter.slug}
                courseSlug={courseSlug}
                browserId={browserId}
              />
            </div>

            {(previousChapter ?? nextChapter) && (
              <div
                className={classNames(
                  WIDE_CLASSES,
                  "mt-12 border-t border-gray-200 pt-8"
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                  {previousChapter && (
                    <Link
                      href={`/academy/${courseSlug}/chapter/${previousChapter.slug}`}
                      className="group flex flex-col"
                    >
                      <P size="sm" className="text-muted-foreground">
                        Previous Chapter
                      </P>
                      <span className="mt-1 text-base font-medium text-foreground transition-colors group-hover:text-highlight">
                        &larr; {previousChapter.title}
                      </span>
                    </Link>
                  )}
                  {nextChapter && (
                    <Link
                      href={`/academy/${courseSlug}/chapter/${nextChapter.slug}`}
                      className="group flex flex-col items-end sm:items-start"
                    >
                      <P size="sm" className="text-muted-foreground">
                        Next Chapter
                      </P>
                      <span className="mt-1 text-base font-medium text-foreground transition-colors group-hover:text-highlight">
                        {nextChapter.title} &rarr;
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

ChapterPage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
