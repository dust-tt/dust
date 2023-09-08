import { Op, Transaction } from "sequelize";

import {
  _buildAgentActionConfigurationTypeFromModel,
  _buildAgentConfigurationTypeFromModel,
  _buildAgentGenerationConfigurationTypeFromModel,
} from "@app/lib/api/assistant/agent/agent_get";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { DataSource, Workspace } from "@app/lib/models";
import {
  AgentDataSourceConfiguration,
  AgentRetrievalConfiguration,
} from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentConfiguration,
  AgentGenerationConfiguration,
} from "@app/lib/models/assistant/agent";
import { generateModelSId } from "@app/lib/utils";
import {
  AgentDataSourceConfigurationType,
  isTemplatedQuery,
  isTimeFrame,
  RetrievalDataSourcesConfiguration,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";

/**
 * Create Agent Configuration
 */
export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    pictureUrl,
    status,
  }: {
    name: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
  }
): Promise<AgentConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot create AgentConfiguration without workspace");
  }

  const agentConfig = await AgentConfiguration.create({
    sId: generateModelSId(),
    status: status,
    name: name,
    pictureUrl: pictureUrl,
    scope: "workspace",
    workspaceId: owner.id,
  });

  return _buildAgentConfigurationTypeFromModel({
    agent: agentConfig,
  });
}

/**
 * Create Agent Generation Configuration
 */
export async function createAgentGenerationConfiguration(
  auth: Authenticator,
  agentSid: string,
  {
    prompt,
    modelProvider,
    modelId,
  }: {
    prompt: string;
    modelProvider: string;
    modelId: string;
  }
): Promise<AgentGenerationConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Workspace not found"
    );
  }

  const agentConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentSid,
    },
  });
  if (!agentConfig) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Agent not found"
    );
  }

  const generation = await AgentGenerationConfiguration.create({
    prompt: prompt,
    modelProvider: modelProvider,
    modelId: modelId,
    agentId: agentConfig.id,
  });

  return _buildAgentGenerationConfigurationTypeFromModel(generation);
}

/**
 * Create Agent Action Configuration (Retrieval)
 */
export async function createAgentActionRetrievalConfiguration(
  auth: Authenticator,
  agentSid: string,
  {
    query,
    timeframe,
    topK,
    dataSources,
  }: {
    query: RetrievalQuery;
    timeframe: RetrievalTimeframe;
    topK: number;
    dataSources: RetrievalDataSourcesConfiguration;
  }
): Promise<AgentActionConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Cannot create AgentActionConfiguration: Workspace not found"
    );
  }

  const agentConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentSid,
    },
  });
  if (!agentConfig) {
    throw new Error("Cannot create AgentActionConfiguration: Agent not found");
  }
  return await front_sequelize.transaction(async (t) => {
    const agentActionConfigRow = await AgentRetrievalConfiguration.create(
      {
        query: isTemplatedQuery(query) ? "templated" : query,
        queryTemplate: isTemplatedQuery(query) ? query.template : null,
        relativeTimeFrame: isTimeFrame(timeframe) ? "custom" : timeframe,
        relativeTimeFrameDuration: isTimeFrame(timeframe)
          ? timeframe.duration
          : null,
        relativeTimeFrameUnit: isTimeFrame(timeframe) ? timeframe.unit : null,
        topK: topK,
        agentId: agentConfig.id,
      },
      { transaction: t }
    );
    const agentDataSourcesConfigRows = await _createAgentDataSourcesConfigData(
      t,
      dataSources,
      agentActionConfigRow.id
    );
    return await _buildAgentActionConfigurationTypeFromModel(
      agentActionConfigRow,
      agentDataSourcesConfigRows
    );
  });
}

/**
 * Create the AgentDataSourceConfiguration rows in database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obvisously need to do as few queries as possible.
 */
export async function _createAgentDataSourcesConfigData(
  t: Transaction,
  dataSourcesConfig: AgentDataSourceConfigurationType[],
  agentActionId: number
): Promise<AgentDataSourceConfiguration[]> {
  // dsConfig contains this format:
  // [
  //   { workspaceSId: s1o1u1p, dataSourceName: "managed-notion", filter: { tags: null, parents: null } },
  //   { workspaceSId: s1o1u1p, dataSourceName: "managed-slack", filter: { tags: null, parents: null } },
  //   { workspaceSId: i2n2o2u, dataSourceName: "managed-notion", filter: { tags: null, parents: null } },
  // ]

  // First we get the list of workspaces because we need the mapping between workspaceSId and workspaceId
  const workspaces = await Workspace.findAll({
    where: {
      sId: dataSourcesConfig.map((dsConfig) => dsConfig.workspaceSId),
    },
    attributes: ["id", "sId"],
  });

  // Now will want to group the datasource names by workspaceId to do only one query per workspace.
  // We want this:
  // [
  //   { workspaceId: 1, dataSourceNames: [""managed-notion", "managed-slack"] },
  //   { workspaceId: 2, dataSourceNames: ["managed-notion"] }
  // ]
  type _DsNamesPerWorkspaceIdType = {
    workspaceId: number;
    dataSourceNames: string[];
  };
  const dsNamesPerWorkspaceId = dataSourcesConfig.reduce(
    (
      acc: _DsNamesPerWorkspaceIdType[],
      curr: AgentDataSourceConfigurationType
    ) => {
      // First we need to get the workspaceId from the workspaceSId
      const workspace = workspaces.find((w) => w.sId === curr.workspaceSId);
      if (!workspace) {
        throw new Error("Workspace not found");
      }

      // Find an existing entry for this workspaceId
      const existingEntry: _DsNamesPerWorkspaceIdType | undefined = acc.find(
        (entry: _DsNamesPerWorkspaceIdType) =>
          entry.workspaceId === workspace.id
      );
      if (existingEntry) {
        // Append dataSourceName to existing entry
        existingEntry.dataSourceNames.push(curr.dataSourceName);
      } else {
        // Add a new entry for this workspaceId
        acc.push({
          workspaceId: workspace.id,
          dataSourceNames: [curr.dataSourceName],
        });
      }
      return acc;
    },
    []
  );

  // Then we get do one findAllQuery per workspaceId, in a Promise.all
  const getDataSourcesQueries = dsNamesPerWorkspaceId.map(
    ({ workspaceId, dataSourceNames }) => {
      return DataSource.findAll({
        where: {
          workspaceId,
          name: {
            [Op.in]: dataSourceNames,
          },
        },
      });
    }
  );
  const results = await Promise.all(getDataSourcesQueries);
  const dataSources = results.flat();

  const agentDataSourcesConfigRows: AgentDataSourceConfiguration[] =
    await Promise.all(
      dataSourcesConfig.map(async (dsConfig) => {
        const dataSource = dataSources.find(
          (ds) =>
            ds.name === dsConfig.dataSourceName &&
            ds.workspaceId ===
              workspaces.find((w) => w.sId === dsConfig.workspaceSId)?.id
        );
        if (!dataSource) {
          throw new Error("DataSource not found");
        }
        return AgentDataSourceConfiguration.create(
          {
            dataSourceId: dataSource.id,
            tagsIn: dsConfig.filter.tags?.in,
            tagsNotIn: dsConfig.filter.tags?.not,
            parentsIn: dsConfig.filter.parents?.in,
            parentsNotIn: dsConfig.filter.parents?.not,
            retrievalConfigurationId: agentActionId,
          },
          { transaction: t }
        );
      })
    );
  return agentDataSourcesConfigRows;
}
