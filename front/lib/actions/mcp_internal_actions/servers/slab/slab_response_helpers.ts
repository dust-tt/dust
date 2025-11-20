import type { SlabPost, SlabTopic } from "./slab_types";

export function formatPostSummary(post: SlabPost): string {
  const status = post.archivedAt
    ? "archived"
    : post.publishedAt
      ? "published"
      : "draft";

  const updatedDate =
    post.updatedAt || post.insertedAt
      ? new Date(post.updatedAt || post.insertedAt).toLocaleDateString()
      : "Unknown";
  const createdDate = post.insertedAt
    ? new Date(post.insertedAt).toLocaleDateString()
    : "Unknown";

  const topics =
    post.topics.length > 0
      ? post.topics.map((topic) => topic.name).join(", ")
      : "None";

  const contentPreview = post.content.substring(0, 200);
  const author = `${post.owner.name} (${post.owner.email})`;

  return `**${post.title}**

ID: ${post.id}
Status: ${status}
Author: ${author}
Topics: ${topics}
Created: ${createdDate}
Updated: ${updatedDate}
Content Preview: ${contentPreview}${post.content.length > 200 ? "..." : ""}`;
}

export function formatPostListAsText(
  posts: SlabPost[],
  options?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  }
): string {
  if (posts.length === 0) {
    return "No posts found.";
  }

  const summaries = posts.map((post, idx) => {
    const status = post.archivedAt
      ? "archived"
      : post.publishedAt
        ? "published"
        : "draft";

    const topics =
      post.topics.length > 0
        ? post.topics.map((topic) => topic.name).join(", ")
        : "None";

    const updatedDate =
      post.updatedAt || post.insertedAt
        ? new Date(post.updatedAt || post.insertedAt).toLocaleDateString()
        : "Unknown";

    const author = `${post.owner.name} (${post.owner.email})`;

    return `${idx + 1}. **${post.title}** (${status})
   ID: ${post.id}
   Author: ${author}
   Topics: ${topics}
   Updated: ${updatedDate}`;
  });

  let result = `Found ${posts.length} post(s):\n\n${summaries.join("\n\n")}`;

  if (options?.hasMore) {
    if (options.nextCursor) {
      result += `\n\nMore results are available. Use cursor: ${options.nextCursor}`;
    } else {
      result += `\n\nMore results are available.`;
    }
  }

  return result;
}

export function formatPostAsText(post: SlabPost): string {
  const status = post.archivedAt
    ? "archived"
    : post.publishedAt
      ? "published"
      : "draft";

  const createdDate = post.insertedAt
    ? new Date(post.insertedAt).toLocaleDateString()
    : "Unknown";
  const updatedDate = post.updatedAt
    ? new Date(post.updatedAt).toLocaleDateString()
    : "Unknown";

  const topics =
    post.topics.length > 0
      ? post.topics.map((topic) => topic.name).join(", ")
      : "None";

  const author = `${post.owner.name} (${post.owner.email})`;

  return `# ${post.title}

**Status:** ${status}
**Author:** ${author}
**Topics:** ${topics}
**Created:** ${createdDate}
**Updated:** ${updatedDate}

---

${post.content}`;
}

export function formatTopicsAsText(topics: SlabTopic[]): string {
  if (topics.length === 0) {
    return "No topics found.";
  }

  const childrenByParentId = new Map<string, SlabTopic[]>();
  topics.forEach((topic) => {
    if (topic.parentId) {
      const children = childrenByParentId.get(topic.parentId) ?? [];
      childrenByParentId.set(topic.parentId, [...children, topic]);
    }
  });

  const buildTopic = (
    topic: SlabTopic
  ): SlabTopic & { children: SlabTopic[] } => ({
    ...topic,
    children: (childrenByParentId.get(topic.id) ?? []).map(buildTopic),
  });

  const rootTopics = topics.filter((topic) => !topic.parentId).map(buildTopic);

  const renderTopic = (
    topic: SlabTopic & { children?: SlabTopic[] },
    indent = 0
  ): string => {
    const prefix = "  ".repeat(indent);
    let output = `${prefix}- **${topic.name}**`;
    if (typeof topic.postCount === "number") {
      output += ` (${topic.postCount} posts)`;
    }
    output += `\n${prefix}  ID: ${topic.id}\n`;

    if (topic.children && topic.children.length > 0) {
      topic.children.forEach((child) => {
        const childWithChildren: SlabTopic & { children?: SlabTopic[] } = {
          ...child,
          children: "children" in child ? child.children : undefined,
        };
        output += renderTopic(childWithChildren, indent + 1);
      });
    }

    return output;
  };

  return `Topics:\n\n${rootTopics.map((topic) => renderTopic(topic)).join("\n")}`;
}
