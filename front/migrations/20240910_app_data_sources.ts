import * as fs from "fs";
import type { Logger } from "pino";

import { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { removeNulls } from "@app/types";
function searchInJson(
  obj: any,
  targetKey: string,
  call: (obj: any, key: string) => void
) {
  if (typeof obj !== "object" || obj === null) {
    return;
  }

  for (const key in obj) {
    if (key === targetKey) {
      call(obj, key);
    } else if (typeof obj[key] === "object") {
      searchInJson(obj[key], targetKey, call);
    } else if (Array.isArray(obj)) {
      obj.reduce(
        (acc, item) => acc || searchInJson(item, targetKey, call),
        false
      );
    }
  }
}

async function migrateApps(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean,
  before: fs.WriteStream,
  after: fs.WriteStream
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const spaces = await SpaceResource.listWorkspaceSpaces(auth);

  for (const space of spaces) {
    const apps = await AppResource.listBySpace(auth, space);
    if (apps.length > 0) {
      logger.info(`Found ${apps.length} apps in space ${space.name}.`);

      const dataSourceNames = new Set<string>();
      const dataSourceNameFinder = (obj: any, key: string) => {
        const value = obj[key];
        if (!isResourceSId("data_source_view", value)) {
          dataSourceNames.add(value);
        }
      };

      for (const app of apps) {
        if (app.savedConfig) {
          const config = JSON.parse(app.savedConfig);
          searchInJson(config, "data_source_id", dataSourceNameFinder);
        }

        if (app.savedSpecification) {
          const specification = JSON.parse(app.savedSpecification);
          searchInJson(specification, "data_source_id", dataSourceNameFinder);
        }
      }

      logger.info({}, `Found data sources : ${[...dataSourceNames]}`);

      const dataSources = removeNulls(
        await Promise.all(
          [...dataSourceNames].map((dataSource) =>
            DataSourceResource.fetchByNameOrId(auth, dataSource)
          )
        )
      );

      const dataSourceViews: Record<string, DataSourceViewResource> = (
        await DataSourceViewResource.listForDataSourcesInSpace(
          auth,
          dataSources,
          space
        )
      ).reduce(
        (acc, dataSourceView) => ({
          ...acc,
          [dataSourceView.dataSource.name]: dataSourceView,
        }),
        {}
      );

      logger.info(
        {},
        `Will replace : ${Object.entries(dataSourceViews).map((dsv) => dsv[0] + " -> " + dsv[1].sId)}`
      );

      const replacer = (obj: any, key: string) => {
        const value = obj[key];
        if (!isResourceSId("data_source_view", value)) {
          if (dataSourceViews[value]?.sId) {
            obj[key] = dataSourceViews[value]?.sId;
          } else {
            logger.warn({}, `Cannot find datasource ${value} in ${space.name}`);
          }
        }
      };

      for (const app of apps) {
        if (app.savedConfig && app.savedSpecification) {
          const state = {
            savedSpecification: app.savedSpecification,
            savedConfig: app.savedConfig,
          };
          const config = JSON.parse(app.savedConfig);
          searchInJson(config, "data_source_id", replacer);
          state.savedConfig = JSON.stringify(config);

          const specification = JSON.parse(app.savedSpecification);
          searchInJson(specification, "data_source_id", replacer);
          state.savedSpecification = JSON.stringify(specification);
          if (
            state.savedConfig !== app.savedConfig ||
            state.savedSpecification !== app.savedSpecification
          ) {
            before.write(
              JSON.stringify({
                id: app.id,
                savedConfig: app.savedConfig,
                savedSpecification: app.savedSpecification,
              })
            );
            before.write("\n");

            after.write(
              JSON.stringify({
                id: app.id,
                savedConfig: state.savedConfig,
                savedSpecification: state.savedSpecification,
              })
            );
            after.write("\n");

            logger.info(`Migrating ${app.name}).`);

            if (execute) {
              await AppResource.model.update(state, {
                where: {
                  id: app.id,
                },
              });
            }
          }
        }
      }
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  const before = fs.createWriteStream("apps-before.jsonl");
  const after = fs.createWriteStream("apps-after.jsonl");
  await runOnAllWorkspaces(async (workspace) => {
    logger.info(`Migrate apps for ${workspace.sId}.`);
    await migrateApps(workspace, logger, execute, before, after);
    logger.info(`Finished migrate apps (${workspace.sId}).`);
  });
  before.end();
  after.end();
});
