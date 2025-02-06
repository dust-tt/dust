import type { AdminCommandType } from "@dust-tt/types";
import {
  concurrentExecutor,
  ConnectorsAPI,
  Err,
  NotionFindUrlResponseSchema,
  Ok,
} from "@dust-tt/types";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { isLeft } from "fp-ts/lib/Either";

const NOTION_OPERATIONS = ["Sync urls", "Delete urls"] as const;

export const notionUrlSyncPlugin = createPlugin(
  {
    id: "notion-url-sync",
    name: "Notion URLs sync/delete",
    description: "Sync or delete a Notion URL to Dust",
    resourceTypes: ["data_sources"],
    args: {
      operation: {
        type: "enum",
        label: "Operation",
        description: "Select operation to perform",
        values: NOTION_OPERATIONS,
      },
      urls: {
        type: "string",
        label: "URLs",
        description: "List of URLs to sync or delete, separated by a comma (,)",
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

    const urlsArray = urls.split(",").map((url) => url.trim());

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    if (operation === "Sync urls") {
      const notionCommand: AdminCommandType = {
        majorCommand: "notion",
        command: "find-url",
        args: {
          wId: auth.getNonNullableWorkspace().sId,
          dsId: dataSource.sId,
        },
      };

      const res = await concurrentExecutor(
        urlsArray,
        async (url) => {
          const findUrlRes = await connectorsAPI.admin({
            ...notionCommand,
            args: {
              ...notionCommand.args,
              url,
            },
          });

          if (findUrlRes.isErr()) {
            return new Err(new Error(findUrlRes.error.message));
          }

          const decoded = NotionFindUrlResponseSchema.decode(findUrlRes.value);
          if (isLeft(decoded)) {
            return new Err(new Error("Invalid response from Notion"));
          }

          const { page, db } = decoded.right;

          if (page) {
            const upsertPageRes = await connectorsAPI.admin({
              majorCommand: "notion",
              command: "upsert-page",
              args: {
                wId: auth.getNonNullableWorkspace().sId,
                dsId: dataSource.sId,
                pageId: page.notionPageId as string,
              },
            });

            if (upsertPageRes.isErr()) {
              return new Err(new Error(upsertPageRes.error.message));
            }

            return new Ok(`Upserted page ${page.notionPageId} for url ${url}`);
          } else if (db) {
            const upsertDbRes = await connectorsAPI.admin({
              majorCommand: "notion",
              command: "upsert-database",
              args: {
                wId: auth.getNonNullableWorkspace().sId,
                dsId: dataSource.sId,
                databaseId: db.notionDatabaseId as string,
              },
            });

            if (upsertDbRes.isErr()) {
              return new Err(new Error(upsertDbRes.error.message));
            }

            return new Ok(
              `Upserted database ${db.notionDatabaseId} for url ${url}`
            );
          } else {
            return new Err(
              new Error(`No page or database found for url ${url}`)
            );
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
    } else if (operation === "Delete urls") {
      const notionCommand: AdminCommandType = {
        majorCommand: "notion",
        command: "delete-url",
        args: {
          wId: auth.getNonNullableWorkspace().sId,
          dsId: dataSource.sId,
        },
      };

      const res = await concurrentExecutor(
        urlsArray,
        async (url) => {
          const res = await connectorsAPI.admin({
            ...notionCommand,
            args: {
              ...notionCommand.args,
              url,
            },
          });

          if (res.isErr()) {
            return new Err(
              new Error(`Could not delete url ${url}: ${res.error.message}`)
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
    } else {
      return new Err(new Error("Invalid operation"));
    }
  }
);
