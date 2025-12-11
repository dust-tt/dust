/**
 * Script to fetch and cache all Contentful data for static generation.
 *
 * This runs during content rebuild triggered by Contentful webhook.
 * The cache is then restored during regular deploys to avoid API calls.
 *
 * Usage:
 *   CONTENTFUL_SPACE_ID=xxx CONTENTFUL_ACCESS_TOKEN=xxx npx tsx scripts/fetch-contentful-cache.ts
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import type { TagCollection } from "contentful";
import { createClient } from "contentful";

interface CacheMetadata {
  version: string;
  generatedAt: string;
  blogPostCount: number;
  customerStoryCount: number;
  tagCount: number;
  contentHash: string;
}

const CACHE_DIR = path.join(__dirname, "../contentful-cache");

function generateContentHash(...data: unknown[]): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 16);
}

async function fetchAndCacheContentful() {
  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const accessToken = process.env.CONTENTFUL_ACCESS_TOKEN;
  const environment = process.env.CONTENTFUL_ENVIRONMENT ?? "master";

  if (!spaceId || !accessToken) {
    console.error(
      "Error: CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN environment variables are required"
    );
    process.exit(1);
  }

  console.log(`Connecting to Contentful space ${spaceId}...`);

  const client = createClient({
    space: spaceId,
    accessToken,
    environment,
  });

  console.log("Fetching blog posts...");
  const blogPosts = await client.getEntries({
    content_type: "blogPage",
    limit: 1000,
    include: 2, // Include linked entries (authors) up to 2 levels deep
  });
  console.log(`  Found ${blogPosts.items.length} blog posts`);

  console.log("Fetching customer stories...");
  const customerStories = await client.getEntries({
    content_type: "customerStory",
    limit: 1000,
    include: 2, // Include linked assets
  });
  console.log(`  Found ${customerStories.items.length} customer stories`);

  console.log("Fetching tags...");
  const tags: TagCollection = await client.getTags();
  console.log(`  Found ${tags.items.length} tags`);

  // Create cache directory
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Write cache files
  const blogPostsPath = path.join(CACHE_DIR, "blog-posts.json");
  fs.writeFileSync(blogPostsPath, JSON.stringify(blogPosts, null, 2));
  console.log(`  Written: ${blogPostsPath}`);

  const customerStoriesPath = path.join(CACHE_DIR, "customer-stories.json");
  fs.writeFileSync(customerStoriesPath, JSON.stringify(customerStories, null, 2));
  console.log(`  Written: ${customerStoriesPath}`);

  const tagsPath = path.join(CACHE_DIR, "tags.json");
  fs.writeFileSync(tagsPath, JSON.stringify(tags, null, 2));
  console.log(`  Written: ${tagsPath}`);

  // Write metadata
  const metadata: CacheMetadata = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    blogPostCount: blogPosts.items.length,
    customerStoryCount: customerStories.items.length,
    tagCount: tags.items.length,
    contentHash: generateContentHash(blogPosts, customerStories, tags),
  };

  const metadataPath = path.join(CACHE_DIR, "cache-metadata.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`  Written: ${metadataPath}`);

  console.log("\nContentful cache generated successfully!");
  console.log(`  Blog posts: ${metadata.blogPostCount}`);
  console.log(`  Customer stories: ${metadata.customerStoryCount}`);
  console.log(`  Tags: ${metadata.tagCount}`);
  console.log(`  Content hash: ${metadata.contentHash}`);
}

fetchAndCacheContentful().catch((error) => {
  console.error("Failed to fetch Contentful data:", error);
  process.exit(1);
});
