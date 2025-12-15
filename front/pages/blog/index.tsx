import { Button, Chip, Pagination } from "@dust-tt/sparkle";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllBlogPosts,
} from "@app/lib/contentful/client";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type { BlogListingPageProps } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import logger from "@app/logger/logger";

const GRID_PAGE_SIZE = 12;

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
  const initialTag =
    typeof router.query.tag === "string" ? router.query.tag : null;
  const initialPage = useMemo(() => {
    const queryPage = Array.isArray(router.query.page)
      ? router.query.page[0]
      : router.query.page;
    const parsed = queryPage ? parseInt(queryPage, 10) : 1;
    return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }, [router.query.page]);

  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [page, setPage] = useState<number>(initialPage);

  useEffect(() => {
    const queryTag =
      typeof router.query.tag === "string" ? router.query.tag : null;
    setSelectedTag(queryTag);
  }, [router.query.tag]);

  useEffect(() => {
    const queryPage = Array.isArray(router.query.page)
      ? router.query.page[0]
      : router.query.page;
    const parsed = queryPage ? parseInt(queryPage, 10) : 1;
    setPage(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
  }, [router.query.page]);

  const buildUrl = useCallback((tag: string | null, pageNumber: number) => {
    const params = new URLSearchParams();
    if (tag) {
      params.set("tag", tag);
    }
    if (pageNumber > 1) {
      params.set("page", pageNumber.toString());
    }
    const query = params.toString();
    return query ? `/blog?${query}` : "/blog";
  }, []);

  const handleSelectTag = useCallback(
    (tag: string | null) => {
      setSelectedTag(tag);
      setPage(1);
      void router.push(buildUrl(tag, 1), undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [buildUrl, router]
  );

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      setPage(pageNumber);
      void router.push(buildUrl(selectedTag, pageNumber), undefined, {
        shallow: true,
        scroll: true,
      });
    },
    [buildUrl, router, selectedTag]
  );

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((post) => post.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [posts]);

  const defaultCategories = ["News", "Product", "Events", "Joining Dust"];
  const categories = allTags.length > 0 ? allTags : defaultCategories;

  const filteredPosts = useMemo(() => {
    if (!selectedTag) {
      return posts;
    }
    return posts.filter((post) => post.tags.includes(selectedTag));
  }, [posts, selectedTag]);

  const hasFeaturedCandidate = !selectedTag && filteredPosts.length > 0;
  const remainingPool = hasFeaturedCandidate
    ? filteredPosts.slice(1) // exclude hero from grid counting
    : filteredPosts;

  const totalPages = Math.max(
    1,
    Math.ceil(remainingPool.length / GRID_PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * GRID_PAGE_SIZE;
  const endIndex = startIndex + GRID_PAGE_SIZE;
  const paginatedPosts = remainingPool.slice(startIndex, endIndex);

  const showFeatured =
    hasFeaturedCandidate && currentPage === 1 && filteredPosts.length > 0;
  const featuredPost = showFeatured ? filteredPosts[0] : null;
  const remainingPosts = paginatedPosts;

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
      </Head>

      <Grid>
        <div className="col-span-12 flex flex-col items-center gap-0 pt-1 text-center">
          <Image
            src="/static/landing/about/Dust_Fade.png"
            alt="Dust"
            width={112}
            height={112}
            className="h-28 w-28"
            priority
          />
          <H1 className="text-5xl">Blog</H1>
          <P className="max-w-2xl text-center text-muted-foreground">
            Learn more about Dust, get product updates, customer insights and
            more.
          </P>
        </div>

        {categories.length > 0 && (
          <div className="col-span-12 flex flex-wrap justify-center gap-2 pt-0">
            <Button
              label="All"
              variant={selectedTag === null ? "primary" : "outline"}
              size="sm"
              onClick={() => handleSelectTag(null)}
            />
            {categories.map((tag) => (
              <Button
                key={tag}
                label={tag}
                variant={selectedTag === tag ? "primary" : "outline"}
                size="sm"
                onClick={() => handleSelectTag(tag)}
              />
            ))}
          </div>
        )}

        {featuredPost && (
          <div className="col-span-12 pt-4">
            <div className="grid gap-6 rounded-2xl border border-gray-100 bg-white p-6 lg:grid-cols-12">
              {featuredPost.image && (
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="cursor-pointer lg:col-span-7"
                >
                  <Image
                    src={featuredPost.image.url}
                    alt={featuredPost.image.alt}
                    width={featuredPost.image.width}
                    height={featuredPost.image.height}
                    loader={contentfulImageLoader}
                    className="aspect-[16/9] w-full rounded-xl object-cover transition-opacity hover:opacity-90"
                    sizes="(max-width: 1024px) 100vw, 60vw"
                  />
                </Link>
              )}
              <div className="flex h-full flex-col justify-center gap-4 lg:col-span-5">
                <div className="flex flex-wrap items-center gap-3">
                  {featuredPost.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="xs" color="primary" />
                  ))}
                  <span className="text-sm text-muted-foreground">
                    {formatTimestampToFriendlyDate(
                      new Date(featuredPost.createdAt).getTime(),
                      "short"
                    )}
                  </span>
                </div>
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="cursor-pointer transition-colors hover:text-highlight"
                >
                  <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
                    {featuredPost.title}
                  </h2>
                </Link>
                {featuredPost.description && (
                  <P className="text-muted-foreground">
                    {featuredPost.description}
                  </P>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    label="Read full article"
                    href={`/blog/${featuredPost.slug}`}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className={classNames(
            "col-span-12 pt-4",
            "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {remainingPosts.length > 0 ? (
            remainingPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white"
              >
                {post.image && (
                  <Image
                    src={post.image.url}
                    alt={post.image.alt}
                    width={640}
                    height={360}
                    loader={contentfulImageLoader}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="flex h-full flex-col gap-3 px-6 py-6">
                  <span className="text-sm text-muted-foreground">
                    {formatTimestampToFriendlyDate(
                      new Date(post.createdAt).getTime(),
                      "short"
                    )}
                  </span>
                  <h3 className="text-xl font-semibold text-foreground">
                    {post.title}
                  </h3>
                  {post.description && (
                    <p className="text-base text-muted-foreground">
                      {post.description}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="xs" color="primary" />
                    ))}
                  </div>
                </div>
              </Link>
            ))
          ) : filteredPosts.length === 0 ? (
            <div className="col-span-full py-12 text-center">
              <P size="md" className="text-muted-foreground">
                {selectedTag
                  ? `No posts found with tag "${selectedTag}".`
                  : "No blog posts available yet. Check back soon!"}
              </P>
            </div>
          ) : null}
        </div>

        {remainingPool.length > GRID_PAGE_SIZE && (
          <div className="col-span-12 mt-6 flex items-center justify-center">
            <Pagination
              rowCount={remainingPool.length}
              pagination={{
                pageIndex: currentPage - 1,
                pageSize: GRID_PAGE_SIZE,
              }}
              setPagination={({ pageIndex }) => handlePageChange(pageIndex + 1)}
              size="sm"
            />
          </div>
        )}
      </Grid>
    </>
  );
}

BlogListing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
