import { Client, LogLevel, APIResponseError } from "@notionhq/client";
import { Agent } from "https";
import { wait } from "../utils/helpers";
import {
  CreatePageParameters,
  CreatePageResponse,
  CreateDatabaseParameters,
  CreateDatabaseResponse,
  UpdatePageParameters,
  UpdatePageResponse,
  AppendBlockChildrenParameters,
  AppendBlockChildrenResponse,
  QueryDatabaseParameters,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";

interface NotionClientOptions {
  auth: string;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  logLevel?: LogLevel;
}

// Define a type for Notion API errors
interface NotionAPIError extends Error {
  code?: string;
  headers?: Headers;
  message: string;
}

export class NotionClient {
  private client!: Client;
  private agent: Agent | undefined;
  private maxRetries: number;
  private initialRetryDelayMs: number;
  private maxRetryDelayMs: number;
  private authToken: string;

  constructor(options: NotionClientOptions) {
    this.maxRetries = options.maxRetries || 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs || 1000;
    this.maxRetryDelayMs = options.maxRetryDelayMs || 30000;
    this.authToken = options.auth;

    this.resetClient(options.auth, options.logLevel);
  }

  private resetClient(auth: string, logLevel?: LogLevel) {
    if (this.agent) this.agent.destroy();
    this.agent = new Agent();

    this.client = new Client({
      auth,
      agent: this.agent,
      logLevel,
    });
  }

  async createPage(params: CreatePageParameters): Promise<CreatePageResponse> {
    return this.executeWithRetry(() => this.client.pages.create(params));
  }

  async createDatabase(
    params: CreateDatabaseParameters
  ): Promise<CreateDatabaseResponse> {
    return this.executeWithRetry(() => this.client.databases.create(params));
  }

  async updatePage(
    pageId: string,
    params: Omit<UpdatePageParameters, "page_id">
  ): Promise<UpdatePageResponse> {
    return this.executeWithRetry(() =>
      this.client.pages.update({
        page_id: pageId,
        ...params,
      })
    );
  }

  async appendBlockChildren(
    blockId: string,
    children: AppendBlockChildrenParameters["children"]
  ): Promise<AppendBlockChildrenResponse> {
    return this.executeWithRetry(() =>
      this.client.blocks.children.append({
        block_id: blockId,
        children,
      })
    );
  }

  async queryDatabase(
    databaseId: string,
    filter?: QueryDatabaseParameters["filter"]
  ): Promise<QueryDatabaseResponse> {
    return this.executeWithRetry(() =>
      this.client.databases.query({
        database_id: databaseId,
        filter,
      })
    );
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let retryCount = 0;
    let delay = this.initialRetryDelayMs;

    while (true) {
      try {
        return await operation();
      } catch (error: unknown) {
        const notionError = error as NotionAPIError;

        if (retryCount >= this.maxRetries) {
          throw error;
        }

        // Handle rate limiting
        if (
          notionError.code === "rate_limited" ||
          (notionError.message && notionError.message.includes("429"))
        ) {
          const retryAfter = notionError.headers?.get("retry-after");
          delay = retryAfter ? parseInt(retryAfter) * 1000 : delay;
          console.log(
            `Rate limited. Retrying after ${delay}ms (attempt ${
              retryCount + 1
            }/${this.maxRetries})`
          );
        }
        // Handle 502 errors by resetting the client
        else if (notionError.message && notionError.message.includes("502")) {
          console.log("502 error detected. Resetting client and retrying.");
          this.resetClient(this.authToken);
        }
        // Handle other retryable errors
        else if (
          notionError.code === "service_unavailable" ||
          notionError.code === "internal_server_error" ||
          (notionError.message &&
            (notionError.message.includes("503") ||
              notionError.message.includes("500")))
        ) {
          console.log(
            `Server error. Retrying after ${delay}ms (attempt ${
              retryCount + 1
            }/${this.maxRetries})`
          );
        } else {
          // Non-retryable error
          throw error;
        }

        await wait(delay);

        // Apply exponential backoff with jitter
        const jitter = 0.3;
        const randomFactor = 1 - jitter + Math.random() * jitter * 2;
        delay = Math.min(delay * 2 * randomFactor, this.maxRetryDelayMs);
        retryCount++;
      }
    }
  }
}
