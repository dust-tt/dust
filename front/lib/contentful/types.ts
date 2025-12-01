import type { Document } from "@contentful/rich-text-types";
import type { Asset, Entry, EntrySkeletonType } from "contentful";

export interface AuthorFields {
  name?: string;
  image?: Asset;
  email?: string;
}

export type AuthorSkeleton = EntrySkeletonType<AuthorFields, "author">;

export interface BlogPageFields {
  title: string;
  slug?: string;
  body: Document;
  tags?: string[];
  image?: Asset;
  publishedAt?: string;
  authors?: Entry<AuthorSkeleton>[];
}

export type BlogPageSkeleton = EntrySkeletonType<BlogPageFields, "blogPage">;

export interface BlogImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface BlogAuthor {
  name: string;
  image: BlogImage | null;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: Document;
  tags: string[];
  image: BlogImage | null;
  authors: BlogAuthor[];
  createdAt: string;
  updatedAt: string;
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  image: BlogImage | null;
  createdAt: string;
}

export interface BlogListingPageProps {
  posts: BlogPostSummary[];
  gtmTrackingId: string | null;
}

export interface BlogPostPageProps {
  post: BlogPost;
  relatedPosts: BlogPostSummary[];
  gtmTrackingId: string | null;
  preview?: boolean;
}
