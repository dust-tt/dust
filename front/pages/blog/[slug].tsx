import { Chip } from "@dust-tt/sparkle";
import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { TableOfContents } from "@app/components/blog/TableOfContents";
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
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import { renderRichTextFromContentful } from "@app/lib/contentful/richTextRenderer";
import { extractTableOfContents } from "@app/lib/contentful/tableOfContents";
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
      preview: context.preview ?? false,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

export default function BlogPost({
  post,
  relatedPosts,
  preview,
}: BlogPostPageProps) {
  const ogImageUrl = post.image?.url ?? "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/blog/${post.slug}`;
  const tocItems = extractTableOfContents(post.body);

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
          <div className={classNames(WIDE_CLASSES, "pb-2 pt-6")}>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>&larr;</span> Back to Blog
            </Link>
          </div>

          <header className={WIDE_CLASSES}>
            {post.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag)}`}>
                    <Chip label={tag} size="xs" color="primary" />
                  </Link>
                ))}
              </div>
            )}

            <H1 className="text-4xl md:text-5xl">{post.title}</H1>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {post.authors.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    {post.authors.map((author) =>
                      author.image ? (
                        <Image
                          key={author.name}
                          src={author.image.url}
                          alt={author.name}
                          width={24}
                          height={24}
                          className="rounded-full"
                        />
                      ) : null
                    )}
                    <span>{post.authors.map((a) => a.name).join(", ")}</span>
                  </div>
                  <span>-</span>
                </>
              )}
              <span>
                {formatTimestampToFriendlyDate(
                  new Date(post.createdAt).getTime(),
                  "short"
                )}
              </span>
            </div>
          </header>

          {post.image && (
            <div className={classNames(WIDE_CLASSES, "mt-2")}>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <Image
                  src={post.image.url}
                  alt={post.image.alt}
                  width={post.image.width}
                  height={post.image.height}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
            </div>
          )}

          <div className={classNames(WIDE_CLASSES, "mt-4")}>
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-9">
                {renderRichTextFromContentful(post.body)}
              </div>
              {tocItems.length > 0 && (
                <div className="hidden lg:col-span-3 lg:block">
                  <TableOfContents items={tocItems} />
                </div>
              )}
            </div>
          </div>
        </Grid>
      </article>

      {relatedPosts.length > 0 && (
        <section className="mt-20">
          <Grid>
            <div className={WIDE_CLASSES}>
              <H2 className="mb-8">Related Posts</H2>
            </div>
            <div
              className={classNames(
                WIDE_CLASSES,
                "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {relatedPosts.map((relatedPost) => (
                <Link
                  key={relatedPost.id}
                  href={`/blog/${relatedPost.slug}`}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white"
                >
                  {relatedPost.image && (
                    <Image
                      src={relatedPost.image.url}
                      alt={relatedPost.image.alt}
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
                        new Date(relatedPost.createdAt).getTime(),
                        "short"
                      )}
                    </span>
                    <h3 className="text-xl font-semibold text-foreground">
                      {relatedPost.title}
                    </h3>
                    {relatedPost.description && (
                      <p className="text-base text-muted-foreground">
                        {relatedPost.description}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2">
                      {relatedPost.tags.map((tag) => (
                        <Chip key={tag} label={tag} size="xs" color="primary" />
                      ))}
                    </div>
                  </div>
                </Link>
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
