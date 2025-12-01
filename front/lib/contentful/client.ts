import type { Document } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";
import type { Asset, ContentfulClientApi, Entry } from "contentful";
import { createClient } from "contentful";

import type {
  BlogImage,
  BlogPageSkeleton,
  BlogPost,
  BlogPostSummary,
  CustomerStory,
  CustomerStoryFilters,
  CustomerStorySkeleton,
  CustomerStorySummary,
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
    description: generateDescription(body),
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

// Customer Story functions

function contentfulEntryToCustomerStory(
  entry: Entry<CustomerStorySkeleton>
): CustomerStory {
  const { fields, sys } = entry;

  const titleField = fields.title;
  const title = isString(titleField) ? titleField : "";

  const slugField = fields.slug;
  const slug = isString(slugField) ? slugField : slugify(title);

  const companyNameField = fields.companyName;
  const companyName = isString(companyNameField) ? companyNameField : "";

  const industryField = fields.industry;
  const industry = isString(industryField) ? industryField : "";

  const departmentField = fields.department;
  const department = Array.isArray(departmentField) ? departmentField : [];

  const tagsField = fields.tags;
  const tags = Array.isArray(tagsField) ? tagsField : [];

  const secondaryMetricsField = fields.secondaryMetrics;
  const secondaryMetrics = Array.isArray(secondaryMetricsField)
    ? secondaryMetricsField
    : [];

  const publishedAtField = fields.publishedAt;
  const publishedAt = isString(publishedAtField)
    ? publishedAtField
    : sys.createdAt;

  const body = isDocument(fields.body) ? fields.body : EMPTY_DOCUMENT;
  const heroImage = isAsset(fields.heroImage) ? fields.heroImage : undefined;
  const thumbnailImage = isAsset(fields.thumbnailImage)
    ? fields.thumbnailImage
    : undefined;
  const companyLogo = isAsset(fields.companyLogo)
    ? fields.companyLogo
    : undefined;
  const companyLogoWhite = isAsset(fields.companyLogoWhite)
    ? fields.companyLogoWhite
    : undefined;
  const contactPhoto = isAsset(fields.contactPhoto)
    ? fields.contactPhoto
    : undefined;

  const galleryField = fields.gallery;
  const gallery: BlogImage[] = [];
  if (Array.isArray(galleryField)) {
    for (const asset of galleryField) {
      if (isAsset(asset)) {
        const img = contentfulAssetToBlogImage(asset, title);
        if (img) {
          gallery.push(img);
        }
      }
    }
  }

  // Generate description from body or use metaDescription
  const metaDescriptionField = fields.metaDescription;
  const description = isString(metaDescriptionField)
    ? metaDescriptionField
    : generateDescription(body);

  const featuredField = fields.featured;
  const featured = typeof featuredField === "boolean" ? featuredField : false;

  return {
    id: sys.id,
    slug,
    title,
    companyName,
    companyLogo: contentfulAssetToBlogImage(companyLogo, companyName),
    companyLogoWhite: contentfulAssetToBlogImage(
      companyLogoWhite,
      `${companyName} white logo`
    ),
    companyWebsite: isString(fields.companyWebsite)
      ? fields.companyWebsite
      : null,
    contactName: isString(fields.contactName) ? fields.contactName : null,
    contactTitle: isString(fields.contactTitle) ? fields.contactTitle : null,
    contactPhoto: contentfulAssetToBlogImage(contactPhoto, "Contact photo"),
    headlineMetric: isString(fields.headlineMetric)
      ? fields.headlineMetric
      : null,
    secondaryMetrics,
    industry,
    department,
    companySize: isString(fields.companySize) ? fields.companySize : null,
    description,
    body,
    heroImage: contentfulAssetToBlogImage(heroImage, title),
    thumbnailImage: contentfulAssetToBlogImage(
      thumbnailImage ?? heroImage,
      title
    ),
    gallery,
    featured,
    tags,
    createdAt: publishedAt,
    updatedAt: sys.updatedAt,
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
    thumbnailImage: story.thumbnailImage,
    industry: story.industry,
    department: story.department,
    companySize: story.companySize,
    featured: story.featured,
    createdAt: story.createdAt,
  };
}

export async function getAllCustomerStories(
  preview = false,
  filters?: CustomerStoryFilters
): Promise<Result<CustomerStorySummary[], Error>> {
  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

    const queryParams: Record<string, string | number | boolean> = {
      content_type: "customerStory",
      limit: 1000,
    };

    // Apply filters
    if (filters?.industry && filters.industry.length > 0) {
      queryParams["fields.industry[in]"] = filters.industry.join(",");
    }
    if (filters?.department && filters.department.length > 0) {
      queryParams["fields.department[in]"] = filters.department.join(",");
    }
    if (filters?.companySize && filters.companySize.length > 0) {
      queryParams["fields.companySize[in]"] = filters.companySize.join(",");
    }
    if (filters?.featured !== undefined) {
      queryParams["fields.featured"] = filters.featured;
    }

    const response =
      await contentfulClient.getEntries<CustomerStorySkeleton>(queryParams);

    const stories = response.items
      .map(contentfulEntryToCustomerStory)
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
  preview = false
): Promise<Result<CustomerStory | null, Error>> {
  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

    const queryParams = {
      content_type: "customerStory",
      "fields.slug": slug,
      limit: 1,
    };

    const response =
      await contentfulClient.getEntries<CustomerStorySkeleton>(queryParams);

    if (response.items.length > 0) {
      return new Ok(contentfulEntryToCustomerStory(response.items[0]));
    }

    return new Ok(null);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function getFeaturedCustomerStories(
  limit = 5,
  preview = false
): Promise<Result<CustomerStorySummary[], Error>> {
  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

    const queryParams = {
      content_type: "customerStory",
      "fields.featured": true,
      limit,
    };

    const response =
      await contentfulClient.getEntries<CustomerStorySkeleton>(queryParams);

    const stories = response.items
      .map(contentfulEntryToCustomerStory)
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

export async function getRelatedCustomerStories(
  currentSlug: string,
  industry: string,
  department: string[],
  limit = 3,
  preview = false
): Promise<Result<CustomerStorySummary[], Error>> {
  try {
    const contentfulClient = preview ? getPreviewClient() : getClient();

    // First try to find stories in the same industry
    const queryParams: Record<string, string | number> = {
      content_type: "customerStory",
      "fields.industry": industry,
      limit: limit + 1,
    };

    const response =
      await contentfulClient.getEntries<CustomerStorySkeleton>(queryParams);

    let stories = response.items
      .map(contentfulEntryToCustomerStory)
      .filter((story) => story.slug !== currentSlug)
      .slice(0, limit)
      .map(contentfulEntryToCustomerStorySummary);

    // If we don't have enough stories, try by department
    if (stories.length < limit && department.length > 0) {
      const deptQueryParams: Record<string, string | number> = {
        content_type: "customerStory",
        "fields.department[in]": department.join(","),
        limit: limit + 1,
      };

      const deptResponse =
        await contentfulClient.getEntries<CustomerStorySkeleton>(
          deptQueryParams
        );

      const additionalStories = deptResponse.items
        .map(contentfulEntryToCustomerStory)
        .filter(
          (story) =>
            story.slug !== currentSlug &&
            !stories.some((s) => s.slug === story.slug)
        )
        .slice(0, limit - stories.length)
        .map(contentfulEntryToCustomerStorySummary);

      stories = [...stories, ...additionalStories];
    }

    return new Ok(stories);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
