import { ConnectorsAPI, isRetrievalConfiguration } from "@dust-tt/types";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { getDataSource } from "@app/lib/api/data_sources";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  AgentDataSourceConfiguration,
  AgentRetrievalConfiguration,
  DataSource,
} from "@app/lib/models";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    wId: { type: "string", demandOption: true },
  },
  async ({ execute, wId }) => {
    const auth = await Authenticator.internalAdminForWorkspace(wId);
    const agents = (
      await getAgentConfigurations({
        auth,
        agentsGetView: "admin_internal",
        variant: "full",
      })
    ).filter(
      (a) =>
        !Object.values(GLOBAL_AGENTS_SID).includes(a.sId as GLOBAL_AGENTS_SID)
    );

    const dataSource = await getDataSource(auth, "managed-github");
    const connectorId = dataSource?.connectorId;
    if (!dataSource || !connectorId) {
      throw new Error("No managed-github data source found");
    }
    const dsModel = await DataSource.findOne({
      where: {
        id: dataSource.id,
      },
    });
    if (!dsModel) {
      throw new Error(`Could not find data source ${dataSource.id}`);
    }

    const connectorsAPI = new ConnectorsAPI(logger);
    const pRes = await connectorsAPI.getConnectorPermissions({
      connectorId,
      filterPermission: "read",
    });
    if (pRes.isErr()) {
      throw new Error("Could not fetch connector permissions");
    }
    const { resources: permissions } = pRes.value;

    const repoToSubPermissions: {
      [key: string]: { name: string; subPermissions: string[] };
    } = {};

    await Promise.all(
      permissions.map(async (p) => {
        const pRes = await connectorsAPI.getConnectorPermissions({
          connectorId,
          filterPermission: "read",
          parentId: p.internalId,
        });
        if (pRes.isErr()) {
          throw new Error("Could not fetch connector permissions");
        }
        const { resources: permissions } = pRes.value;
        repoToSubPermissions[p.internalId] = {
          name: p.title,
          subPermissions: permissions.map((p) => p.internalId),
        };
      })
    );

    console.log(repoToSubPermissions);

    for (const a of agents) {
      const action = a.action;
      if (isRetrievalConfiguration(action)) {
        const retrievalConfiguration =
          await AgentRetrievalConfiguration.findOne({
            where: {
              id: action.id,
            },
          });
        if (!retrievalConfiguration) {
          throw new Error(
            `Could not find retrieval configuration ${action.id}`
          );
        }

        const githubDs = action.dataSources.filter(
          (ds) => ds.dataSourceId === "managed-github"
        );
        if (githubDs.length > 0) {
          if (githubDs.length > 1) {
            throw new Error(
              `Found more than one github data source for ${a.sId}`
            );
          }
          const dataSourceConfiguration =
            await AgentDataSourceConfiguration.findOne({
              where: {
                dataSourceId: dsModel.id,
                retrievalConfigurationId: retrievalConfiguration.id,
              },
            });
          if (!dataSourceConfiguration) {
            throw new Error(
              `Could not find data source configuration for ${dsModel.id} and ${retrievalConfiguration.id}`
            );
          }

          const dsConfig = githubDs[0];
          let newParentsIn: string[] = [];
          const oldParentsIn = dataSourceConfiguration.parentsIn;

          if (dsConfig.filter.parents) {
            dsConfig.filter.parents.in.forEach((p) => {
              const repo = repoToSubPermissions[p];
              if (!repo) {
                newParentsIn.push(p);
              } else {
                newParentsIn = [
                  ...new Set(newParentsIn.concat(repo.subPermissions)),
                ];
              }
            });
          } else {
            newParentsIn = Object.values(repoToSubPermissions).flatMap(
              (r) => r.subPermissions
            );
          }

          console.log(
            `ASSISTANT ${a.sId} [${a.scope}] ${oldParentsIn} -> ${newParentsIn}`
          );

          if (execute) {
            dataSourceConfiguration.parentsIn = newParentsIn;
            if (
              newParentsIn !== null &&
              dataSourceConfiguration.parentsNotIn === null
            ) {
              dataSourceConfiguration.parentsNotIn = [];
            }
            await dataSourceConfiguration.save();
          }
        }
      }
    }
  }
);
