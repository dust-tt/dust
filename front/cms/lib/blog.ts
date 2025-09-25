import type { PrismicDocument } from "@prismicio/client";
import { createClient } from "./prismicio";
import type { BlogPostDocument } from "./prismicio-types";

export interface BlogPostType {
  sId: string;
  uid: string;
  title: string;
  description?: string;
  publishedAt: string;
  tags: string[];
  data: BlogPostDocument["data"];
}

export interface BlogListingParams {
  page?: number;
  pageSize?: number;
  tag?: string;
}

/**
 * Fetches all blog posts from Prismic CMS.
 */
export async function getBlogPosts({
  page = 1,
  pageSize = 10,
  tag,
}: BlogListingParams = {}): Promise<{
  posts: BlogPostType[];
  totalPages: number;
}> {
  const client = createClient();

  const predicates = ["document.type", "blog_post"];
  const tagFilters = tag ? ["document.tags", [tag]] : undefined;

  const response = await client.get({
    predicates: predicates as any,
    pageSize,
    page,
    orderings: [{ field: "document.first_publication_date", direction: "desc" }],
    ...(tagFilters && { filters: [tagFilters as any] }),
  });

  const posts: BlogPostType[] = response.results.map((doc) => ({
    sId: doc.id,
    uid: doc.uid || "",
    title: doc.data.meta_title || "Untitled",
    description: doc.data.meta_description || undefined,
    publishedAt: doc.first_publication_date || "",
    tags: doc.tags || [],
    data: doc.data as BlogPostDocument["data"],
  }));

  return {
    posts,
    totalPages: response.total_pages,
  };
}

/**
 * Fetches a single blog post by its UID.
 */
export async function getBlogPost(uid: string): Promise<BlogPostType | null> {
  const client = createClient();

  try {
    const doc = await client.getByUID("blog_post", uid);

    return {
      sId: doc.id,
      uid: doc.uid,
      title: doc.data.meta_title || "Untitled",
      description: doc.data.meta_description || undefined,
      publishedAt: doc.first_publication_date || "",
      tags: doc.tags || [],
      data: doc.data as BlogPostDocument["data"],
    };
  } catch (error) {
    if (error && typeof error === "object" && "message" in error) {
      const message = error.message as string;
      if (message.includes("No documents were returned")) {
        return null;
      }
    }
    throw error;
  }
}

/**
 * Fetches related blog posts based on tags.
 */
export async function getRelatedPosts(
  currentUid: string,
  tags: string[],
  limit = 3
): Promise<BlogPostType[]> {
  if (!tags.length) {
    return [];
  }

  const client = createClient();

  const response = await client.get({
    predicates: ["document.type", "blog_post"] as any,
    filters: [["document.tags", tags] as any],
    pageSize: limit + 1,
    orderings: [{ field: "document.first_publication_date", direction: "desc" }],
  });

  const posts: BlogPostType[] = response.results
    .filter((doc) => doc.uid !== currentUid)
    .slice(0, limit)
    .map((doc) => ({
      sId: doc.id,
      uid: doc.uid || "",
      title: doc.data.meta_title || "Untitled",
      description: doc.data.meta_description || undefined,
      publishedAt: doc.first_publication_date || "",
      tags: doc.tags || [],
      data: doc.data as BlogPostDocument["data"],
    }));

  return posts;
}