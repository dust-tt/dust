import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { BlogBlock } from "@app/components/home/ContentBlocks";
import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getAllBlogPosts,
  getBlogPostBySlug,
  getRelatedPosts,
} from "@app/lib/contentful/client";
import { renderRichTextFromContentful } from "@app/lib/contentful/richTextRenderer";
import type { BlogPostPageProps } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import logger from "@app/logger/logger";

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getAllBlogPosts();

  return {
    paths: posts.map((post) => ({ params: { slug: post.slug } })),
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<BlogPostPageProps> = async ({
  params,
}) => {
  const slug = isString(params?.slug) ? params.slug : "";

  try {
    const post = await getBlogPostBySlug(slug);

    if (!post) {
      return { notFound: true };
    }

    const relatedPosts = await getRelatedPosts(slug, post.tags, 3);

    return {
      props: {
        post,
        relatedPosts,
        gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      },
      revalidate: 300,
    };
  } catch (error) {
    logger.error({ slug, error }, `Error fetching blog post "${slug}"`);
    return { notFound: true };
  }
};

const CONTENT_CLASSES = classNames(
  "col-span-12",
  "lg:col-span-8 lg:col-start-3",
  "xl:col-span-6 xl:col-start-4"
);

const WIDE_CLASSES = classNames("col-span-12", "lg:col-span-10 lg:col-start-2");

export default function BlogPost({ post, relatedPosts }: BlogPostPageProps) {
  const ogImageUrl = post.image?.url ?? "https://dust.tt/static/og_image.png";
  const canonicalUrl = `https://dust.tt/blog/${post.slug}`;

  return (
    <>
      <Head>
        <title>{post.title} | Dust Blog</title>
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

            <div className="mt-4 text-muted-foreground">
              {formatTimestampToFriendlyDate(
                  new Date(post.createdAt).getTime(),
                  "short"
                )}
            </div>

            {post.description && (
              <P size="lg" className="mt-6 text-muted-foreground">
                {post.description}
              </P>
            )}
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
                    <img
                      src={relatedPost.image.url}
                      alt={relatedPost.image.alt}
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
