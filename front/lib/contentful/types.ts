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

// Customer Story types

export interface CustomerStoryFields {
  // Required
  title: string;
  slug: string;
  companyName: string;
  body: Document;
  industry: string;
  industries?: string[];
  department: string[];

  // Customer info (optional)
  companyLogo?: Asset;
  companyWebsite?: string;

  // Contact person (optional)
  contactName?: string;
  contactTitle?: string;
  contactPhoto?: Asset;

  // Metrics (optional)
  headlineMetric?: string;
  keyHighlight?: Document;

  // Filtering (optional)
  companySize?: string;
  region?: string[];

  // Media (optional)
  heroImage?: Asset;
  gallery?: Asset[];

  // Publishing
  publishedAt?: string;
  featured?: boolean;

  // SEO
  metaDescription?: string;

  // UTM tracking
  utmCampaign?: string;
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
  companyWebsite: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhoto: BlogImage | null;
  headlineMetric: string | null;
  keyHighlight: Document | null;
  industry: string;
  industries: string[];
  department: string[];
  companySize: string | null;
  region: string[];
  description: string | null;
  body: Document;
  heroImage: BlogImage | null;
  gallery: BlogImage[];
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  utmCampaign: string | null;
}

export interface CustomerStorySummary {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  companyLogo: BlogImage | null;
  headlineMetric: string | null;
  description: string | null;
  heroImage: BlogImage | null;
  industry: string;
  industries: string[];
  department: string[];
  companySize: string | null;
  region: string[];
  featured: boolean;
  createdAt: string;
}

export interface CustomerStoryFilters {
  industry?: string[];
  industries?: string[];
  department?: string[];
  companySize?: string[];
  region?: string[];
  featured?: boolean;
}

export interface CustomerStoryFilterOptions {
  industries: string[];
  departments: string[];
  companySizes: string[];
  regions: string[];
}

export interface CustomerStoryListingPageProps {
  stories: CustomerStorySummary[];
  filterOptions: CustomerStoryFilterOptions;
  gtmTrackingId: string | null;
}

export interface CustomerStoryPageProps {
  story: CustomerStory;
  relatedStories: CustomerStorySummary[];
  gtmTrackingId: string | null;
  preview?: boolean;
}
