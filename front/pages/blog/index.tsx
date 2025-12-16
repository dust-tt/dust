import type { GetStaticProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  BlogHeader,
  BlogLayout,
  BlogPostGrid,
  BlogTagFilter,
  BLOG_PAGE_SIZE,
  FeaturedPost,
} from "@app/components/blog/BlogComponents";
import { BlogPagination } from "@app/components/blog/BlogPagination";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllBlogPosts,
} from "@app/lib/contentful/client";
import type { BlogListingPageProps } from "@app/lib/contentful/types";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export const getStaticProps: GetStaticProps<
  BlogListingPageProps
> = async () => {
  const postsResult = await getAllBlogPosts();

  if (postsResult.isErr()) {
    logger.error(
      { error: postsResult.error },
      "Error fetching blog posts from Contentful"
    );
    return {
      props: {
        posts: [],
        gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      },
      revalidate: CONTENTFUL_REVALIDATE_SECONDS,
    };
  }

  return {
    props: {
      posts: postsResult.value,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

export default function BlogListing({ posts }: BlogListingPageProps) {
  const router = useRouter();
  const initialTag = isString(router.query.tag) ? router.query.tag : null;
  const initialPage = useMemo(() => {
    const queryPage = isString(router.query.page)
      ? router.query.page
      : undefined;
    const parsed = parseInt(queryPage ?? "1", 10);
    return parsed > 0 ? parsed : 1;
  }, [router.query.page]);

  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);

  useEffect(() => {
    const queryTag = isString(router.query.tag) ? router.query.tag : null;
    setSelectedTag(queryTag);
  }, [router.query.tag]);

  const page = initialPage;

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((post) => post.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (!selectedTag) {
      return posts;
    }
    return posts.filter((post) => post.tags.includes(selectedTag));
  }, [posts, selectedTag]);

  const hasFeaturedCandidate = !selectedTag && filteredPosts.length > 0;
  const remainingPool = hasFeaturedCandidate
    ? filteredPosts.slice(1)
    : filteredPosts;

  const totalPages = Math.max(
    1,
    Math.ceil(remainingPool.length / BLOG_PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * BLOG_PAGE_SIZE;
  const endIndex = startIndex + BLOG_PAGE_SIZE;
  const paginatedPosts = remainingPool.slice(startIndex, endIndex);

  const showFeatured =
    hasFeaturedCandidate && currentPage === 1 && filteredPosts.length > 0;
  const featuredPost = showFeatured ? filteredPosts[0] : null;

  return (
    <>
      <Head>
        <title>{selectedTag ? `${selectedTag} | ` : ""}Blog | Dust</title>
        <meta
          name="description"
          content="Insights, tutorials, and updates from the Dust team on AI agents, enterprise productivity, and building with AI."
        />
        <meta property="og:title" content="Blog | Dust" />
        <meta
          property="og:description"
          content="Insights, tutorials, and updates from the Dust team on AI agents and enterprise productivity."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://dust.tt/blog" />
        <meta property="og:image" content="/static/og_image.png" />
        <link rel="canonical" href="https://dust.tt/blog" />
        {!selectedTag && totalPages > 1 && (
          <link rel="next" href="https://dust.tt/blog/page/2" />
        )}
      </Head>

      <BlogLayout>
        <BlogHeader />
        <BlogTagFilter allTags={allTags} selectedTag={selectedTag} />

        {featuredPost && <FeaturedPost post={featuredPost} />}

        <BlogPostGrid
          posts={paginatedPosts}
          emptyMessage={
            selectedTag
              ? `No posts found with tag "${selectedTag}".`
              : "No blog posts available yet. Check back soon!"
          }
        />

        {remainingPool.length > BLOG_PAGE_SIZE && (
          <div className="col-span-12 mt-6 flex items-center justify-center">
            <BlogPagination
              currentPage={currentPage}
              totalPages={totalPages}
              rowCount={remainingPool.length}
              pageSize={BLOG_PAGE_SIZE}
              tag={selectedTag}
            />
          </div>
        )}
      </BlogLayout>
    </>
  );
}

BlogListing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
