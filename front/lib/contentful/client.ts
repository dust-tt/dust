import type { Document } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";
import type { Asset, ContentfulClientApi, Entry, Tag } from "contentful";
import { createClient } from "contentful";
import { z } from "zod";

import config from "@app/lib/api/config";
import type {
  AuthorSkeleton,
  BlogAuthor,
  BlogImage,
  BlogPageSkeleton,
  BlogPost,
  BlogPostSummary,
  ContentSummary,
  Course,
  CourseSkeleton,
  CourseSummary,
  CustomerStory,
  CustomerStoryFilters,
  CustomerStorySkeleton,
  CustomerStorySummary,
  Lesson,
  LessonSkeleton,
} from "@app/lib/contentful/types";
import logger from "@app/logger/logger";
import { isString, normalizeError } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { slugify } from "@app/types/shared/utils/string_utils";

// ISR revalidation time for all Contentful content (15 minutes)
export const CONTENTFUL_REVALIDATE_SECONDS = 15 * 60;

let client: ContentfulClientApi<undefined> | null = null;
let previewClient: ContentfulClientApi<undefined> | null = null;

let tagNameCache: Map<string, string> | null = null;
let tagNameCacheTimestamp: number | null = null;

function getClient() {
  if (!client) {
    const spaceId = config.getContentfulSpaceId();
    const accessToken = config.getContentfulAccessToken();

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
    const spaceId = config.getContentfulSpaceId();
    const previewToken = config.getContentfulPreviewToken();

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

export function buildPreviewQueryString(isPreview: boolean): string {
  return isPreview
    ? `?preview=true&secret=${config.getContentfulPreviewSecret()}`
    : "";
}

export function isPreviewMode(resolvedUrl: string): boolean {
  const searchParams = new URLSearchParams(resolvedUrl.split("?")[1]);
  const preview = searchParams.get("preview");
  const secret = searchParams.get("secret");
  const previewSecret = config.getContentfulPreviewSecret();

  return preview === "true" && !!previewSecret && secret === previewSecret;
}

function getContentfulClient(resolvedUrl: string) {
  return isPreviewMode(resolvedUrl) ? getPreviewClient() : getClient();
}

async function getTagNameMap(
  resolvedUrl: string
): Promise<Map<string, string>> {
  const now = Date.now();
  const isCacheStale =
    !tagNameCache ||
    !tagNameCacheTimestamp ||
    now - tagNameCacheTimestamp > CONTENTFUL_REVALIDATE_SECONDS * 1000;

  if (!isCacheStale && tagNameCache) {
    return tagNameCache;
  }

  try {
    const contentfulClient = getContentfulClient(resolvedUrl);
    const tags = await contentfulClient.getTags();

    tagNameCache = new Map();
    tags.items.forEach((tag: Tag) => {
      tagNameCache!.set(tag.sys.id, tag.name);
    });
    tagNameCacheTimestamp = now;

    return tagNameCache;
  } catch (error) {
    logger.error({ error }, "[Contentful] Failed to get tag name map");
    return new Map();
  }
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
 * Cleans embedded entries in a rich text document to prevent circular references.
 * Removes nested rich text content from embedded entries, keeping only basic fields.
 */
function cleanDocumentEmbeddedEntries(document: Document): Document {
  if (!document || !document.content) {
    return document;
  }

  const cleanNode = (node: unknown): unknown => {
    if (
      typeof node === "object" &&
      node !== null &&
      "nodeType" in node &&
      node.nodeType === BLOCKS.EMBEDDED_ENTRY &&
      "data" in node &&
      node.data &&
      typeof node.data === "object" &&
      "target" in node.data &&
      node.data.target &&
      typeof node.data.target === "object"
    ) {
      const entry = node.data.target as {
        sys?: unknown;
        fields?: Record<string, unknown>;
      };

      // Only clean if entry has fields, otherwise preserve as-is
      if (entry.fields && typeof entry.fields === "object") {
        // Keep only basic fields for embedded entries to prevent circular references
        return {
          ...node,
          data: {
            ...(node.data as Record<string, unknown>),
            target: {
              sys: entry.sys,
              fields: {
                title: entry.fields.title,
                slug: entry.fields.slug,
                description: entry.fields.description,
                courseId: entry.fields.courseId,
                estimatedDurationMinutes: entry.fields.estimatedDurationMinutes,
              },
            },
          },
        };
      }
      // If entry structure is invalid, return node as-is
      return node;
    }

    // For embedded assets or other node types, preserve as-is
    if (
      typeof node === "object" &&
      node !== null &&
      "content" in node &&
      Array.isArray(node.content)
    ) {
      return {
        ...node,
        content: node.content.map(cleanNode),
      };
    }

    return node;
  };

  return {
    ...document,
    content: document.content.map(cleanNode) as Document["content"],
  };
}

/**
 * Extracts plain text from a Contentful rich text document.
 * Used to generate SEO descriptions from blog post bodies.
 */
function extractPlainText(document: Document): string {
  const extractFromNodes = (nodes: Document["content"]): string => {
    return nodes
      .map((node) => {
        if ("value" in node && isString(node.value)) {
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

function isTagLink(
  value: unknown
): value is { sys: { id: string; type: "Link"; linkType: "Tag" } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "sys" in value &&
    typeof value.sys === "object" &&
    value.sys !== null &&
    "id" in value.sys &&
    typeof value.sys.id === "string"
  );
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

function contentfulEntryToBlogPost(
  entry: Entry<BlogPageSkeleton>,
  tagNameMap: Map<string, string>
): BlogPost {
  const { fields, sys, metadata } = entry;

  const titleField = fields.title;
  const title = isString(titleField) ? titleField : "";

  const slugField = fields.slug;
  const slug = isString(slugField) ? slugField : slugify(title);

  const tags: string[] = [];
  if (metadata?.tags && Array.isArray(metadata.tags)) {
    for (const tagLink of metadata.tags) {
      if (isTagLink(tagLink)) {
        const tagName = tagNameMap.get(tagLink.sys.id) ?? tagLink.sys.id;
        tags.push(tagName);
      }
    }
  }

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
  const isSeoArticleField = fields.isSeoArticle;
  const isSeoArticle =
    typeof isSeoArticleField === "boolean" && isSeoArticleField;

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
    isSeoArticle,
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
    isSeoArticle: post.isSeoArticle,
  };
}

export async function getAllBlogPosts(
  resolvedUrl: string = ""
): Promise<Result<BlogPostSummary[], Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);
    const tagNameMap = await getTagNameMap(resolvedUrl);

    const response = await contentfulClient.getEntries<BlogPageSkeleton>({
      content_type: "blogPage",
      limit: 1000,
    });

    const posts = response.items
      .map((entry) => contentfulEntryToBlogPost(entry, tagNameMap))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map(contentfulEntryToBlogPostSummary);

    return new Ok(posts);
  } catch (error) {
    logger.error({ error }, "[Contentful] Failed to get all blog posts");
    return new Err(normalizeError(error));
  }
}

export async function getBlogPostBySlug(
  slug: string,
  resolvedUrl: string
): Promise<Result<BlogPost | null, Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);
    const tagNameMap = await getTagNameMap(resolvedUrl);

    const queryParams = {
      content_type: "blogPage",
      "fields.slug": slug,
      limit: 1,
    };

    const response =
      await contentfulClient.getEntries<BlogPageSkeleton>(queryParams);

    if (response.items.length > 0) {
      return new Ok(contentfulEntryToBlogPost(response.items[0], tagNameMap));
    }

    return new Ok(null);
  } catch (error) {
    logger.error({ error }, "[Contentful] Failed to get blog post by slug");
    return new Err(normalizeError(error));
  }
}

export async function getRelatedPosts(
  currentSlug: string,
  tags: string[],
  limit: number,
  resolvedUrl: string
): Promise<Result<BlogPostSummary[], Error>> {
  if (tags.length === 0) {
    return new Ok([]);
  }

  try {
    const contentfulClient = getContentfulClient(resolvedUrl);
    const tagNameMap = await getTagNameMap(resolvedUrl);

    // Convert tag names to tag IDs for the query
    const tagIds: string[] = [];
    for (const [tagId, tagName] of tagNameMap.entries()) {
      if (tags.includes(tagName)) {
        tagIds.push(tagId);
      }
    }

    if (tagIds.length === 0) {
      return new Ok([]);
    }

    const queryParams = {
      content_type: "blogPage",
      "metadata.tags.sys.id[in]": tagIds.join(","),
      limit: limit + 1,
    };

    const response =
      await contentfulClient.getEntries<BlogPageSkeleton>(queryParams);

    const posts = response.items
      .map((entry) => contentfulEntryToBlogPost(entry, tagNameMap))
      .filter((post: BlogPost) => post.slug !== currentSlug)
      .slice(0, limit)
      .map(contentfulEntryToBlogPostSummary);

    return new Ok(posts);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Customer Story functions

// Zod schema for customer story filters
const CustomerStoryFiltersSchema = z.object({
  industry: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  department: z.array(z.string()).optional(),
  companySize: z.array(z.string()).optional(),
  region: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
});

function buildCustomerStoryQuery(
  filters?: CustomerStoryFilters,
  options?: {
    limit?: number;
    slug?: string;
    industry?: string;
    industriesIn?: string[];
    departmentIn?: string[];
  }
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {
    content_type: "customerStory",
    limit: options?.limit ?? 1000,
  };

  if (options?.slug) {
    query["fields.slug"] = options.slug;
  }

  if (options?.industry) {
    query["fields.industry"] = options.industry;
  }

  if (options?.industriesIn && options.industriesIn.length > 0) {
    query["fields.industries[in]"] = options.industriesIn.join(",");
  }

  if (options?.departmentIn && options.departmentIn.length > 0) {
    query["fields.department[in]"] = options.departmentIn.join(",");
  }

  if (filters) {
    const result = CustomerStoryFiltersSchema.safeParse(filters);

    if (result.success) {
      const parsed = result.data;
      if (parsed.industry && parsed.industry.length > 0) {
        query["fields.industry[in]"] = parsed.industry.join(",");
      }
      if (parsed.industries && parsed.industries.length > 0) {
        query["fields.industries[in]"] = parsed.industries.join(",");
      }
      if (parsed.department && parsed.department.length > 0) {
        query["fields.department[in]"] = parsed.department.join(",");
      }
      if (parsed.companySize && parsed.companySize.length > 0) {
        query["fields.companySize[in]"] = parsed.companySize.join(",");
      }
      if (parsed.region && parsed.region.length > 0) {
        query["fields.region[in]"] = parsed.region.join(",");
      }
      if (parsed.featured !== undefined) {
        query["fields.featured"] = parsed.featured;
      }
    }
  }

  return query;
}

// Zod schema for parsing Contentful customer story fields
const CustomerStoryFieldsSchema = z.object({
  title: z.string().default(""),
  slug: z.string().optional(),
  companyName: z.string().default(""),
  industry: z.string().default(""),
  industries: z.array(z.string()).default([]),
  department: z.array(z.string()).default([]),
  publishedAt: z.string().optional(),
  metaDescription: z.string().optional(),
  companyWebsite: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactTitle: z.string().nullable().optional(),
  headlineMetric: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  region: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  utmCampaign: z.string().nullable().optional(),
});

function contentfulEntryToCustomerStory(
  entry: Entry<CustomerStorySkeleton>
): CustomerStory | null {
  const { fields, sys } = entry;
  const result = CustomerStoryFieldsSchema.safeParse(fields);

  if (!result.success) {
    return null;
  }

  const parsed = result.data;
  const slug = parsed.slug ?? slugify(parsed.title);

  // Check assets and rich text fields
  const body = isContentfulDocument(fields.body) ? fields.body : EMPTY_DOCUMENT;
  const keyHighlight = isContentfulDocument(fields.keyHighlight)
    ? fields.keyHighlight
    : null;
  const heroImage = isContentfulAsset(fields.heroImage)
    ? fields.heroImage
    : undefined;
  const companyLogo = isContentfulAsset(fields.companyLogo)
    ? fields.companyLogo
    : undefined;
  const contactPhoto = isContentfulAsset(fields.contactPhoto)
    ? fields.contactPhoto
    : undefined;
  const gallery = Array.isArray(fields.gallery)
    ? fields.gallery.filter(isContentfulAsset)
    : [];

  return {
    id: sys.id,
    slug,
    title: parsed.title,
    companyName: parsed.companyName,
    companyLogo: contentfulAssetToBlogImage(companyLogo, parsed.companyName),
    companyWebsite: parsed.companyWebsite ?? null,
    contactName: parsed.contactName ?? null,
    contactTitle: parsed.contactTitle ?? null,
    contactPhoto: contentfulAssetToBlogImage(contactPhoto, "Contact photo"),
    headlineMetric: parsed.headlineMetric ?? null,
    keyHighlight,
    industry: parsed.industry,
    industries: parsed.industries,
    department: parsed.department,
    companySize: parsed.companySize ?? null,
    region: parsed.region ?? [],
    description: parsed.metaDescription ?? generateDescription(body),
    body,
    heroImage: contentfulAssetToBlogImage(heroImage, parsed.title),
    gallery: gallery
      .map((asset) => contentfulAssetToBlogImage(asset, parsed.title))
      .filter((img): img is BlogImage => img !== null),
    featured: parsed.featured,
    createdAt: parsed.publishedAt ?? sys.createdAt,
    updatedAt: sys.updatedAt,
    utmCampaign: parsed.utmCampaign ?? null,
  };
}

function contentfulEntryToCustomerStorySummary(
  story: CustomerStory
): CustomerStorySummary {
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    companyName: story.companyName,
    companyLogo: story.companyLogo,
    headlineMetric: story.headlineMetric,
    description: story.description,
    heroImage: story.heroImage,
    industry: story.industry,
    industries: story.industries,
    department: story.department,
    companySize: story.companySize,
    region: story.region,
    featured: story.featured,
    createdAt: story.createdAt,
  };
}

export async function getAllCustomerStories(
  resolvedUrl: string = "",
  filters?: CustomerStoryFilters
): Promise<Result<CustomerStorySummary[], Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);
    const query = buildCustomerStoryQuery(filters);

    const response =
      await contentfulClient.getEntries<CustomerStorySkeleton>(query);

    const stories = response.items
      .map(contentfulEntryToCustomerStory)
      .filter(isNonNull)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map(contentfulEntryToCustomerStorySummary);

    return new Ok(stories);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function getCustomerStoryBySlug(
  slug: string,
  resolvedUrl: string
): Promise<Result<CustomerStory | null, Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);
    const query = buildCustomerStoryQuery(undefined, { slug, limit: 1 });

    const response =
      await contentfulClient.getEntries<CustomerStorySkeleton>(query);

    if (response.items.length > 0) {
      return new Ok(contentfulEntryToCustomerStory(response.items[0]));
    }

    return new Ok(null);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function getRelatedCustomerStories(
  currentSlug: string,
  industries: string[],
  department: string[],
  limit: number,
  resolvedUrl: string
): Promise<Result<CustomerStorySummary[], Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);

    let stories: CustomerStorySummary[] = [];

    // First try to find stories in the same industries
    if (industries.length > 0) {
      const industriesQuery = buildCustomerStoryQuery(undefined, {
        industriesIn: industries,
        limit: limit + 1,
      });

      const response =
        await contentfulClient.getEntries<CustomerStorySkeleton>(
          industriesQuery
        );

      stories = response.items
        .map(contentfulEntryToCustomerStory)
        .filter(isNonNull)
        .filter((story) => story.slug !== currentSlug)
        .slice(0, limit)
        .map(contentfulEntryToCustomerStorySummary);
    }

    // If we don't have enough stories, try by department
    if (stories.length < limit && department.length > 0) {
      const deptQuery = buildCustomerStoryQuery(undefined, {
        departmentIn: department,
        limit: limit + 1,
      });

      const deptResponse =
        await contentfulClient.getEntries<CustomerStorySkeleton>(deptQuery);

      const additionalStories = deptResponse.items
        .map(contentfulEntryToCustomerStory)
        .filter(isNonNull)
        .filter(
          (story) =>
            story.slug !== currentSlug &&
            !stories.some((s) => s.slug === story.slug)
        )
        .slice(0, limit - stories.length)
        .map(contentfulEntryToCustomerStorySummary);

      stories.push(...additionalStories);
    }

    return new Ok(stories);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Course functions

function isContentfulCourseEntry(
  value: MaybeUnresolved<Entry<CourseSkeleton>>
): value is Entry<CourseSkeleton> {
  return (
    typeof value === "object" &&
    value !== null &&
    "sys" in value &&
    "fields" in value
  );
}

function contentfulEntryToCourseSummary(
  entry: Entry<CourseSkeleton> | undefined
): CourseSummary | null {
  if (!entry?.fields) {
    return null;
  }

  const titleField = entry.fields.title;
  const title = isString(titleField) ? titleField : "";

  const slugField = entry.fields.slug;
  const slug = isString(slugField) ? slugField : slugify(title);

  const courseIdField = entry.fields.courseId;
  const courseId = isString(courseIdField) ? courseIdField : null;

  const descriptionField = entry.fields.description;
  const description = isString(descriptionField) ? descriptionField : null;

  const dateOfAdditionField = entry.fields.dateOfAddition;
  const dateOfAddition = isString(dateOfAdditionField)
    ? dateOfAdditionField
    : null;

  const estimatedDurationMinutesField = entry.fields.estimatedDurationMinutes;
  const estimatedDurationMinutes =
    typeof estimatedDurationMinutesField === "number"
      ? estimatedDurationMinutesField
      : null;

  const image = isContentfulAsset(entry.fields.courseImage)
    ? contentfulAssetToBlogImage(entry.fields.courseImage, title)
    : null;

  return {
    id: entry.sys.id,
    slug,
    title,
    description,
    courseId,
    dateOfAddition,
    estimatedDurationMinutes,
    image,
    createdAt: entry.sys.createdAt,
  };
}

function contentfulEntryToCourse(entry: Entry<CourseSkeleton>): Course | null {
  const { fields, sys } = entry;

  const titleField = fields.title;
  const title = isString(titleField) ? titleField : "";

  const slugField = fields.slug;
  const slug = isString(slugField) ? slugField : slugify(title);

  const courseIdField = fields.courseId;
  const courseId = isString(courseIdField) ? courseIdField : null;

  const descriptionField = fields.description;
  const description = isString(descriptionField) ? descriptionField : null;

  const dateOfAdditionField = fields.dateOfAddition;
  const dateOfAddition = isString(dateOfAdditionField)
    ? dateOfAdditionField
    : null;

  const estimatedDurationMinutesField = fields.estimatedDurationMinutes;
  const estimatedDurationMinutes =
    typeof estimatedDurationMinutesField === "number"
      ? estimatedDurationMinutesField
      : null;

  const courseContent = isContentfulDocument(fields.courseContent)
    ? cleanDocumentEmbeddedEntries(fields.courseContent)
    : EMPTY_DOCUMENT;

  const preRequisites = isContentfulDocument(fields.preRequisites)
    ? fields.preRequisites
    : null;

  const tableOfContentsField = fields.tableOfContents;
  const tableOfContents = isString(tableOfContentsField)
    ? tableOfContentsField
    : null;

  const image = isContentfulAsset(fields.courseImage)
    ? contentfulAssetToBlogImage(fields.courseImage, title)
    : null;

  const previousCourse = isContentfulCourseEntry(fields.previousCourse)
    ? contentfulEntryToCourseSummary(fields.previousCourse)
    : null;

  const nextCourse = isContentfulCourseEntry(fields.nextCourse)
    ? contentfulEntryToCourseSummary(fields.nextCourse)
    : null;

  const author = isContentfulEntry(fields.author)
    ? contentfulEntryToAuthor(fields.author)
    : null;

  return {
    id: sys.id,
    slug,
    title,
    description,
    courseId,
    dateOfAddition,
    estimatedDurationMinutes,
    courseContent,
    preRequisites,
    tableOfContents,
    image,
    author,
    previousCourse,
    nextCourse,
    createdAt: sys.createdAt,
    updatedAt: sys.updatedAt,
  };
}

export async function getAllCourses(
  resolvedUrl: string = ""
): Promise<Result<CourseSummary[], Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);

    const response = await contentfulClient.getEntries<CourseSkeleton>({
      content_type: "course",
      limit: 1000,
    });

    const courses = response.items
      .map((entry) => contentfulEntryToCourse(entry))
      .filter(isNonNull)
      .sort((a, b) => {
        // Sort by courseId if available, otherwise by dateOfAddition or createdAt
        if (a.courseId && b.courseId) {
          const aNum = parseFloat(a.courseId);
          const bNum = parseFloat(b.courseId);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
          }
          return a.courseId.localeCompare(b.courseId);
        }
        // Use dateOfAddition if available, otherwise fall back to createdAt
        const aDate = a.dateOfAddition
          ? new Date(a.dateOfAddition).getTime()
          : new Date(a.createdAt).getTime();
        const bDate = b.dateOfAddition
          ? new Date(b.dateOfAddition).getTime()
          : new Date(b.createdAt).getTime();
        return bDate - aDate;
      })
      .map((course) => ({
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        courseId: course.courseId,
        dateOfAddition: course.dateOfAddition,
        estimatedDurationMinutes: course.estimatedDurationMinutes,
        image: course.image,
        createdAt: course.createdAt,
      }));

    return new Ok(courses);
  } catch (error) {
    logger.error({ error }, "[Contentful] Failed to get all courses");
    return new Err(normalizeError(error));
  }
}

export async function getCourseBySlug(
  slug: string,
  resolvedUrl: string
): Promise<Result<Course | null, Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);

    const queryParams = {
      content_type: "course",
      "fields.slug": slug,
      limit: 1,
      include: 1 as const, // Allow one level for embedded entries/assets in rich text, but prevent deep circular references
    };

    const response =
      await contentfulClient.getEntries<CourseSkeleton>(queryParams);

    if (response.items.length > 0) {
      const course = contentfulEntryToCourse(response.items[0]);
      return new Ok(course);
    }

    return new Ok(null);
  } catch (error) {
    logger.error({ error }, "[Contentful] Failed to get course by slug");
    return new Err(normalizeError(error));
  }
}

// Lesson functions

function contentfulEntryToLessonSummary(
  entry: Entry<LessonSkeleton | CourseSkeleton> | undefined
): ContentSummary | null {
  if (!entry?.fields) {
    return null;
  }

  // Check if it's a lesson or course
  const contentType = entry.sys.contentType?.sys.id;
  if (contentType === "lesson") {
    const lessonEntry = entry as Entry<LessonSkeleton>;
    const titleField = lessonEntry.fields.title;
    const title = isString(titleField) ? titleField : "";

    const slugField = lessonEntry.fields.slug;
    const slug = isString(slugField) ? slugField : slugify(title);

    const courseIdField = lessonEntry.fields.courseId;
    const courseId = isString(courseIdField) ? courseIdField : null;

    const descriptionField = lessonEntry.fields.description;
    const description = isString(descriptionField) ? descriptionField : null;

    const estimatedDurationMinutesField =
      lessonEntry.fields.estimatedDurationMinutes;
    const estimatedDurationMinutes =
      typeof estimatedDurationMinutesField === "number"
        ? estimatedDurationMinutesField
        : null;

    return {
      id: lessonEntry.sys.id,
      slug,
      title,
      description,
      courseId,
      estimatedDurationMinutes,
      createdAt: lessonEntry.sys.createdAt,
    };
  } else if (contentType === "course") {
    return contentfulEntryToCourseSummary(entry as Entry<CourseSkeleton>);
  }

  return null;
}

function contentfulEntryToLesson(entry: Entry<LessonSkeleton>): Lesson | null {
  const { fields, sys } = entry;

  const titleField = fields.title;
  const title = isString(titleField) ? titleField : "";

  const slugField = fields.slug;
  const slug = isString(slugField) ? slugField : slugify(title);

  const courseIdField = fields.courseId;
  const courseId = isString(courseIdField) ? courseIdField : null;

  const descriptionField = fields.description;
  const description = isString(descriptionField) ? descriptionField : null;

  const dateOfAdditionField = fields.dateOfAddition;
  const dateOfAddition = isString(dateOfAdditionField)
    ? dateOfAdditionField
    : null;

  const estimatedDurationMinutesField = fields.estimatedDurationMinutes;
  const estimatedDurationMinutes =
    typeof estimatedDurationMinutesField === "number"
      ? estimatedDurationMinutesField
      : null;

  const lessonObjectivesField = fields.lessonObjectives;
  const lessonObjectives = isString(lessonObjectivesField)
    ? lessonObjectivesField
    : null;

  const lessonContent = isContentfulDocument(fields.lessonContent)
    ? cleanDocumentEmbeddedEntries(fields.lessonContent)
    : EMPTY_DOCUMENT;

  const preRequisites = isContentfulDocument(fields.preRequisites)
    ? fields.preRequisites
    : null;

  const previousContentEntry = fields.previousContent;
  let previousContent: ContentSummary | null = null;
  if (
    previousContentEntry &&
    typeof previousContentEntry === "object" &&
    "sys" in previousContentEntry &&
    previousContentEntry.sys &&
    "fields" in previousContentEntry
  ) {
    previousContent = contentfulEntryToLessonSummary(
      previousContentEntry as unknown as Entry<CourseSkeleton | LessonSkeleton>
    );
  }

  const nextContentEntry = fields.nextContent;
  let nextContent: ContentSummary | null = null;
  if (
    nextContentEntry &&
    typeof nextContentEntry === "object" &&
    "sys" in nextContentEntry &&
    nextContentEntry.sys &&
    "fields" in nextContentEntry
  ) {
    nextContent = contentfulEntryToLessonSummary(
      nextContentEntry as unknown as Entry<CourseSkeleton | LessonSkeleton>
    );
  }

  return {
    id: sys.id,
    slug,
    title,
    description,
    courseId,
    dateOfAddition,
    estimatedDurationMinutes,
    lessonObjectives,
    lessonContent,
    preRequisites,
    previousContent,
    nextContent,
    createdAt: sys.createdAt,
    updatedAt: sys.updatedAt,
  };
}

export async function getLessonBySlug(
  slug: string,
  resolvedUrl: string
): Promise<Result<Lesson | null, Error>> {
  try {
    const contentfulClient = getContentfulClient(resolvedUrl);

    const queryParams = {
      content_type: "lesson",
      "fields.slug": slug,
      limit: 1,
      include: 1 as const, // Allow one level for embedded entries/assets in rich text, but prevent deep circular references
    };

    const response =
      await contentfulClient.getEntries<LessonSkeleton>(queryParams);

    if (response.items.length > 0) {
      const lesson = contentfulEntryToLesson(response.items[0]);
      return new Ok(lesson);
    }

    return new Ok(null);
  } catch (error) {
    logger.error({ error }, "[Contentful] Failed to get lesson by slug");
    return new Err(normalizeError(error));
  }
}
