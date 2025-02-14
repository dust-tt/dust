import type { Result } from "@dust-tt/types";
import {
  concurrentExecutor,
  ConnectorsAPI,
  Err,
  NotionFindUrlResponseSchema,
  Ok,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";

import config from "@app/lib/api/config";
import type { PluginResponse } from "@app/lib/api/poke/types";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

const NOTION_OPERATIONS = ["Sync urls", "Delete urls"] as const;

export const notionUrlSyncPlugin = createPlugin(
  {
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
        values: NOTION_OPERATIONS,
      },
      urls: {
        type: "text",
        label: "URLs",
        description:
          "List of URLs to sync or delete, separated by a comma (,) or newline",
      },
    },
  },
  async (auth, dataSourceId, args) => {
    if (!dataSourceId) {
      return new Err(new Error("Data source not found."));
    }

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "notion") {
      return new Err(new Error("Data source is not Notion."));
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
      return syncNotionUrls({
        urlsArray,
        dataSourceId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      });
    } else if (operation === "Delete urls") {
      return deleteUrls({
        urlsArray,
        dataSourceId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      });
    } else {
      return new Err(new Error("Invalid operation"));
    }
  }
);

export async function syncNotionUrls({
  urlsArray,
  dataSourceId,
  workspaceId,
}: {
  urlsArray: string[];
  dataSourceId: string;
  workspaceId: string;
}): Promise<Result<PluginResponse, Error>> {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const res = await concurrentExecutor(
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
        return new Err(new Error(checkUrlRes.error.message));
      }

      const decoded = NotionFindUrlResponseSchema.decode(checkUrlRes.value);
      if (isLeft(decoded)) {
        return new Err(
          new Error("Unreachable: Invalid response from dust API")
        );
      }

      const { page, db } = decoded.right;
      if (page) {
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
          return new Err(new Error(upsertPageRes.error.message));
        }

        return new Ok(`Upserted page ${page.id} for url ${url}`);
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
          return new Err(new Error(upsertDbRes.error.message));
        }

        return new Ok(`Upserted database ${db.id} for url ${url}`);
      } else {
        return new Err(new Error(`No page or database found for url ${url}`));
      }
    },
    { concurrency: 8 }
  );

  if (res.some((r) => r.isErr())) {
    return new Err(
      new Error(
        res.map((r) => (r.isErr() ? r.error.message : r.value)).join("\n")
      )
    );
  }

  return new Ok({
    display: "text",
    value: `Synced ${urlsArray.length} URLs from Notion.`,
  });
}

export async function deleteUrls({
  urlsArray,
  dataSourceId,
  workspaceId,
}: {
  urlsArray: string[];
  dataSourceId: string;
  workspaceId: string;
}): Promise<Result<PluginResponse, Error>> {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const res = await concurrentExecutor(
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
        return new Err(new Error(checkUrlRes.error.message));
      }

      const { page, db } = checkUrlRes.value as {
        page: { [key: string]: unknown } | null;
        db: { [key: string]: unknown } | null;
      };

      if ((page && !page.in_trash) || (db && !db.in_trash)) {
        return new Err(
          new Error(
            `URL ${url} still available on Notion, should not be deleted.`
          )
        );
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
        return new Err(
          new Error(
            `Could not delete url ${url}: ${deleteUrlRes.error.message}`
          )
        );
      }

      return new Ok(`Deleted url ${url}`);
    },
    { concurrency: 8 }
  );

  if (res.some((r) => r.isErr())) {
    return new Err(
      new Error(
        res.map((r) => (r.isErr() ? r.error.message : r.value)).join("\n")
      )
    );
  }

  return new Ok({
    display: "text",
    value: `Deleted ${urlsArray.length} URLs from Notion.`,
  });
}
