interface SlabUser {
  id: string;
  name: string;
  email: string;
  title?: string;
}

export interface SlabTopic {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  posts?: SlabPost[];
  postCount?: number;
  children?: SlabTopic[];
}

export interface SlabPost {
  id: string;
  title: string;
  content: string;
  insertedAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  linkAccess: "internal" | "external";
  version: number;
  owner: SlabUser;
  topics: SlabTopic[];
}

export interface SlabSearchResult {
  title: string;
  highlight?: string;
  post: SlabPost;
}

interface SlabPostSummary {
  id: string;
  title: string;
  url: string;
  contentPreview: string;
  status: "published" | "draft" | "archived";
  updatedAt: string;
  author: string;
  topics: string[];
}

export type RawPost = {
  id: string;
  title: string;
  content: unknown;
  insertedAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  linkAccess: string;
  version: number;
  owner?: {
    id?: string;
    name?: string;
    email?: string;
    title?: string;
  } | null;
  topics?: Array<{
    id: string;
    name?: string | null;
    description?: unknown;
    parent?: { id: string } | null;
  }> | null;
};
