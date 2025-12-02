import type { Document } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";
import type { Asset, ContentfulClientApi, Entry } from "contentful";
import { createClient } from "contentful";

import type {
  AuthorSkeleton,
  BlogAuthor,
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
let previewClient: ContentfulClientApi<undefined> | null = null;

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

function getPreviewClient() {
  if (!previewClient) {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const previewToken = process.env.CONTENTFUL_PREVIEW_TOKEN;

    if (!spaceId || !previewToken) {
      throw new Error(
        "Contentful preview credentials not configured. " +
          "Set CONTENTFUL_SPACE_ID and CONTENTFUL_PREVIEW_TOKEN environment variables."
      );
    }

    previewClient = createClient({
      space: spaceId,
      accessToken: previewToken,
      host: "preview.contentful.com",
      environment: process.env.CONTENTFUL_ENVIRONMENT ?? "master",
    });
  }
  return previewClient.withoutUnresolvableLinks;
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

/**
 * Extracts plain text from a Contentful rich text document.
 * Used to generate SEO descriptions from blog post bodies.
 */
function extractPlainText(document: Document): string {
  const extractFromNodes = (nodes: Document["content"]): string => {
    return nodes
      .map((node) => {
        if ("value" in node && typeof node.value === "string") {
          return node.value;
        }
        if ("content" in node && Array.isArray(node.content)) {
          return extractFromNodes(node.content as Document["content"]);
        }
        return "";
      })
      .join(" ");
  };

  return extractFromNodes(document.content).replace(/\s+/g, " ").trim();
}

/**
 * Generates a description for SEO from blog post body text.
 * Truncates to ~160 characters at a word boundary.
 */
function generateDescription(body: Document): string {
  const plainText = extractPlainText(body);

  if (plainText.length <= 160) {
    return plainText;
  }

  // Truncate at word boundary before 160 chars
  const truncated = plainText.slice(0, 160);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 100) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

// Utility type for Contentful's withoutUnresolvableLinks behavior
type MaybeUnresolved<T> = T | { [x: string]: undefined } | undefined;

function isContentfulDocument(
  value: MaybeUnresolved<Document>
): value is Document {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType !== undefined
  );
}

function isContentfulAsset(value: MaybeUnresolved<Asset>): value is Asset {
  return (
    typeof value === "object" &&
    value !== null &&
    "sys" in value &&
    "fields" in value
  );
}

function isContentfulEntry(
  value: MaybeUnresolved<Entry<AuthorSkeleton>>
): value is Entry<AuthorSkeleton> {
  return (
    typeof value === "object" &&
    value !== null &&
    "sys" in value &&
    "fields" in value
  );
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function contentfulEntryToAuthor(
  entry: Entry<AuthorSkeleton> | undefined
): BlogAuthor | null {
  if (!entry?.fields) {
    return null;
  }

  const name = isString(entry.fields.name) ? entry.fields.name : "";
  if (!name) {
    return null;
  }

  const image = isContentfulAsset(entry.fields.image)
    ? contentfulAssetToBlogImage(entry.fields.image, name)
    : null;

  return { name, image };
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

  const body = isContentfulDocument(fields.body) ? fields.body : EMPTY_DOCUMENT;
  const image = isContentfulAsset(fields.image) ? fields.image : undefined;
  const authors = Array.isArray(fields.authors)
    ? fields.authors
        .filter(isContentfulEntry)
        .map(contentfulEntryToAuthor)
        .filter(isNonNull)
    : [];

  return {
    id: sys.id,
    slug,
    title,
    description: generateDescription(body),
    body,
    tags,
    image: contentfulAssetToBlogImage(image, title),
    authors,
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

export async function getAllBlogPosts(
  preview = false
): Promise<Result<BlogPostSummary[], Error>> {
  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

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
  slug: string,
  preview = false
): Promise<Result<BlogPost | null, Error>> {
  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

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
  limit = 3,
  preview = false
): Promise<Result<BlogPostSummary[], Error>> {
  if (tags.length === 0) {
    return new Ok([]);
  }

  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

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
