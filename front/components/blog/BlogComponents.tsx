import { Button, Chip } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

import { Grid, H1, P } from "@app/components/home/ContentComponents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type { BlogPostSummary } from "@app/lib/contentful/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";

export const BLOG_PAGE_SIZE = 12;

export function BlogHeader() {
  return (
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
        Learn more about Dust, get product updates, AI agents best practices and
        more.
      </P>
    </div>
  );
}

interface BlogTagFilterProps {
  allTags: string[];
  selectedTag?: string | null;
}

export function BlogTagFilter({ allTags, selectedTag }: BlogTagFilterProps) {
  if (allTags.length === 0) {
    return null;
  }

  return (
    <div className="col-span-12 flex flex-wrap justify-center gap-2 pt-0">
      <Button
        label="All"
        variant={
          selectedTag === null || selectedTag === undefined
            ? "primary"
            : "outline"
        }
        size="sm"
        href="/blog"
      />
      {allTags.map((tag) => (
        <Button
          key={tag}
          label={tag}
          variant={selectedTag === tag ? "primary" : "outline"}
          size="sm"
          href={`/blog?tag=${encodeURIComponent(tag)}`}
        />
      ))}
    </div>
  );
}

interface BlogPostCardProps {
  post: BlogPostSummary;
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <Link
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
        <h3 className="text-xl font-semibold text-foreground">{post.title}</h3>
        {post.description && (
          <p className="text-base text-muted-foreground">{post.description}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Chip key={tag} label={tag} size="xs" color="primary" />
          ))}
        </div>
      </div>
    </Link>
  );
}

interface BlogPostGridProps {
  posts: BlogPostSummary[];
  emptyMessage?: string;
}

export function BlogPostGrid({ posts, emptyMessage }: BlogPostGridProps) {
  return (
    <div
      className={classNames(
        "col-span-12 pt-4",
        "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {posts.length > 0 ? (
        posts.map((post) => <BlogPostCard key={post.id} post={post} />)
      ) : (
        <div className="col-span-full py-12 text-center">
          <P size="md" className="text-muted-foreground">
            {emptyMessage ?? "No blog posts available."}
          </P>
        </div>
      )}
    </div>
  );
}

interface FeaturedPostProps {
  post: BlogPostSummary;
}

export function FeaturedPost({ post }: FeaturedPostProps) {
  return (
    <div className="col-span-12 pt-4">
      <div className="grid gap-6 rounded-2xl border border-gray-100 bg-white p-6 lg:grid-cols-12">
        {post.image && (
          <Link
            href={`/blog/${post.slug}`}
            className="cursor-pointer lg:col-span-7"
          >
            <Image
              src={post.image.url}
              alt={post.image.alt}
              width={post.image.width}
              height={post.image.height}
              loader={contentfulImageLoader}
              className="aspect-[16/9] w-full rounded-xl object-cover transition-opacity hover:opacity-90"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
          </Link>
        )}
        <div className="flex h-full flex-col justify-center gap-4 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-3">
            {post.tags.map((tag) => (
              <Chip key={tag} label={tag} size="xs" color="primary" />
            ))}
            <span className="text-sm text-muted-foreground">
              {formatTimestampToFriendlyDate(
                new Date(post.createdAt).getTime(),
                "short"
              )}
            </span>
          </div>
          <Link
            href={`/blog/${post.slug}`}
            className="cursor-pointer transition-colors hover:text-highlight"
          >
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {post.title}
            </h2>
          </Link>
          {post.description && (
            <P className="text-muted-foreground">{post.description}</P>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              label="Read full article"
              href={`/blog/${post.slug}`}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface BlogLayoutProps {
  children: React.ReactNode;
}

export function BlogLayout({ children }: BlogLayoutProps) {
  return <Grid>{children}</Grid>;
}
