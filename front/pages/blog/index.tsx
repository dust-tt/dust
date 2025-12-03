import { ChevronDownIcon } from "@heroicons/react/20/solid";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllBlogPosts,
} from "@app/lib/contentful/client";
import type { BlogListingPageProps } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import logger from "@app/logger/logger";

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
  const selectedTag =
    typeof router.query.tag === "string" ? router.query.tag : null;

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
        {allTags.length > 0 && (
          <div className="col-span-12 flex justify-end pt-8">
            <div className="relative inline-block">
              <select
                value={selectedTag ?? ""}
                onChange={(e) => {
                  const tag = e.target.value;
                  if (tag) {
                    void router.push(`/blog?tag=${encodeURIComponent(tag)}`);
                  } else {
                    void router.push("/blog");
                  }
                }}
                className="appearance-none rounded-full border border-gray-200 bg-white py-2 pl-4 pr-10 text-sm font-medium text-foreground transition-colors hover:border-gray-300 focus:border-highlight focus:outline-none focus:ring-1 focus:ring-highlight"
              >
                <option value="">All topics</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}

        <div
          className={classNames(
            "col-span-12 pt-6",
            "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {filteredPosts.length > 0 ? (
            filteredPosts.map((post) => (
              <BlogBlock
                key={post.id}
                title={post.title}
                content={
                  <>
                    {post.description && (
                      <span className="mb-2 line-clamp-2 block text-muted-foreground">
                        {post.description}
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {formatTimestampToFriendlyDate(
                        new Date(post.createdAt).getTime(),
                        "short"
                      )}
                    </span>
                  </>
                }
                href={`/blog/${post.slug}`}
                tags={post.tags}
              >
                {post.image && (
                  <Image
                    src={post.image.url}
                    alt={post.image.alt}
                    width={640}
                    height={360}
                    className="aspect-video w-full object-cover"
                  />
                )}
              </BlogBlock>
            ))
          ) : (
            <div className="col-span-full py-12 text-center">
              <P size="md" className="text-muted-foreground">
                {selectedTag
                  ? `No posts found with tag "${selectedTag}".`
                  : "No blog posts available yet. Check back soon!"}
              </P>
            </div>
          )}
        </div>
      </Grid>
    </>
  );
}

BlogListing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
