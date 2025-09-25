import {
  Button,
  Card,
  Chip,
  H1,
  H3,
  Page,
  Paragraph,
} from "@dust-tt/sparkle";
import type { GetStaticProps, InferGetStaticPropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";

import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { getBlogPosts, type BlogPostType } from "@app/cms/lib/blog";

interface BlogIndexProps {
  posts: BlogPostType[];
  totalPages: number;
  currentPage: number;
  selectedTag?: string;
  allTags: string[];
}

export const getStaticProps: GetStaticProps<BlogIndexProps> = async () => {
  const { posts, totalPages } = await getBlogPosts({ pageSize: 12 });

  const allTagsSet = new Set<string>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => allTagsSet.add(tag));
  });

  return {
    props: {
      posts,
      totalPages,
      currentPage: 1,
      allTags: Array.from(allTagsSet).sort(),
    },
    revalidate: 60,
  };
};

export default function BlogIndex({
  posts,
  totalPages,
  currentPage,
  allTags,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const router = useRouter();
  const selectedTag = router.query.tag as string | undefined;

  const filteredPosts = selectedTag
    ? posts.filter((post) => post.tags.includes(selectedTag))
    : posts;

  return (
    <AppCenteredLayout>
      <Page.Container>
        <Page.Content>
          <div className="py-12">
            <div className="mb-12 text-center">
              <H1 className="mb-4">Blog</H1>
              <Paragraph className="text-muted-foreground">
                Insights, updates, and best practices from the Dust team
              </Paragraph>
            </div>

            {allTags.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2 justify-center">
                <Chip
                  label="All"
                  size="sm"
                  color={!selectedTag ? "primary" : "neutral"}
                  onClick={() =>
                    router.push("/blog", undefined, { shallow: true })
                  }
                />
                {allTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="sm"
                    color={selectedTag === tag ? "primary" : "neutral"}
                    onClick={() =>
                      router.push(`/blog?tag=${tag}`, undefined, {
                        shallow: true,
                      })
                    }
                  />
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post) => (
                <Link
                  key={post.sId}
                  href={`/blog/${post.uid}`}
                  className="group"
                >
                  <Card className="h-full hover:shadow-lg transition-shadow">
                    <Card.Content>
                      <div className="flex flex-col h-full">
                        <H3 className="mb-2 group-hover:text-primary transition-colors">
                          {post.title}
                        </H3>
                        {post.description && (
                          <Paragraph className="text-sm text-muted-foreground mb-4 flex-grow">
                            {post.description}
                          </Paragraph>
                        )}
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <time dateTime={post.publishedAt}>
                            {new Date(post.publishedAt).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )}
                          </time>
                          {post.tags.length > 0 && (
                            <div className="flex gap-1">
                              {post.tags.slice(0, 2).map((tag) => (
                                <Chip key={tag} label={tag} size="xs" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card.Content>
                  </Card>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-12 flex justify-center gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <Button
                      key={page}
                      variant={page === currentPage ? "primary" : "secondary"}
                      size="sm"
                      onClick={() =>
                        router.push(`/blog?page=${page}`, undefined, {
                          shallow: true,
                        })
                      }
                    >
                      {page}
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </Page.Content>
      </Page.Container>
    </AppCenteredLayout>
  );
}