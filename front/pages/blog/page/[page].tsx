import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import type { ReactElement } from "react";

import {
  BlogHeader,
  BlogLayout,
  BlogPostGrid,
  BlogTagFilter,
  BLOG_PAGE_SIZE,
} from "@app/components/blog/BlogComponents";
import { BlogPagination } from "@app/components/blog/BlogPagination";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllBlogPosts,
} from "@app/lib/contentful/client";
import type { BlogPostSummary } from "@app/lib/contentful/types";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

interface BlogPageProps {
  posts: BlogPostSummary[];
  currentPage: number;
  totalPages: number;
  totalPosts: number;
  allTags: string[];
  gtmTrackingId: string | null;
}

export const getStaticPaths: GetStaticPaths = async () => {
  // Don't pre-generate any paths at build time to minimize Contentful API calls.
  // Pages are generated on-demand via fallback: "blocking" and cached with ISR.
  return {
    paths: [],
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<BlogPageProps> = async ({
  params,
}) => {
  const pageParam = params?.page;

  if (!isString(pageParam)) {
    return { notFound: true };
  }

  const page = parseInt(pageParam, 10);

  // Page 1 should be served from /blog, not /blog/page/1
  if (isNaN(page) || page < 2) {
    return {
      redirect: {
        destination: "/blog",
        permanent: page === 1,
      },
    };
  }

  const result = await getAllBlogPosts();

  if (result.isErr()) {
    logger.error(
      { error: result.error, page },
      "Error fetching blog posts from Contentful"
    );
    return { notFound: true };
  }

  const allPosts = result.value;

  // Extract all tags
  const tagSet = new Set<string>();
  allPosts.forEach((post) => post.tags.forEach((tag) => tagSet.add(tag)));
  const allTags = Array.from(tagSet).sort();

  // Paginate: skip featured post (index 0) and previous pages
  const FEATURED_POST_OFFSET = 1;
  const remainingPosts = allPosts.slice(FEATURED_POST_OFFSET);
  const totalPages = Math.ceil(remainingPosts.length / BLOG_PAGE_SIZE);

  // If page is beyond available pages, 404
  if (page > totalPages) {
    return { notFound: true };
  }

  const startIndex = (page - 1) * BLOG_PAGE_SIZE;
  const posts = remainingPosts.slice(startIndex, startIndex + BLOG_PAGE_SIZE);

  return {
    props: {
      posts,
      currentPage: page,
      totalPages,
      totalPosts: remainingPosts.length,
      allTags,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

export default function BlogPage({
  posts,
  currentPage,
  totalPages,
  totalPosts,
  allTags,
}: BlogPageProps) {
  return (
    <>
      <Head>
        <title>Blog - Page {currentPage} | Dust</title>
        <meta
          name="description"
          content="Insights, tutorials, and updates from the Dust team on AI agents, enterprise productivity, and building with AI."
        />
        <meta
          property="og:title"
          content={`Blog - Page ${currentPage} | Dust`}
        />
        <meta
          property="og:description"
          content="Insights, tutorials, and updates from the Dust team on AI agents and enterprise productivity."
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={`https://dust.tt/blog/page/${currentPage}`}
        />
        <meta property="og:image" content="/static/og_image.png" />
        <link
          rel="canonical"
          href={`https://dust.tt/blog/page/${currentPage}`}
        />
        {currentPage > 1 && (
          <link
            rel="prev"
            href={
              currentPage === 2
                ? "https://dust.tt/blog"
                : `https://dust.tt/blog/page/${currentPage - 1}`
            }
          />
        )}
        {currentPage < totalPages && (
          <link
            rel="next"
            href={`https://dust.tt/blog/page/${currentPage + 1}`}
          />
        )}
      </Head>

      <BlogLayout>
        <BlogHeader />
        <BlogTagFilter allTags={allTags} />

        <BlogPostGrid
          posts={posts}
          emptyMessage="No blog posts available on this page."
        />

        {totalPages > 1 && (
          <div className="col-span-12 mt-6 flex items-center justify-center">
            <BlogPagination
              currentPage={currentPage}
              totalPages={totalPages}
              rowCount={totalPosts}
              pageSize={BLOG_PAGE_SIZE}
            />
          </div>
        )}
      </BlogLayout>
    </>
  );
}

BlogPage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
