import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

import type {
  RawPost,
  SlabPost,
  SlabSearchResult,
  SlabTopic,
} from "./slab_types";

const SLAB_GRAPHQL_URL = "https://api.slab.com/v1/graphql";
export const MAX_LIMIT = 100;

function normalizePost(post: RawPost): SlabPost {
  return {
    id: post.id,
    title: post.title,
    content: deltaToPlainText(post.content),
    insertedAt: post.insertedAt,
    updatedAt: post.updatedAt ?? post.insertedAt ?? "",
    publishedAt: post.publishedAt,
    archivedAt: post.archivedAt,
    linkAccess: post.linkAccess as "internal" | "external",
    version: post.version,
    owner: {
      id: post.owner?.id ?? "",
      name: post.owner?.name ?? "",
      email: post.owner?.email ?? "",
      title: post.owner?.title ?? "",
    },
    topics: (post.topics ?? []).map((topic) => ({
      id: topic.id,
      name: topic.name ?? topic.id,
      description: JSON.stringify(topic.description ?? ""),
      parentId: topic.parent?.id ?? null,
    })),
  };
}

type GraphQLResponse<T> = {
  data: T;
  errors?: Array<{ message: string }>;
};

type DeltaOp = {
  insert?: string | string[];
  [key: string]: unknown;
};

function isDeltaOpArray(value: unknown): value is DeltaOp[] {
  return Array.isArray(value);
}

function isDeltaObject(value: unknown): value is { ops: DeltaOp[] } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("ops" in value)
  ) {
    return false;
  }
  const valueWithOps = value as { ops: unknown };
  return Array.isArray(valueWithOps.ops);
}

async function makeGraphQLRequest<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const response = await fetch(SLAB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as GraphQLResponse<T>;

    if (json.errors?.length) {
      throw new Error(
        `GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`
      );
    }

    return json.data;
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error({ error: normalizedError }, "GraphQL request failed");
    throw normalizedError;
  }
}

function toDeltaOps(delta: unknown): DeltaOp[] {
  if (!delta) {
    return [];
  }

  if (isDeltaOpArray(delta)) {
    return delta;
  }

  if (typeof delta === "string") {
    try {
      const parsed = JSON.parse(delta);
      return toDeltaOps(parsed);
    } catch {
      return [{ insert: delta }];
    }
  }

  if (isDeltaObject(delta)) {
    return delta.ops;
  }

  return [];
}

function deltaToPlainText(delta: unknown): string {
  const ops = toDeltaOps(delta);
  if (!ops.length) {
    return "";
  }

  return ops
    .map((op) =>
      typeof op.insert === "string"
        ? op.insert
        : Array.isArray(op.insert)
          ? op.insert.join("")
          : ""
    )
    .join("");
}

export async function searchPosts(
  accessToken: string,
  query: string,
  limit: number,
  topicId?: string
): Promise<SlabSearchResult[]> {
  if (topicId) {
    const gqlQuery = `
      query GetTopicPosts($topicId: ID!) {
        topic(id: $topicId) {
          posts {
            id
            title
            content
            linkAccess
            insertedAt
            updatedAt
            publishedAt
            archivedAt
            version
            owner {
              id
              name
              email
              title
            }
            topics {
              id
              name
              description
              parent {
                id
              }
            }
          }
        }
      }
    `;

    const data = await makeGraphQLRequest<{
      topic: { posts: any[] } | null;
    }>(accessToken, gqlQuery, { topicId });

    const allPosts = (data.topic?.posts ?? []).map((post) => ({
      title: post.title,
      post: normalizePost(post),
    }));

    allPosts.sort((a, b) => {
      const dateA = new Date(a.post.updatedAt || a.post.insertedAt).getTime();
      const dateB = new Date(b.post.updatedAt || b.post.insertedAt).getTime();
      return dateB - dateA;
    });

    const slicedPosts = allPosts.slice(0, limit);

    return slicedPosts;
  }

  const gqlQuery = `
    query SearchPosts($query: String!, $first: Int!) {
      search(query: $query, types: [POST], first: $first) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ... on PostSearchResult {
              title
              highlight
              post {
                id
                title
                content
                insertedAt
                updatedAt
                publishedAt
                archivedAt
                linkAccess
                owner {
                  id
                  name
                  email
                  title
                }
                topics {
                  id
                  name
                  description
                  parent {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest<{
    search: {
      edges: Array<{ cursor: string; node: any }>;
    };
  }>(accessToken, gqlQuery, {
    query,
    first: limit,
  });

  const results = data.search.edges
    .map((edge) => edge.node)
    .filter((node) => node?.post)
    .map((node) => ({
      title: node.title,
      highlight: node.highlight,
      post: normalizePost(node.post),
    }));

  return results;
}

export async function getPosts(
  accessToken: string,
  postIds: string[]
): Promise<SlabPost[]> {
  if (postIds.length === 0) {
    return [];
  }

  const postFields = `
        id
        title
        content
        linkAccess
        insertedAt
        updatedAt
        publishedAt
        archivedAt
        version
        owner {
          id
          name
          email
          title
        }
        topics {
          id
          name
          description
          parent {
            id
          }
        }
  `;

  const query = `
    query GetPosts($ids: [ID!]!) {
      posts(ids: $ids) {
${postFields}
      }
    }
  `;

  const data = await makeGraphQLRequest<{ posts: any[] }>(accessToken, query, {
    ids: postIds,
  });

  return data.posts.map((post: RawPost) => normalizePost(post));
}

export async function getTopics(accessToken: string): Promise<SlabTopic[]> {
  const query = `
    query GetOrganizationTopics {
      organization {
        topics {
          id
          name
          description
          parent {
            id
          }
          posts {
            id
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest<{
    organization: { topics: any[] };
  }>(accessToken, query);

  const topics = (data.organization?.topics ?? []).map((topic) => ({
    id: topic.id,
    name: topic.name ?? topic.id,
    description: JSON.stringify(topic.description ?? ""),
    parentId: topic.parent?.id ?? null,
    postCount: topic.posts?.length ?? 0,
  }));

  return topics;
}
