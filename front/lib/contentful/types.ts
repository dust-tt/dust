import type { Document } from "@contentful/rich-text-types";
import type { Asset, EntrySkeletonType } from "contentful";

export interface BlogPageFields {
  title: string;
  slug?: string;
  body: Document;
  tags?: string[];
  image?: Asset;
  publishedAt?: string;
}

export type BlogPageSkeleton = EntrySkeletonType<BlogPageFields, "blogPage">;

export interface BlogImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: Document;
  tags: string[];
  image: BlogImage | null;
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

// Customer Story types

export interface CustomerStoryFields {
  // Required
  title: string;
  slug: string;
  companyName: string;
  body: Document;
  industry: string;
  department: string[];

  // Customer info (optional)
  companyLogo?: Asset;
  companyLogoWhite?: Asset;
  companyWebsite?: string;

  // Contact person (optional)
  contactName?: string;
  contactTitle?: string;
  contactPhoto?: Asset;

  // Metrics (optional)
  headlineMetric?: string;
  secondaryMetrics?: string[];

  // Filtering (optional)
  companySize?: string;

  // Media (optional)
  heroImage?: Asset;
  thumbnailImage?: Asset;
  gallery?: Asset[];

  // Publishing
  publishedAt?: string;
  featured?: boolean;
  tags?: string[];

  // SEO
  metaDescription?: string;
}

export type CustomerStorySkeleton = EntrySkeletonType<
  CustomerStoryFields,
  "customerStory"
>;

export interface CustomerStory {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  companyLogo: BlogImage | null;
  companyLogoWhite: BlogImage | null;
  companyWebsite: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhoto: BlogImage | null;
  headlineMetric: string | null;
  secondaryMetrics: string[];
  industry: string;
  department: string[];
  companySize: string | null;
  description: string | null;
  body: Document;
  heroImage: BlogImage | null;
  thumbnailImage: BlogImage | null;
  gallery: BlogImage[];
  featured: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStorySummary {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  companyLogo: BlogImage | null;
  headlineMetric: string | null;
  description: string | null;
  thumbnailImage: BlogImage | null;
  industry: string;
  department: string[];
  companySize: string | null;
  featured: boolean;
  createdAt: string;
}

export interface CustomerStoryFilters {
  industry?: string[];
  department?: string[];
  companySize?: string[];
  featured?: boolean;
}

export interface CustomerStoryListingPageProps {
  stories: CustomerStorySummary[];
  gtmTrackingId: string | null;
}

export interface CustomerStoryPageProps {
  story: CustomerStory;
  relatedStories: CustomerStorySummary[];
  gtmTrackingId: string | null;
  preview?: boolean;
}
