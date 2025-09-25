import { SliceZone } from "@prismicio/react";
import {
  Chip,
  H1,
  Page,
  Paragraph,
} from "@dust-tt/sparkle";
import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";

import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import {
  getBlogPost,
  getBlogPosts,
  getRelatedPosts,
  type BlogPostType,
} from "@app/cms/lib/blog";
import { components } from "@app/cms/slices";

interface BlogPostPageProps {
  post: BlogPostType;
  relatedPosts: BlogPostType[];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { posts } = await getBlogPosts({ pageSize: 100 });

  return {
    paths: posts.map((post) => ({
      params: { uid: post.uid },
    })),
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<BlogPostPageProps> = async ({
  params,
  previewData,
}) => {
  if (!params?.uid || typeof params.uid !== "string") {
    return { notFound: true };
  }

  const post = await getBlogPost(params.uid);

  if (!post) {
    return { notFound: true };
  }

  const relatedPosts = await getRelatedPosts(post.uid, post.tags, 3);

  return {
    props: {
      post,
      relatedPosts,
    },
    revalidate: 60,
  };
};

export default function BlogPost({
  post,
  relatedPosts,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const formattedDate = new Date(post.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <Head>
        <title>{post.title} | Dust Blog</title>
        {post.description && (
          <meta name="description" content={post.description} />
        )}
        <meta property="og:title" content={post.title} />
        {post.description && (
          <meta property="og:description" content={post.description} />
        )}
        <meta property="og:type" content="article" />
        <meta
          property="article:published_time"
          content={post.publishedAt}
        />
        {post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
      </Head>

      <AppCenteredLayout>
        <Page.Container>
          <Page.Content>
            <article className="py-12">
              <header className="mb-12 text-center">
                <H1 className="mb-4">{post.title}</H1>
                {post.description && (
                  <Paragraph className="text-lg text-muted-foreground mb-6">
                    {post.description}
                  </Paragraph>
                )}
                <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                  <time dateTime={post.publishedAt}>{formattedDate}</time>
                  {post.tags.length > 0 && (
                    <>
                      <span>•</span>
                      <div className="flex gap-2">
                        {post.tags.map((tag) => (
                          <Link key={tag} href={`/blog?tag=${tag}`}>
                            <Chip
                              label={tag}
                              size="sm"
                              className="hover:bg-primary/10 transition-colors cursor-pointer"
                            />
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </header>

              <div className="prose prose-lg max-w-none">
                <SliceZone slices={post.data.slices} components={components} />
              </div>

              {relatedPosts.length > 0 && (
                <section className="mt-16 pt-8 border-t">
                  <h2 className="text-2xl font-semibold mb-6">
                    Related Articles
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {relatedPosts.map((relatedPost) => (
                      <Link
                        key={relatedPost.sId}
                        href={`/blog/${relatedPost.uid}`}
                        className="group block"
                      >
                        <div className="p-4 rounded-lg border hover:shadow-md transition-shadow">
                          <h3 className="font-medium mb-2 group-hover:text-primary transition-colors">
                            {relatedPost.title}
                          </h3>
                          {relatedPost.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {relatedPost.description}
                            </p>
                          )}
                          <time
                            className="text-xs text-muted-foreground mt-2 block"
                            dateTime={relatedPost.publishedAt}
                          >
                            {new Date(
                              relatedPost.publishedAt
                            ).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </time>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </article>
          </Page.Content>
        </Page.Container>
      </AppCenteredLayout>
    </>
  );
}