// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import {
  ACADEMY_PAGE_SIZE,
  AcademyHeader,
  AcademyLayout,
  AcademySearch,
  ContinueLearningCard,
  CourseGrid,
} from "@app/components/academy/AcademyComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { Pagination } from "@app/components/shared/Pagination";
import { getAcademyUser } from "@app/lib/api/academy";
import { getAllCourses, getSearchableItems } from "@app/lib/contentful/client";
import type { CourseListingPageProps } from "@app/lib/contentful/types";
import {
  useAcademyBackfill,
  useAcademyBrowserId,
  useAcademyCourseProgress,
} from "@app/lib/swr/academy";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo } from "react";

export const getServerSideProps: GetServerSideProps<
  CourseListingPageProps
> = async (context) => {
  const user = await getAcademyUser(context.req, context.res);

  const [coursesResult, searchableResult] = await Promise.all([
    getAllCourses(),
    getSearchableItems(),
  ]);

  if (coursesResult.isErr()) {
    logger.error(
      { error: coursesResult.error },
      "Error fetching courses from Contentful"
    );
    return {
      props: {
        courses: [],
        searchableItems: [],
        gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
        academyUser: user ? { firstName: user.firstName, sId: user.sId } : null,
      },
    };
  }

  return {
    props: {
      courses: coursesResult.value,
      searchableItems: searchableResult.isOk() ? searchableResult.value : [],
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      academyUser: user ? { firstName: user.firstName, sId: user.sId } : null,
    },
  };
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function AcademyListing({
  courses,
  searchableItems,
  academyUser,
}: CourseListingPageProps) {
  const router = useRouter();
  const browserId = useAcademyBrowserId();
  // Only use browserId for anonymous users; logged-in users rely on cookies.
  const anonBrowserId = academyUser ? undefined : browserId;
  const { courseProgress, mutateCourseProgress } = useAcademyCourseProgress({
    disabled: !academyUser && !browserId,
    browserId: anonBrowserId,
  });
  useAcademyBackfill({
    academyUser: academyUser ?? null,
    browserId,
    mutateCourseProgress,
  });

  const page = useMemo(() => {
    const queryPage = isString(router.query.page)
      ? router.query.page
      : undefined;
    const parsed = parseInt(queryPage ?? "1", 10);
    return parsed > 0 ? parsed : 1;
  }, [router.query.page]);

  const totalPages = Math.max(1, Math.ceil(courses.length / ACADEMY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * ACADEMY_PAGE_SIZE;
  const endIndex = startIndex + ACADEMY_PAGE_SIZE;
  const paginatedCourses = courses.slice(startIndex, endIndex);

  return (
    <>
      <Head>
        <title>Dust Academy</title>
        <meta
          name="description"
          content="Master AI agents with Dust through hands-on courses and interactive lessons"
        />
        <meta property="og:title" content="Dust Academy" />
        <meta
          property="og:description"
          content="Master AI agents with Dust through hands-on courses and interactive lessons"
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://dust.tt/academy" />
        <meta property="og:image" content="/static/og_image.png" />
        <link rel="canonical" href="https://dust.tt/academy" />
        {totalPages > 1 && (
          <link rel="next" href="https://dust.tt/academy/page/2" />
        )}
      </Head>

      <AcademyLayout>
        <div className="col-span-12 flex flex-col gap-4 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <AcademyHeader />
          </div>
          <div className="mb-4 w-full sm:mb-0 sm:w-72">
            <AcademySearch searchableItems={searchableItems} />
          </div>
        </div>

        {courseProgress && (
          <ContinueLearningCard
            courses={courses}
            courseProgress={courseProgress}
          />
        )}

        <CourseGrid
          courses={paginatedCourses}
          emptyMessage="No courses available yet. Check back soon!"
          courseProgress={courseProgress}
        />

        {courses.length > ACADEMY_PAGE_SIZE && (
          <div className="col-span-12 mt-12 flex items-center justify-center pb-12">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              rowCount={courses.length}
              pageSize={ACADEMY_PAGE_SIZE}
              buildPageUrl={(p) =>
                p === 1 ? "/academy" : `/academy/page/${p}`
              }
            />
          </div>
        )}
      </AcademyLayout>
    </>
  );
}

AcademyListing.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
