import type { LightWorkspaceType } from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import type { Logger } from "pino";

import { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

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
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);

  const dataSourceNames = new Set<string>();
  const dataSourceNameFinder = (obj: any, key: string) => {
    const value = obj[key];
    if (!isResourceSId("data_source_view", value)) {
      dataSourceNames.add(value);
    }
  };

  const apps = await AppResource.listByWorkspace(auth);

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
    await DataSourceViewResource.listForDataSourcesInVault(
      auth,
      dataSources,
      globalVault
    )
  ).reduce(
    (acc, dataSourceView) => ({
      ...acc,
      [dataSourceView.dataSource.name]: dataSourceView,
    }),
    {}
  );

  const replacer = (obj: any, key: string) => {
    const value = obj[key];
    if (!isResourceSId("data_source_view", value)) {
      obj[key] = dataSourceViews[value]?.sId;
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
        logger.info(`Migrating ${app.name}).`);

        if (execute) {
          await app.updateState(auth, state);
        }
      }
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    logger.info(`Migrate apps for ${workspace.sId}.`);
    await migrateApps(workspace, logger, execute);
    logger.info(`Finished migrate apps (${workspace.sId}).`);
  });
});
