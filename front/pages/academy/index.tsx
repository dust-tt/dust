import type { GetStaticProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo } from "react";

import {
  ACADEMY_PAGE_SIZE,
  AcademyHeader,
  AcademyLayout,
  CourseGrid,
} from "@app/components/academy/AcademyComponents";
import { AcademyPagination } from "@app/components/academy/AcademyPagination";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllCourses,
} from "@app/lib/contentful/client";
import type { CourseListingPageProps } from "@app/lib/contentful/types";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export const getStaticProps: GetStaticProps<
  CourseListingPageProps
> = async () => {
  const coursesResult = await getAllCourses();

  if (coursesResult.isErr()) {
    logger.error(
      { error: coursesResult.error },
      "Error fetching courses from Contentful"
    );
    return {
      props: {
        courses: [],
        gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      },
      revalidate: CONTENTFUL_REVALIDATE_SECONDS,
    };
  }

  return {
    props: {
      courses: coursesResult.value,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

export default function AcademyListing({ courses }: CourseListingPageProps) {
  const router = useRouter();
  const initialPage = useMemo(() => {
    const queryPage = isString(router.query.page)
      ? router.query.page
      : undefined;
    const parsed = parseInt(queryPage ?? "1", 10);
    return parsed > 0 ? parsed : 1;
  }, [router.query.page]);

  const page = initialPage;

  const totalPages = Math.max(1, Math.ceil(courses.length / ACADEMY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * ACADEMY_PAGE_SIZE;
  const endIndex = startIndex + ACADEMY_PAGE_SIZE;
  const paginatedCourses = courses.slice(startIndex, endIndex);

  return (
    <>
      <Head>
        <title>Academy | Dust</title>
        <meta
          name="description"
          content="Learn how to build and deploy AI agents with Dust through our comprehensive courses."
        />
        <meta property="og:title" content="Academy | Dust" />
        <meta
          property="og:description"
          content="Learn how to build and deploy AI agents with Dust through our comprehensive courses."
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
        <AcademyHeader />

        <CourseGrid
          courses={paginatedCourses}
          emptyMessage="No courses available yet. Check back soon!"
        />

        {courses.length > ACADEMY_PAGE_SIZE && (
          <div className="col-span-12 mt-6 flex items-center justify-center">
            <AcademyPagination
              currentPage={currentPage}
              totalPages={totalPages}
              rowCount={courses.length}
              pageSize={ACADEMY_PAGE_SIZE}
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
