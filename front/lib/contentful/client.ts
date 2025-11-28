import type { Document } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";
import type { Asset, ContentfulClientApi, Entry } from "contentful";
import { createClient } from "contentful";

import type {
  BlogImage,
  BlogPageSkeleton,
  BlogPost,
  BlogPostSummary,
} from "@app/lib/contentful/types";
import { isString, normalizeError } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { slugify } from "@app/types/shared/utils/string_utils";

let client: ContentfulClientApi<undefined> | null = null;

function getClient() {
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
  return client.withoutUnresolvableLinks;
}

function contentfulAssetToBlogImage(
  asset: Asset | undefined,
  fallbackAlt: string
): BlogImage | null {
  if (!asset?.fields?.file) {
    return null;
  }

  const file = asset.fields.file;
  if (!isString(file.url)) {
    return null;
  }

  const imageDetails =
    file.details && "image" in file.details ? file.details.image : undefined;

  if (!imageDetails?.width || !imageDetails?.height) {
    return null;
  }

  return {
    url: `https:${file.url}`,
    alt: isString(asset.fields.title) ? asset.fields.title : fallbackAlt,
    width: imageDetails.width,
    height: imageDetails.height,
  };
}

const EMPTY_DOCUMENT: Document = {
  nodeType: BLOCKS.DOCUMENT,
  data: {},
  content: [],
};

function isDocument(value: unknown): value is Document {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

function isAsset(value: unknown): value is Asset {
  return typeof value === "object" && value !== null && "sys" in value;
}

function contentfulEntryToBlogPost(entry: Entry<BlogPageSkeleton>): BlogPost {
  const { fields, sys } = entry;

  const titleField = fields.title;
  const title = isString(titleField) ? titleField : "";

  const slugField = fields.slug;
  const slug = isString(slugField) ? slugField : slugify(title);

  const tagsField = fields.tags;
  const tags = Array.isArray(tagsField) ? tagsField : [];

  const publishedAtField = fields.publishedAt;
  const publishedAt = isString(publishedAtField)
    ? publishedAtField
    : sys.createdAt;

  const body = isDocument(fields.body) ? fields.body : EMPTY_DOCUMENT;
  const image = isAsset(fields.image) ? fields.image : undefined;

  return {
    id: sys.id,
    slug,
    title,
    description: null,
    body,
    tags,
    image: contentfulAssetToBlogImage(image, title),
    createdAt: publishedAt,
    updatedAt: sys.updatedAt,
  };
}

function contentfulEntryToBlogPostSummary(post: BlogPost): BlogPostSummary {
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

export async function getAllBlogPosts(): Promise<
  Result<BlogPostSummary[], Error>
> {
  try {
    const contentfulClient = getClient();

    const response = await contentfulClient.getEntries<BlogPageSkeleton>({
      content_type: "blogPage",
      limit: 1000,
    });

    const posts = response.items
      .map(contentfulEntryToBlogPost)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map(contentfulEntryToBlogPostSummary);

    return new Ok(posts);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function getBlogPostBySlug(
  slug: string
): Promise<Result<BlogPost | null, Error>> {
  try {
    const contentfulClient = getClient();

    const queryParams = {
      content_type: "blogPage",
      "fields.slug": slug,
      limit: 1,
    };

    const response =
      await contentfulClient.getEntries<BlogPageSkeleton>(queryParams);

    if (response.items.length > 0) {
      return new Ok(contentfulEntryToBlogPost(response.items[0]));
    }

    return new Ok(null);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function getRelatedPosts(
  currentSlug: string,
  tags: string[],
  limit = 3
): Promise<Result<BlogPostSummary[], Error>> {
  if (tags.length === 0) {
    return new Ok([]);
  }

  try {
    const contentfulClient = getClient();

    const queryParams = {
      content_type: "blogPage",
      "fields.tags[in]": tags.join(","),
      limit: limit + 1,
    };

    const response =
      await contentfulClient.getEntries<BlogPageSkeleton>(queryParams);

    const posts = response.items
      .map(contentfulEntryToBlogPost)
      .filter((post: BlogPost) => post.slug !== currentSlug)
      .slice(0, limit)
      .map(contentfulEntryToBlogPostSummary);

    return new Ok(posts);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
