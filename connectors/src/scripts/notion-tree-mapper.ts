#!/usr/bin/env tsx

/**
 * Notion Tree Mapper
 *
 * A standalone script that efficiently maps the tree structure of a Notion workspace
 * by crawling from a given connector ID.
 *
 * Usage:
 *   npm run notion-tree-mapper <connector_id>
 *
 * The script will:
 * 1. Retrieve the Notion access token for the specified connector
 * 2. Use both search and traversal to discover all pages and databases
 * 3. Map the parent-child relationships between all content
 * 4. Produce a JSON and text representation of the workspace structure
 */

import { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { getNotionAccessToken } from "@connectors/connectors/notion/temporal/activities";

// Configuration constants (can be overridden via environment variables)
const DEFAULT_MAX_EXECUTION_TIME = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_SEARCH_PAGES = 10000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_PAGES_PER_BLOCK = 10;
const DEFAULT_MAX_PAGE_RETRIES = 3;

// Type definitions
type NotionObjectType = "page" | "database";

interface NotionNode {
  id: string;
  type: NotionObjectType;
  title: string;
  parentId: string | null;
  children: Set<string>; // IDs of child nodes
  url: string;
  lastEdited: Date;
  createdTime: Date;
}

interface NotionTree {
  nodes: Map<string, NotionNode>;
  rootNodes: Set<string>; // IDs that have no parent
}

interface CrawlState {
  visitedIds: Set<string>; // IDs that have been fully processed
  pendingIds: Set<string>; // IDs waiting to be processed
  inProgress: Set<string>; // IDs currently being processed
  searchVisitedIds: Set<string>; // IDs already seen in search results
  discoveredViaSearch: Set<string>; // IDs that were found via search (for metrics)
  discoveredViaTraversal: Set<string>; // IDs that were found via traversal (for metrics)
  tree: NotionTree;
  startTime: number; // Timestamp when crawl started
  traversalPaths: Map<string, Set<string>>; // Track traversal paths to detect loops (child ID -> set of ancestor IDs)
  retryCount: Map<string, number>; // Track retry attempts per page ID
  maxExecutionTime: number; // Maximum execution time in milliseconds
  maxSearchPages: number; // Maximum number of search results to process
  maxPageRetries: number; // Maximum number of retries per page
  batchSize: number; // Number of pages to process in parallel
  maxPagesPerBlock: number; // Maximum pagination requests per block
  connectorId: string; // The connector ID being processed
}

// Interface for the page discovery event handler
interface PageDiscoveryHandler {
  onPageDiscovered: (pageId: string, source: "search") => void;
  onSearchComplete: (stats: {
    totalDiscovered: number;
    executionTime: number;
  }) => void;
}

function isErrorWithStatus(error: unknown): error is {
  status: number;
  code?: string;
  headers?: Record<string, string>;
} {
  return typeof error === "object" && error !== null && "status" in error;
}

/**
 * Convert any error type to a string with useful information
 */
export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    // Include stack trace info if available
    return error.stack
      ? `${error.message} (${error.stack.split("\n")[1]?.trim() || "no stack"})`
      : error.message;
  } else if (typeof error === "string") {
    return error;
  } else if (isErrorWithStatus(error)) {
    // For API errors, include the status code and any error code
    return `API error ${error.status}${error.code ? ` (${error.code})` : ""}: ${JSON.stringify(error)}`;
  }

  return JSON.stringify(error);
}

/**
 * Retry function for API calls with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    description?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelay = 1000,
    maxDelay = 30000,
    description = "API operation",
  } = options;

  let retryCount = 0;
  let delay = initialDelay;

  for (;;) {
    try {
      return await operation();
    } catch (error) {
      retryCount++;

      // Format common error info to reduce duplication
      const retryMsg = `[Retry ${retryCount}/${maxRetries > 3 ? maxRetries : 3}]`;
      const delayMsg = `wait ${(delay / 1000).toFixed(1)}s`;
      const errorMsg = errorToString(error);

      // Unknown error case (not an API error with status)
      if (!isErrorWithStatus(error)) {
        if (retryCount > Math.min(3, maxRetries)) {
          console.error(
            `❌ ${description} failed - Giving up after ${retryCount} retries: ${errorMsg}`
          );
          throw error;
        }

        delay = Math.min(delay * 2, maxDelay);
        console.log(`⚠️ ${description}: ${retryMsg} ${errorMsg} - ${delayMsg}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Handle rate limits explicitly
      if (error.status === 429) {
        const retryAfter = parseInt(error.headers?.["retry-after"] ?? "1", 10);
        delay = retryAfter * 1000;
        console.log(
          `🕒 ${description}: Rate limited (429) - Waiting ${retryAfter}s as requested by API`
        );
      }
      // Server errors or connection issues
      else if (
        error.status >= 500 ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT"
      ) {
        if (retryCount > maxRetries) {
          console.error(
            `❌ ${description} failed - Server error ${error.status}${error.code ? ` (${error.code})` : ""} - Giving up after ${maxRetries} retries: ${errorMsg}`
          );
          throw error;
        }

        // Exponential backoff with jitter
        delay = Math.min(delay * 1.5 * (1 + Math.random() * 0.2), maxDelay);
        console.log(
          `🔄 ${description}: ${retryMsg} Server error ${error.status}${error.code ? ` (${error.code})` : ""} - ${delayMsg}`
        );
      }
      // For 4xx errors (except 429), don't retry as they're client errors
      else if (error.status >= 400 && error.status < 500) {
        console.error(
          `❌ ${description} failed - Client error ${error.status}${error.code ? ` (${error.code})` : ""}: ${errorMsg}`
        );
        throw error;
      }
      // For any other error, retry with backoff but fewer times
      else {
        if (retryCount > Math.min(3, maxRetries)) {
          console.error(
            `❌ ${description} failed - Giving up after ${retryCount} retries: ${errorMsg}`
          );
          throw error;
        }

        delay = Math.min(delay * 2, maxDelay);
        console.log(
          `⚠️ ${description}: ${retryMsg} Unexpected API error - ${delayMsg}`
        );
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Initialize the state for our crawler
 */
async function initializeNotionTreeMapper(connectorId: string): Promise<{
  notion: Client;
  state: CrawlState;
}> {
  console.log(
    `Initializing Notion tree mapper for connector ID: ${connectorId}`
  );

  // Get the access token for this connector
  const accessToken = await getNotionAccessToken(connectorId);
  console.log("Successfully retrieved Notion access token");

  // Initialize Notion client with the retrieved token
  const notion = new Client({
    auth: accessToken,
  });

  // Initialize our crawler state with stop conditions
  const state: CrawlState = {
    visitedIds: new Set<string>(),
    pendingIds: new Set<string>(),
    inProgress: new Set<string>(),
    searchVisitedIds: new Set<string>(),
    discoveredViaSearch: new Set<string>(),
    discoveredViaTraversal: new Set<string>(),
    tree: {
      nodes: new Map<string, NotionNode>(),
      rootNodes: new Set<string>(),
    },
    startTime: Date.now(),
    traversalPaths: new Map<string, Set<string>>(), // For loop detection
    retryCount: new Map<string, number>(), // Track retry attempts
    maxExecutionTime: process.env.MAX_EXECUTION_TIME
      ? parseInt(process.env.MAX_EXECUTION_TIME, 10)
      : DEFAULT_MAX_EXECUTION_TIME,
    maxSearchPages: process.env.MAX_SEARCH_PAGES
      ? parseInt(process.env.MAX_SEARCH_PAGES, 10)
      : DEFAULT_MAX_SEARCH_PAGES,
    maxPageRetries: process.env.MAX_PAGE_RETRIES
      ? parseInt(process.env.MAX_PAGE_RETRIES, 10)
      : DEFAULT_MAX_PAGE_RETRIES,
    batchSize: process.env.BATCH_SIZE
      ? parseInt(process.env.BATCH_SIZE, 10)
      : DEFAULT_BATCH_SIZE,
    maxPagesPerBlock: process.env.MAX_PAGES_PER_BLOCK
      ? parseInt(process.env.MAX_PAGES_PER_BLOCK, 10)
      : DEFAULT_MAX_PAGES_PER_BLOCK,
    connectorId,
  };

  return { notion, state };
}

/**
 * Discover pages using the Notion search API
 */
async function discoverPagesViaSearch(
  notionClient: Client,
  visitedTracker: {
    isVisited: (id: string) => boolean;
    markSearchVisited: (id: string) => void;
  },
  discoveryHandler: PageDiscoveryHandler,
  options: {
    maxSearchPages: number;
    maxExecutionTime: number;
    maxSearchCalls: number;
  }
): Promise<void> {
  console.log("Starting page discovery via search...");
  let hasMore = true;
  let startCursor: string | undefined = undefined;
  let totalDiscovered = 0;
  let searchExecutionCount = 0;

  // Track start time for this specific operation
  const searchStartTime = Date.now();

  while (hasMore) {
    // Check stop conditions
    if (
      // Check if we've searched enough pages
      totalDiscovered >= options.maxSearchPages ||
      // Check if we've been running too long
      Date.now() - searchStartTime >= options.maxExecutionTime ||
      // Check if we've made too many search calls (to prevent infinite loops)
      searchExecutionCount >= options.maxSearchCalls
    ) {
      console.log(`Search discovery stopped due to limits:
        - Total discovered: ${totalDiscovered}/${options.maxSearchPages}
        - Execution time: ${(Date.now() - searchStartTime) / 1000} seconds
        - Search API calls: ${searchExecutionCount}/${options.maxSearchCalls}`);
      break;
    }

    try {
      // Increment search execution count
      searchExecutionCount++;

      // Use search endpoint without query, filtering only for pages and databases
      const response = await withRetry(
        () =>
          notionClient.search({
            start_cursor: startCursor,
            page_size: 100, // Maximum allowed
            filter: {
              value: "page",
              property: "object",
            },
            sort: {
              direction: "descending",
              timestamp: "last_edited_time",
            },
          }),
        { description: "search API" }
      );

      // Process results
      for (const result of response.results) {
        const id = result.id;

        // Skip if we've already seen or processed this page
        if (visitedTracker.isVisited(id)) {
          continue;
        }

        // Mark as seen in search to avoid duplicates
        visitedTracker.markSearchVisited(id);
        totalDiscovered++;

        // Notify the handler that we discovered a page
        discoveryHandler.onPageDiscovered(id, "search");
      }

      // Update pagination state
      hasMore = response.has_more;
      startCursor = response.next_cursor || undefined;

      // Log progress
      if (totalDiscovered % 500 === 0) {
        console.log(`Search discovery progress: ${totalDiscovered} pages`);
      }

      // Respect rate limits
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 300)); // ~3 requests per second
      }
    } catch (error: unknown) {
      const errorMsg = errorToString(error);
      console.error(
        `❌ Search discovery error (call #${searchExecutionCount}): ${errorMsg}`
      );

      // For unrecoverable errors, end the search
      if (
        searchExecutionCount > 5 &&
        (!isErrorWithStatus(error) || error.status !== 429)
      ) {
        console.log("⛔ Too many search errors, ending search discovery");
        hasMore = false;
        break;
      }

      // For other errors, pause briefly and continue
      const pauseTime =
        isErrorWithStatus(error) && error.status === 429 ? 5000 : 1000;
      console.log(`⏸️ Pausing search for ${pauseTime / 1000}s before retry`);
      await new Promise((resolve) => setTimeout(resolve, pauseTime));
    }
  }

  // Notify the handler that search is complete
  discoveryHandler.onSearchComplete({
    totalDiscovered,
    executionTime: Date.now() - searchStartTime,
  });

  console.log(
    `Search discovery complete. Total pages discovered: ${totalDiscovered}`
  );
}

/**
 * Process a single page or database
 */
async function processPageOrDatabase(
  id: string,
  notionClient: Client,
  state: CrawlState,
  ancestors: string[] = []
): Promise<void> {
  // If we've already visited this node, skip it
  if (state.visitedIds.has(id)) {
    return;
  }

  // Check for loops in the traversal path (additional safety check)
  if (ancestors.includes(id)) {
    console.log(
      `Loop detected in traversal path: ${ancestors.join(" -> ")} -> ${id}`
    );
    state.visitedIds.add(id);
    return;
  }

  if (Date.now() - state.startTime >= state.maxExecutionTime) {
    console.log(`Reached maximum execution time, skipping page ${id}`);
    state.visitedIds.add(id);
    return;
  }

  // Mark as in progress
  state.pendingIds.delete(id);
  state.inProgress.add(id);

  try {
    // First, try to retrieve as a page, and if that fails due to 404, try as a database
    let object: PageObjectResponse | DatabaseObjectResponse;

    try {
      object = (await withRetry(
        () => notionClient.pages.retrieve({ page_id: id }),
        { description: `retrieve page ${id}` }
      )) as PageObjectResponse;
    } catch (pageError) {
      // If page retrieval fails with 404, try as a database
      if (isErrorWithStatus(pageError) && pageError.status === 404) {
        try {
          object = (await withRetry(
            () => notionClient.databases.retrieve({ database_id: id }),
            { description: `retrieve database ${id}` }
          )) as DatabaseObjectResponse;
        } catch (dbError) {
          // Both page and database retrieval failed, throw the original error
          throw pageError;
        }
      } else {
        // Any other error during page retrieval
        throw pageError;
      }
    }

    const isPage = object.object === "page";

    // Extract basic node information
    const node: NotionNode = {
      id,
      type: isPage ? "page" : "database",
      title: extractTitle(object),
      parentId: extractParentId(object),
      children: new Set<string>(),
      url: object.url || "", // URL for the page
      lastEdited: new Date(object.last_edited_time || new Date().toISOString()),
      createdTime: new Date(object.created_time || new Date().toISOString()),
    };

    // Add to our tree
    state.tree.nodes.set(id, node);

    // If it has a parent, update the parent's children
    if (node.parentId) {
      const parentNode = state.tree.nodes.get(node.parentId);
      if (parentNode) {
        parentNode.children.add(id);
      } else if (
        !state.visitedIds.has(node.parentId) &&
        !state.pendingIds.has(node.parentId) &&
        !state.inProgress.has(node.parentId)
      ) {
        // We haven't seen this parent yet, add to pending
        state.pendingIds.add(node.parentId);
        state.discoveredViaTraversal.add(node.parentId);
      }
    } else {
      // No parent - this is a root node
      state.tree.rootNodes.add(id);
    }

    // Next, get all child blocks to find child pages and databases
    // Include the current ID in the ancestors list for loop detection
    await getChildrenRecursively(id, notionClient, state, [...ancestors, id]);

    // Mark as visited
    state.visitedIds.add(id);
    state.inProgress.delete(id);

    // Log progress periodically
    if (state.visitedIds.size % 100 === 0) {
      console.log(
        `Progress: ${state.visitedIds.size} pages processed, ${state.pendingIds.size} pending`
      );
    }
  } catch (error: unknown) {
    const errorMsg = errorToString(error);

    // Object not found or no access, skip it
    if (isErrorWithStatus(error) && error.status === 404) {
      console.log(`⏭️ Skipping ${id}: Not found or no access (404)`);
      state.visitedIds.add(id); // Mark as visited to avoid retrying
    } else if (isErrorWithStatus(error) && error.status === 403) {
      console.log(`🔒 Skipping ${id}: Permission denied (403)`);
      state.visitedIds.add(id); // Mark as visited to avoid retrying
    } else if (isErrorWithStatus(error) && error.status === 429) {
      // Rate limited - always retry these with a longer delay
      console.log(`⏸️ Rate limited while processing ${id}, will retry`);
      state.pendingIds.add(id);
      // Wait longer before retrying rate-limited requests
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      console.error(`❌ Error processing ${id}: ${errorMsg}`);

      // For other errors that weren't handled by the retry mechanism,
      // implement retry limit
      const currentRetries = state.retryCount.get(id) || 0;
      if (currentRetries < state.maxPageRetries) {
        state.retryCount.set(id, currentRetries + 1);
        state.pendingIds.add(id);
        console.log(
          `🔄 Re-queuing ${id} for retry (${currentRetries + 1}/${state.maxPageRetries})`
        );
        // Add increasing delay for consecutive retries
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(1000 * Math.pow(1.5, currentRetries), 10000)
          )
        );
      } else {
        console.log(
          `⛔ Max retries (${state.maxPageRetries}) reached for ${id}, skipping`
        );
        state.visitedIds.add(id); // Mark as visited to avoid further retries
      }
    }

    state.inProgress.delete(id);
  }
}

/**
 * Get the children of a block recursively
 */
async function getChildrenRecursively(
  blockId: string,
  notionClient: Client,
  state: CrawlState,
  ancestors: string[] = []
): Promise<void> {
  // No explicit depth limit, but check for maximum ancestors length as a safety valve
  if (ancestors.length > 100) {
    console.warn(
      `Extremely deep path detected (${ancestors.length} levels), stopping traversal`
    );
    return;
  }

  if (Date.now() - state.startTime >= state.maxExecutionTime) {
    return;
  }

  let hasMore = true;
  let startCursor: string | undefined = undefined;
  let paginationCount = 0;

  while (hasMore) {
    // Additional stop condition for excessive pagination
    if (paginationCount >= state.maxPagesPerBlock) {
      console.log(
        `Reached maximum pagination (${state.maxPagesPerBlock}) for block ${blockId}`
      );
      break;
    }

    paginationCount++;

    try {
      const response = await withRetry(
        () =>
          notionClient.blocks.children.list({
            block_id: blockId,
            start_cursor: startCursor,
            page_size: 100,
          }),
        { description: `list children of block ${blockId}` }
      );

      // Process child blocks
      for (const block of response.results) {
        // Only interested in child_page or child_database blocks
        const blockType = (block as BlockObjectResponse).type;
        if (blockType === "child_page" || blockType === "child_database") {
          const childId = block.id;

          // Make sure parent-child relationship is recorded in our tree
          const parentNode = state.tree.nodes.get(blockId);
          if (parentNode) {
            parentNode.children.add(childId);
          }

          // Skip if we've already visited or queued this node
          if (
            state.visitedIds.has(childId) ||
            state.pendingIds.has(childId) ||
            state.inProgress.has(childId)
          ) {
            continue;
          }

          // Check for loops as an additional safety measure
          if (ancestors.includes(childId)) {
            console.log(
              `Loop detected: ${childId} is already in the ancestor path`
            );
            continue;
          }

          // Add to pending for processing
          state.pendingIds.add(childId);
          state.discoveredViaTraversal.add(childId);

          // Store ancestors to help with future loop detection
          state.traversalPaths.set(childId, new Set(ancestors));
        }
      }

      // Update pagination state
      hasMore = response.has_more;
      startCursor = response.next_cursor || undefined;

      // Respect rate limits
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error: unknown) {
      const errorMsg = errorToString(error);

      // If we get an error after multiple pagination requests, just move on
      if (paginationCount > 2) {
        console.warn(
          `🛑 Block ${blockId}: Giving up on getting children after ${paginationCount} pages - ${errorMsg}`
        );
        hasMore = false;
      } else if (
        isErrorWithStatus(error) &&
        (error.status === 404 || error.status === 403)
      ) {
        // For not found or permission denied errors, stop trying
        const statusText =
          error.status === 404 ? "not found" : "permission denied";
        console.log(`⏭️ Block ${blockId}: Skipping children (${statusText})`);
        hasMore = false;
      } else if (isErrorWithStatus(error) && error.status === 429) {
        // Rate limited - wait longer but keep trying
        const retryAfter = parseInt(error.headers?.["retry-after"] ?? "5", 10);
        console.log(
          `🕒 Block ${blockId}: Rate limited, waiting ${retryAfter}s before retrying`
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        // Don't increment pagination count for rate limits
        paginationCount--;
      } else {
        console.error(
          `❌ Block ${blockId}: Error getting children - ${errorMsg}`
        );

        // Wait with exponential backoff before retrying after an error
        const backoffMs = Math.min(1000 * Math.pow(1.5, paginationCount), 5000);
        console.log(`⏸️ Block ${blockId}: Retrying after ${backoffMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
}

/**
 * Type for Notion rich text content
 */
interface NotionRichText {
  plain_text: string;
  annotations?: unknown;
  type?: string;
  href?: string | null;
}

/**
 * Type for Notion title property
 */
interface NotionTitleProperty {
  id?: string;
  type?: string;
  title: NotionRichText[];
}

/**
 * Extract the title from a page or database object
 */
function extractTitle(
  object: PageObjectResponse | DatabaseObjectResponse
): string {
  // Extract the title from a page or database
  let title = "Untitled";

  if (object.object === "page") {
    // For pages, title might be in properties.title or properties.Name
    let pageTitleProp: NotionTitleProperty | undefined;

    // Check if title property exists and has the expected structure
    if (
      object.properties.title &&
      typeof object.properties.title === "object" &&
      "title" in object.properties.title &&
      Array.isArray((object.properties.title as NotionTitleProperty).title)
    ) {
      pageTitleProp = object.properties.title as NotionTitleProperty;
    }
    // Check if Name property exists and has the expected structure
    else if (
      object.properties.Name &&
      typeof object.properties.Name === "object" &&
      "title" in object.properties.Name &&
      Array.isArray((object.properties.Name as NotionTitleProperty).title)
    ) {
      pageTitleProp = object.properties.Name as NotionTitleProperty;
    }

    if (pageTitleProp?.title && pageTitleProp.title.length > 0) {
      title = pageTitleProp.title.map((t) => t.plain_text).join("");
    }
  } else if (object.object === "database") {
    // For databases, title is in the title property
    if (Array.isArray(object.title) && object.title.length > 0) {
      title = object.title.map((t) => t.plain_text).join("");
    }
  }

  return title || "Untitled";
}

/**
 * Type for Notion parent objects
 */
type NotionParent =
  | { type: "page_id"; page_id: string }
  | { type: "database_id"; database_id: string }
  | { type: "block_id"; block_id: string }
  | { type: "workspace"; workspace: true };

/**
 * Extract the parent ID from a page or database object
 */
function extractParentId(
  object: PageObjectResponse | DatabaseObjectResponse
): string | null {
  // Extract the parent ID from a page or database
  const parent = object.parent as NotionParent;

  if (!parent) {
    return null;
  }

  if (parent.type === "page_id") {
    return parent.page_id;
  } else if (parent.type === "database_id") {
    return parent.database_id;
  } else if (parent.type === "block_id") {
    return parent.block_id;
  } else if (parent.type === "workspace") {
    return null; // Workspace is the root, no parent ID
  }

  return null;
}

/**
 * Map the Notion tree structure
 */
async function mapNotionTree(
  notionClient: Client,
  crawlState: CrawlState
): Promise<NotionTree> {
  // Start with stats tracking
  console.log("Starting tree mapping process...");
  const startTime = Date.now();

  // Track whether search discovery is complete
  let isSearchComplete = false;

  // Set up discovery handler with callbacks
  const discoveryHandler: PageDiscoveryHandler = {
    onPageDiscovered: (pageId: string, source: "search") => {
      // Skip if we've already seen or processed this page
      if (
        crawlState.visitedIds.has(pageId) ||
        crawlState.pendingIds.has(pageId) ||
        crawlState.inProgress.has(pageId)
      ) {
        return;
      }

      // Add to pending for processing
      crawlState.pendingIds.add(pageId);
      crawlState.discoveredViaSearch.add(pageId);
      console.log(`Discovered via ${source}: ${pageId}`);
    },

    onSearchComplete: (stats) => {
      isSearchComplete = true;
      console.log(
        `Search discovery complete in ${(stats.executionTime / 1000).toFixed(1)}s. Found ${stats.totalDiscovered} pages.`
      );
    },
  };

  // Set up visited tracker for the search function
  const visitedTracker = {
    isVisited: (id: string): boolean => {
      return (
        crawlState.searchVisitedIds.has(id) ||
        crawlState.visitedIds.has(id) ||
        crawlState.pendingIds.has(id) ||
        crawlState.inProgress.has(id)
      );
    },
    markSearchVisited: (id: string): void => {
      crawlState.searchVisitedIds.add(id);
    },
  };

  // Start the search discovery in the background
  const searchPromise = discoverPagesViaSearch(
    notionClient,
    visitedTracker,
    discoveryHandler,
    {
      maxSearchPages: crawlState.maxSearchPages,
      maxExecutionTime: crawlState.maxExecutionTime,
      maxSearchCalls: 100,
    }
  ).catch((error) => {
    // Handle any uncaught errors in the search process
    console.error(`❌ Search discovery failed: ${errorToString(error)}`);
    isSearchComplete = true; // Mark as complete so we don't wait indefinitely
  });

  // Periodic reporting
  const statusInterval = setInterval(
    () => {
      const elapsedMinutes = (Date.now() - startTime) / 60000;
      console.log(
        `=== STATUS REPORT (${elapsedMinutes.toFixed(1)} minutes) ===`
      );
      console.log(`Pages processed: ${crawlState.visitedIds.size}`);
      console.log(`Pages pending: ${crawlState.pendingIds.size}`);
      console.log(`Pages in progress: ${crawlState.inProgress.size}`);
      console.log(`Found via search: ${crawlState.discoveredViaSearch.size}`);
      console.log(
        `Found via traversal: ${crawlState.discoveredViaTraversal.size}`
      );
      console.log(`Total nodes in tree: ${crawlState.tree.nodes.size}`);
      console.log(`Root nodes: ${crawlState.tree.rootNodes.size}`);

      // Check if we're approaching time limit
      const timeRemaining =
        crawlState.maxExecutionTime - (Date.now() - crawlState.startTime);
      if (timeRemaining < 10 * 60 * 1000) {
        // Less than 10 minutes left
        console.log(
          `WARNING: ${(timeRemaining / 60000).toFixed(1)} minutes remaining before timeout`
        );
      }
    },
    2 * 60 * 1000
  ); // Report every 2 minutes

  try {
    // Main processing loop
    let exitLoop = false;
    for (let loopCount = 0; !exitLoop; loopCount++) {
      // Check global stop conditions
      if (Date.now() - crawlState.startTime >= crawlState.maxExecutionTime) {
        console.log("Reached maximum execution time, stopping mapping process");
        exitLoop = true;
        break;
      }

      // Process pending pages in batches
      const batch = Array.from(crawlState.pendingIds).slice(
        0,
        crawlState.batchSize
      );

      if (batch.length === 0) {
        // No more pending items, check if search is complete
        if (isSearchComplete && crawlState.inProgress.size === 0) {
          // Both the search and processing are done
          console.log(
            "No more pages to process and search is complete. Finishing mapping."
          );
          exitLoop = true;
          break;
        } else if (isSearchComplete) {
          // Search is done but we still have pages in progress
          console.log(
            `Search is complete. Waiting for ${crawlState.inProgress.size} pages in progress...`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          // Search is still running, wait for more pages
          if (loopCount % 30 === 0) {
            // Log only every ~30 seconds
            console.log("Waiting for search to discover pages...");
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        // Process this batch in parallel
        await Promise.all(
          batch.map((id) => {
            // Get any known ancestors from traversal paths
            const knownAncestors = crawlState.traversalPaths.get(id);
            const ancestors = knownAncestors ? Array.from(knownAncestors) : [];

            return processPageOrDatabase(
              id,
              notionClient,
              crawlState,
              ancestors
            );
          })
        );
      }
    }
  } finally {
    // Make sure to clean up properly
    clearInterval(statusInterval);

    // If the search is still running but we're exiting, cancel it to avoid leaving dangling operations
    if (!isSearchComplete) {
      console.log("Main process ended, waiting for search to complete...");
      try {
        await Promise.race([
          searchPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Search timeout")), 5000)
          ),
        ]);
      } catch (error) {
        console.log(
          "Timed out waiting for search to complete, continuing with cleanup"
        );
      }
    }
  }

  // Final report
  const duration = (Date.now() - startTime) / 1000;
  console.log(`Mapping complete in ${duration.toFixed(2)} seconds`);
  console.log(`Found ${crawlState.tree.nodes.size} total nodes`);
  console.log(`Root nodes: ${crawlState.tree.rootNodes.size}`);
  console.log(
    `Pages discovered via search: ${crawlState.discoveredViaSearch.size}`
  );
  console.log(
    `Pages discovered via traversal: ${crawlState.discoveredViaTraversal.size}`
  );

  // Check for circular references or other anomalies
  validateTree(crawlState.tree);

  return crawlState.tree;
}

/**
 * Validate the tree structure for loops or other issues
 */
function validateTree(tree: NotionTree): void {
  console.log("Validating tree structure...");

  // Check for circular references
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function checkCircular(nodeId: string, path: string[] = []): boolean {
    if (recursionStack.has(nodeId)) {
      console.warn(
        `Circular reference detected: ${path.join(" -> ")} -> ${nodeId}`
      );
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = tree.nodes.get(nodeId);
    if (node) {
      const newPath = [...path, nodeId];
      for (const childId of node.children) {
        if (checkCircular(childId, newPath)) {
          return true;
        }
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Check each root node
  for (const rootId of tree.rootNodes) {
    checkCircular(rootId);
  }

  // Verify all nodes are reachable
  let unreachableCount = 0;
  for (const [nodeId] of tree.nodes) {
    if (!visited.has(nodeId)) {
      unreachableCount++;
    }
  }

  if (unreachableCount > 0) {
    console.warn(
      `Found ${unreachableCount} nodes not reachable from any root node`
    );
  }

  console.log("Tree validation complete");
}

/**
 * Generate a textual representation of the tree
 */
function generateTreeOutput(tree: NotionTree): string {
  // Generate a textual representation of the tree
  let output = "Notion Workspace Structure\n";
  output += "=======================\n\n";

  // Start with root nodes
  for (const rootId of tree.rootNodes) {
    output += generateNodeOutput(rootId, tree, 0);
  }

  return output;
}

/**
 * Generate the output for a single node in the tree
 */
function generateNodeOutput(
  nodeId: string,
  tree: NotionTree,
  depth: number
): string {
  const node = tree.nodes.get(nodeId);
  if (!node) {
    return "";
  }

  // Generate indentation based on depth
  const indent = "  ".repeat(depth);
  let output = `${indent}- ${node.title} (${node.type}, ${node.id})\n`;

  // Add children
  for (const childId of node.children) {
    output += generateNodeOutput(childId, tree, depth + 1);
  }

  return output;
}

/**
 * Save the tree to a file
 */
function saveTreeToFile(
  tree: NotionTree,
  connectorId: string,
  outputDir: string = "./output"
): string[] {
  // Create the output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeConnectorId = connectorId || "unknown";
  const filePrefix = path.join(
    outputDir,
    `notion-tree-${safeConnectorId}-${timestamp}`
  );

  // Generate a hash of the tree to verify data integrity
  const treeHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(Array.from(tree.nodes.entries())))
    .digest("hex")
    .substring(0, 8);

  // Save as JSON
  const jsonPath = `${filePrefix}-${treeHash}.json`;
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        metadata: {
          connectorId: safeConnectorId,
          timestamp: new Date().toISOString(),
          nodeCount: tree.nodes.size,
          rootCount: tree.rootNodes.size,
        },
        tree: {
          nodes: Array.from(tree.nodes.entries()).map(([id, node]) => ({
            id,
            type: node.type,
            title: node.title,
            parentId: node.parentId,
            children: Array.from(node.children),
            url: node.url,
            lastEdited: node.lastEdited.toISOString(),
            createdTime: node.createdTime.toISOString(),
          })),
          rootNodes: Array.from(tree.rootNodes),
        },
      },
      null,
      2
    )
  );

  // Save as text tree
  const textPath = `${filePrefix}-${treeHash}.txt`;
  fs.writeFileSync(textPath, generateTreeOutput(tree));

  console.log(`Tree saved to:`);
  console.log(`- JSON: ${jsonPath}`);
  console.log(`- Text: ${textPath}`);

  return [jsonPath, textPath];
}

/**
 * Main entry point
 */
async function main() {
  // Get the connector ID from command line arguments
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: npm run notion-tree-mapper <connector_id>");
    process.exit(1);
  }

  const connectorId = args[0] || "";
  if (!connectorId) {
    console.error("Error: Connector ID is required");
    process.exit(1);
  }

  const startTime = Date.now();
  console.log(
    `Starting Notion tree mapping for connector ID: ${connectorId}...`
  );

  try {
    // Initialize the mapper with the connector ID
    const { notion, state } = await initializeNotionTreeMapper(connectorId);

    // Run the mapping process with the initialized client and state
    const tree = await mapNotionTree(notion, state);

    // Save the results
    const [jsonPath, textPath] = saveTreeToFile(tree, connectorId);

    // Print summary
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Mapping complete in ${duration.toFixed(2)} seconds.`);
    console.log(`Found ${tree.nodes.size} total nodes.`);
    console.log(`Root nodes: ${tree.rootNodes.size}`);
    console.log(`Results saved to:`);
    console.log(`- ${jsonPath}`);
    console.log(`- ${textPath}`);
  } catch (error: unknown) {
    const errorMsg = errorToString(error);
    console.error(
      `❌ FATAL ERROR: Notion tree mapping failed for connector ${connectorId}`
    );
    console.error(`Details: ${errorMsg}`);

    // Additional information about what might have happened
    if (isErrorWithStatus(error)) {
      if (error.status === 401) {
        console.error(
          `Authentication failed - Please check the OAuth token for this connector`
        );
      } else if (error.status === 429) {
        console.error(
          `Rate limit exceeded - Consider running the script again later`
        );
      } else if (error.status >= 500) {
        console.error(`Notion API server error - Please try again later`);
      }
    }

    process.exit(1);
  }
}

// Run the script
main().catch((error: unknown) => {
  console.error(`❌ UNCAUGHT ERROR: ${errorToString(error)}`);
  console.error(
    "This indicates a bug in the script - please report this issue"
  );
  process.exit(1);
});
