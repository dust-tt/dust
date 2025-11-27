import type { Document } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";
import type { Asset, ContentfulClientApi, Entry } from "contentful";
import { createClient } from "contentful";

import { slugify } from "@app/types/shared/utils/string_utils";

import type {
  BlogImage,
  BlogPageSkeleton,
  BlogPost,
  BlogPostSummary,
} from "./types";

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

function transformImage(
  asset: Asset | undefined,
  fallbackAlt: string
): BlogImage | null {
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
    alt:
      typeof asset.fields.title === "string" ? asset.fields.title : fallbackAlt,
    width: imageDetails?.width ?? 1200,
    height: imageDetails?.height ?? 630,
  };
}

// Helper to safely extract a field value, handling Contentful's union types
function getFieldValue<T>(
  field: T | { [locale: string]: T } | undefined
): T | undefined {
  if (!field) {
    return undefined;
  }
  // Check if it's a Document (has nodeType)
  if (
    typeof field === "object" &&
    !Array.isArray(field) &&
    "nodeType" in field
  ) {
    return field as T;
  }
  // Check if it's an Asset (has sys)
  if (typeof field === "object" && !Array.isArray(field) && "sys" in field) {
    return field as T;
  }
  // Check if it's a simple value (string or array)
  if (typeof field === "string" || Array.isArray(field)) {
    return field as T;
  }
  return undefined;
}

// Create an empty Document for fallback
const EMPTY_DOCUMENT: Document = {
  nodeType: BLOCKS.DOCUMENT,
  data: {},
  content: [],
};

function transformBlogPost(entry: Entry<BlogPageSkeleton>): BlogPost {
  const fields = entry.fields;

  const title = getFieldValue(fields.title) ?? "";
  const slug = getFieldValue(fields.slug) ?? slugify(title);
  const description = getFieldValue(fields.description) ?? null;
  const tags = getFieldValue(fields.tags) ?? [];
  const publishedAt = getFieldValue(fields.publishedAt) ?? entry.sys.createdAt;
  const body = getFieldValue(fields.body) ?? EMPTY_DOCUMENT;
  const image = getFieldValue(fields.image);

  return {
    id: entry.sys.id,
    slug,
    title,
    description,
    body,
    tags,
    image: transformImage(image, title),
    createdAt: publishedAt,
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

export async function getAllBlogPosts(): Promise<BlogPostSummary[]> {
  const contentfulClient = getClient();

  const response = await contentfulClient.getEntries<BlogPageSkeleton>({
    content_type: "blogPage",
    limit: 1000,
  });

  return response.items
    .map(transformBlogPost)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map(toSummary);
}

export async function getBlogPostBySlug(
  slug: string
): Promise<BlogPost | null> {
  const contentfulClient = getClient();

  const queryParams = {
    content_type: "blogPage",
    "fields.slug": slug,
    limit: 1,
  };

  const response =
    await contentfulClient.getEntries<BlogPageSkeleton>(queryParams);

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

  return response.items.map((item) => {
    const fields = item.fields;
    const title = "title" in fields && fields.title ? fields.title : "";
    const slug = "slug" in fields && fields.slug ? fields.slug : slugify(title);
    return slug;
  });
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

  const queryParams = {
    content_type: "blogPage",
    "fields.tags[in]": tags.join(","),
    limit: limit + 1,
  };

  const response =
    await contentfulClient.getEntries<BlogPageSkeleton>(queryParams);

  return response.items
    .map(transformBlogPost)
    .filter((post) => post.slug !== currentSlug)
    .slice(0, limit)
    .map(toSummary);
}
