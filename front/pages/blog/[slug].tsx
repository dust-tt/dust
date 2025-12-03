import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, H1, H2 } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  buildPreviewQueryString,
  CONTENTFUL_REVALIDATE_SECONDS,
  getAllBlogPosts,
  getBlogPostBySlug,
  getRelatedPosts,
} from "@app/lib/contentful/client";
import { renderRichTextFromContentful } from "@app/lib/contentful/richTextRenderer";
import type { BlogPostPageProps } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export const getStaticPaths: GetStaticPaths = async () => {
  const postsResult = await getAllBlogPosts();

  if (postsResult.isErr()) {
    logger.error(
      { error: postsResult.error },
      "Error fetching blog posts for static paths"
    );
    return {
      paths: [],
      fallback: "blocking",
    };
  }

  const paths = postsResult.value.map((post) => ({
    params: { slug: post.slug },
  }));

  return {
    paths,
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<BlogPostPageProps> = async (
  context
) => {
  const { slug } = context.params ?? {};

  if (!isString(slug)) {
    return { notFound: true };
  }

  const resolvedUrl = buildPreviewQueryString(context.preview ?? false);

  const postResult = await getBlogPostBySlug(slug, resolvedUrl);

  if (postResult.isErr()) {
    logger.error(
      { slug, error: postResult.error },
      `Error fetching blog post "${slug}"`
    );
    return { notFound: true };
  }

  const post = postResult.value;

  if (!post) {
    return { notFound: true };
  }

  const relatedPostsResult = await getRelatedPosts(
    slug,
    post.tags,
    3,
    resolvedUrl
  );

  if (relatedPostsResult.isErr()) {
    logger.error(
      { slug, error: relatedPostsResult.error },
      `Error fetching related posts for "${slug}"`
    );
    return { notFound: true };
  }

  return {
    props: {
      post,
      relatedPosts: relatedPostsResult.value,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      preview: context.preview || false,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

const CONTENT_CLASSES = classNames(
  "col-span-12",
  "lg:col-span-8 lg:col-start-3"
);

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

export default function BlogPost({
  post,
  relatedPosts,
  preview,
}: BlogPostPageProps) {
  const ogImageUrl = post.image?.url ?? "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/blog/${post.slug}`;

  return (
    <>
      {preview && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-amber-100 px-4 py-2 text-center text-amber-800">
          Preview Mode - This is a draft
        </div>
      )}
      <Head>
        <title>{post.title} | Dust Blog</title>
        {preview && <meta name="robots" content="noindex, nofollow" />}
        {post.description && (
          <meta name="description" content={post.description} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:title" content={post.title} />
        {post.description && (
          <meta property="og:description" content={post.description} />
        )}
        <meta property="og:type" content="article" />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Dust" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        {post.description && (
          <meta name="twitter:description" content={post.description} />
        )}
        <meta name="twitter:image" content={ogImageUrl} />

        <meta property="article:published_time" content={post.createdAt} />
        <meta property="article:modified_time" content={post.updatedAt} />
        {post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: post.title,
              ...(post.description && { description: post.description }),
              image: ogImageUrl,
              url: canonicalUrl,
              datePublished: post.createdAt,
              dateModified: post.updatedAt,
              author: {
                "@type": "Organization",
                name: "Dust Team",
              },
              publisher: {
                "@type": "Organization",
                name: "Dust",
                logo: {
                  "@type": "ImageObject",
                  url: "https://dust.tt/static/og_image.png",
                },
              },
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": canonicalUrl,
              },
            }),
          }}
        />
      </Head>

      <article>
        <Grid>
          <header className={classNames(CONTENT_CLASSES, "pt-16")}>
            <Link
              href="/blog"
              className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>&larr;</span> Back to Blog
            </Link>

            {post.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-highlight/10 px-3 py-1 text-sm font-medium text-highlight"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <H1 mono>{post.title}</H1>

            <div className="mt-6 flex items-center gap-4">
              {post.authors.length > 0 ? (
                <>
                  <div className="flex -space-x-2">
                    {post.authors.map((author) =>
                      author.image ? (
                        <Image
                          key={author.name}
                          src={author.image.url}
                          alt={author.name}
                          width={40}
                          height={40}
                          className="rounded-full ring-2 ring-white"
                        />
                      ) : (
                        <div
                          key={author.name}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600 ring-2 ring-white"
                        >
                          {author.name.charAt(0).toUpperCase()}
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {post.authors.map((a) => a.name).join(", ")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatTimestampToFriendlyDate(
                        new Date(post.createdAt).getTime(),
                        "short"
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {formatTimestampToFriendlyDate(
                    new Date(post.createdAt).getTime(),
                    "short"
                  )}
                </span>
              )}
            </div>
          </header>

          {post.image && (
            <div className={classNames(WIDE_CLASSES, "mt-8")}>
              <Image
                src={post.image.url}
                alt={post.image.alt}
                width={post.image.width}
                height={post.image.height}
                className="rounded-2xl"
                priority
              />
            </div>
          )}

          <div className={classNames(CONTENT_CLASSES, "mt-12")}>
            {renderRichTextFromContentful(post.body)}
          </div>
        </Grid>
      </article>

      {relatedPosts.length > 0 && (
        <section className="mt-20">
          <Grid>
            <div className={CONTENT_CLASSES}>
              <H2 className="mb-8">Related Posts</H2>
            </div>
            <div
              className={classNames(
                WIDE_CLASSES,
                "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {relatedPosts.map((relatedPost) => (
                <BlogBlock
                  key={relatedPost.id}
                  title={relatedPost.title}
                  content={relatedPost.description ?? ""}
                  href={`/blog/${relatedPost.slug}`}
                >
                  {relatedPost.image && (
                    <Image
                      src={relatedPost.image.url}
                      alt={relatedPost.image.alt}
                      width={400}
                      height={225}
                      className="aspect-video w-full object-cover"
                    />
                  )}
                </BlogBlock>
              ))}
            </div>
          </Grid>
        </section>
      )}
    </>
  );
}

BlogPost.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
