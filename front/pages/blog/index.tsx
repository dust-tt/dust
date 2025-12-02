import type { GetServerSideProps } from "next";
import Head from "next/head";
import type { ReactElement } from "react";

import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getAllBlogPosts } from "@app/lib/contentful/client";
import type { BlogListingPageProps } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import logger from "@app/logger/logger";

export const getServerSideProps: GetServerSideProps<
  BlogListingPageProps
> = async (context) => {
  const postsResult = await getAllBlogPosts(context.resolvedUrl);

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
    };
  }

  return {
    props: {
      posts: postsResult.value,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
};

export default function BlogListing({ posts }: BlogListingPageProps) {
  return (
    <>
      <Head>
        <title>Blog | Dust</title>
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
        <div
          className={classNames(
            "col-span-12 pt-8",
            "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {posts.length > 0 ? (
            posts.map((post) => (
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
                    {post.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {post.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-highlight/10 px-2 py-0.5 text-xs font-medium text-highlight"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </>
                }
                href={`/blog/${post.slug}`}
              >
                {post.image && (
                  <img
                    src={`${post.image.url}?w=900`}
                    alt={post.image.alt}
                    className="aspect-video w-full object-cover"
                  />
                )}
              </BlogBlock>
            ))
          ) : (
            <div className="col-span-full py-12 text-center">
              <P size="md" className="text-muted-foreground">
                No blog posts available yet. Check back soon!
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
