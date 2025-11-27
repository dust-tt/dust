import type { Asset, ContentfulClientApi, Entry } from "contentful";
import { createClient } from "contentful";

import type {
  BlogImage,
  BlogPageSkeleton,
  BlogPost,
  BlogPostSummary,
} from "./types";

// ============================================
// Client Singleton
// ============================================

let client: ContentfulClientApi<undefined> | null = null;

function getClient(): ContentfulClientApi<undefined> {
  if (!client) {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const accessToken = process.env.CONTENTFUL_ACCESS_TOKEN;

    if (!spaceId || !accessToken) {
      throw new Error(
        "Contentful credentials not configured. " +
          "Set CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN environment variables."
      );
    }

    client = createClient({
      space: spaceId,
      accessToken,
      environment: process.env.CONTENTFUL_ENVIRONMENT ?? "master",
    });
  }
  return client;
}

// ============================================
// Utility Functions
// ============================================

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function transformImage(asset: Asset | undefined, fallbackAlt: string): BlogImage | null {
  if (!asset?.fields?.file) {
    return null;
  }

  const file = asset.fields.file;
  if (typeof file.url !== "string") {
    return null;
  }

  const imageDetails =
    file.details && "image" in file.details ? file.details.image : undefined;

  return {
    url: `https:${file.url}`,
    alt: typeof asset.fields.title === "string" ? asset.fields.title : fallbackAlt,
    width: imageDetails?.width ?? 1200,
    height: imageDetails?.height ?? 630,
  };
}

function transformBlogPost(entry: Entry<BlogPageSkeleton>): BlogPost {
  const fields = entry.fields;

  return {
    id: entry.sys.id,
    slug: (fields.slug as string) ?? slugify(fields.title as string),
    title: fields.title as string,
    description: (fields.description as string) ?? null,
    body: fields.body,
    tags: (fields.tags as string[]) ?? [],
    image: transformImage(fields.image as Asset, fields.title as string),
    createdAt: (fields.publishedAt as string) ?? entry.sys.createdAt,
    updatedAt: entry.sys.updatedAt,
  };
}

function toSummary(post: BlogPost): BlogPostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.description,
    tags: post.tags,
    image: post.image,
    createdAt: post.createdAt,
  };
}

// ============================================
// Public API Functions
// ============================================

export async function getAllBlogPosts(): Promise<BlogPostSummary[]> {
  const contentfulClient = getClient();

  const response = await contentfulClient.getEntries<BlogPageSkeleton>({
    content_type: "blogPage",
    limit: 1000,
  });

  return response.items
    .map(transformBlogPost)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(toSummary);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const contentfulClient = getClient();

  // Query directly by slug field
  const response = await contentfulClient.getEntries<BlogPageSkeleton>({
    content_type: "blogPage",
    "fields.slug": slug,
    limit: 1,
  });

  if (response.items.length > 0) {
    return transformBlogPost(response.items[0]);
  }

  return null;
}

export async function getAllBlogSlugs(): Promise<string[]> {
  const contentfulClient = getClient();

  const response = await contentfulClient.getEntries<BlogPageSkeleton>({
    content_type: "blogPage",
    select: ["fields.slug", "fields.title"],
    limit: 1000,
  });

  return response.items.map(
    (item) => (item.fields.slug as string) ?? slugify(item.fields.title as string)
  );
}

export async function getRelatedPosts(
  currentSlug: string,
  tags: string[],
  limit = 3
): Promise<BlogPostSummary[]> {
  if (tags.length === 0) {
    return [];
  }

  const contentfulClient = getClient();

  const response = await contentfulClient.getEntries<BlogPageSkeleton>({
    content_type: "blogPage",
    "fields.tags[in]": tags.join(","),
    limit: limit + 1,
  });

  return response.items
    .map(transformBlogPost)
    .filter((post) => post.slug !== currentSlug)
    .slice(0, limit)
    .map(toSummary);
}
