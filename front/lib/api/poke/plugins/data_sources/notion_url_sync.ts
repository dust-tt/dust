import { isLeft } from "fp-ts/lib/Either";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  ConnectorsAPI,
  Err,
  mapToEnumValues,
  NotionFindUrlResponseSchema,
  Ok,
} from "@app/types";

const NOTION_OPERATIONS = ["Sync urls", "Delete urls"] as const;

export const notionUrlSyncPlugin = createPlugin({
  manifest: {
    id: "notion-url-sync",
    name: "Notion URLs sync/delete",
    description: "Sync or delete a Notion URL to Dust",
    resourceTypes: ["data_sources"],
    warning:
      "Sync URLs: Use if a page or database is available on Notion, but not on Dust, to force the sync.\n" +
      "Delete URLs: Use if a page or database is removed from Notion, but still visible on Dust.",
    args: {
      operation: {
        type: "enum",
        label: "Operation",
        description: "Select operation to perform",
        values: mapToEnumValues(NOTION_OPERATIONS, (operation) => ({
          label: operation,
          value: operation,
        })),
      },
      urls: {
        type: "text",
        label: "URLs",
        description:
          "List of URLs to sync or delete, separated by a comma (,) or newline",
      },
    },
  },
  isApplicableTo: (auth, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "notion";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const { operation, urls } = args;

    const urlsArray = urls
      .split(/[\n,]/g)
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    // check urls are valid
    if (urlsArray.some((url) => !URL.canParse(url))) {
      return new Err(
        new Error(
          `Invalid URLs: ${urlsArray
            .filter((url) => !URL.canParse(url))
            .join(", ")}`
        )
      );
    }

    if (operation === "Sync urls") {
      const res = await syncNotionUrls({
        urlsArray,
        dataSourceId: dataSource.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        method: "sync",
      });
      if (res.some((r) => !r.success)) {
        return new Err(
          new Error(
            res.map((r) => (r.success ? r.url : r.error?.message)).join("\n")
          )
        );
      }

      return new Ok({
        display: "text",
        value: `Synced ${urlsArray.length} URLs from Notion.`,
      });
    } else if (operation === "Delete urls") {
      const res = await deleteUrls({
        urlsArray,
        dataSourceId: dataSource.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      });
      if (res.some((r) => !r.success)) {
        return new Err(
          new Error(
            res.map((r) => (r.success ? r.url : r.error?.message)).join("\n")
          )
        );
      }
      return new Ok({
        display: "text",
        value: `Deleted ${urlsArray.length} URLs from Notion.`,
      });
    } else {
      return new Err(new Error("Invalid operation"));
    }
  },
});
type URLOperationResult = {
  url: string;
  timestamp: number;
  success: boolean;
  error?: Error;
};

export async function syncNotionUrls({
  urlsArray,
  dataSourceId,
  workspaceId,
  method,
}: {
  urlsArray: string[];
  dataSourceId: string;
  workspaceId: string;
  method: "sync" | "delete";
}): Promise<URLOperationResult[]> {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  return concurrentExecutor(
    urlsArray,
    async (url: string): Promise<URLOperationResult> => {
      const checkUrlRes = await connectorsAPI.admin({
        majorCommand: "notion",
        command: "check-url",
        args: {
          wId: workspaceId,
          dsId: dataSourceId,
          url,
        },
      });

      if (checkUrlRes.isErr()) {
        return {
          url,
          timestamp: Date.now(),
          success: false,
          error: new Error(checkUrlRes.error.message),
        };
      }

      const decoded = NotionFindUrlResponseSchema.decode(checkUrlRes.value);
      if (isLeft(decoded)) {
        return {
          url,
          timestamp: Date.now(),
          success: false,
          error: new Error("Unreachable: Invalid response from dust API"),
        };
      }

      const { page, db } = decoded.right;
      if (method === "delete") {
        const deleteRes = await connectorsAPI.admin({
          majorCommand: "notion",
          command: "delete-url",
          args: {
            wId: workspaceId,
            dsId: dataSourceId,
            url,
          },
        });

        if (deleteRes.isErr()) {
          return {
            url,
            timestamp: Date.now(),
            success: false,
            error: new Error(deleteRes.error.message),
          };
        }

        return { url, timestamp: Date.now(), success: true };
      } else if (page) {
        const upsertPageRes = await connectorsAPI.admin({
          majorCommand: "notion",
          command: "upsert-page",
          args: {
            wId: workspaceId,
            dsId: dataSourceId,
            pageId: page.id as string,
          },
        });

        if (upsertPageRes.isErr()) {
          return {
            url,
            timestamp: Date.now(),
            success: false,
            error: new Error(upsertPageRes.error.message),
          };
        }
        return { url, timestamp: Date.now(), success: true };
      } else if (db) {
        const upsertDbRes = await connectorsAPI.admin({
          majorCommand: "notion",
          command: "upsert-database",
          args: {
            wId: workspaceId,
            dsId: dataSourceId,
            databaseId: db.id as string,
          },
        });

        if (upsertDbRes.isErr()) {
          return {
            url,
            timestamp: Date.now(),
            success: false,
            error: new Error(upsertDbRes.error.message),
          };
        }

        return { url, timestamp: Date.now(), success: true };
      } else {
        return {
          url,
          timestamp: Date.now(),
          success: false,
          error: new Error(`No page or database found for url ${url}`),
        };
      }
    },
    { concurrency: 8 }
  );
}

export async function deleteUrls({
  urlsArray,
  dataSourceId,
  workspaceId,
}: {
  urlsArray: string[];
  dataSourceId: string;
  workspaceId: string;
}): Promise<URLOperationResult[]> {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  return concurrentExecutor(
    urlsArray,
    async (url) => {
      const checkUrlRes = await connectorsAPI.admin({
        majorCommand: "notion",
        command: "check-url",
        args: {
          wId: workspaceId,
          dsId: dataSourceId,
          url,
        },
      });

      if (checkUrlRes.isErr()) {
        return {
          url,
          timestamp: Date.now(),
          success: false,
          error: new Error(checkUrlRes.error.message),
        };
      }

      const { page, db } = checkUrlRes.value as {
        page: { [key: string]: unknown } | null;
        db: { [key: string]: unknown } | null;
      };

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      if ((page && !page.in_trash) || (db && !db.in_trash)) {
        return {
          url,
          timestamp: Date.now(),
          success: false,
          error: new Error(
            `URL ${url} still available on Notion, should not be deleted.`
          ),
        };
      }

      const deleteUrlRes = await connectorsAPI.admin({
        majorCommand: "notion",
        command: "delete-url",
        args: {
          wId: workspaceId,
          dsId: dataSourceId,
          url,
        },
      });

      if (deleteUrlRes.isErr()) {
        return {
          url,
          timestamp: Date.now(),
          success: false,
          error: new Error(
            `Could not delete url ${url}: ${deleteUrlRes.error.message}`
          ),
        };
      }

      return { url, timestamp: Date.now(), success: true };
    },
    { concurrency: 8 }
  );
}
