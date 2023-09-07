import { Op, Transaction } from "sequelize";

import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import {
  RetrievalDocumentsEvent,
  RetrievalParamsEvent,
  runRetrieval,
} from "@app/lib/api/assistant/actions/retrieval";
import { _getAgentConfigurationType } from "@app/lib/api/assistant/agent_utils";
import {
  GenerationTokensEvent,
  renderConversationForModel,
  runGeneration,
} from "@app/lib/api/assistant/generation";
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
import { Err, Ok, Result } from "@app/lib/result";
import { generateModelSId } from "@app/lib/utils";
import { isRetrievalConfiguration } from "@app/types/assistant/actions/retrieval";
import {
  AgentDataSourceConfigurationType,
  isTemplatedQuery,
  isTimeFrame,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentActionSpecification,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";
import {
  AgentActionType,
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";

/**
 * Get an agent configuration from its name
 */
export async function getAgentConfiguration(auth: Authenticator, name: string) {
  const owner = auth.workspace();
  if (!owner) {
    return;
  }
  const agent = await AgentConfiguration.findOne({
    where: {
      name: name,
      workspaceId: owner.id,
    },
  });
  const agentGeneration = await AgentGenerationConfiguration.findOne({
    where: {
      agentId: agent?.id,
    },
  });
  const agentAction = await AgentRetrievalConfiguration.findOne({
    where: {
      agentId: agent?.id,
    },
  });
  const agentDataSources = agentAction?.id
    ? await AgentDataSourceConfiguration.findAll({
        where: {
          retrievalConfigurationId: agentAction?.id,
        },
      })
    : [];

  if (!agent) {
    return;
  }
  return await _getAgentConfigurationType({
    agent: agent,
    generation: agentGeneration,
    action: agentAction,
    dataSources: agentDataSources,
  });
}

/**
 * Create a new Agent
 */
export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    pictureUrl,
    action,
    generation,
  }: {
    name: string;
    pictureUrl?: string;
    action?: AgentActionConfigurationType;
    generation?: AgentGenerationConfigurationType;
  }
): Promise<AgentConfigurationType | void> {
  const owner = auth.workspace();
  if (!owner) {
    return;
  }

  return await front_sequelize.transaction(async (t) => {
    let agentConfigRow: AgentConfiguration | null = null;
    let agentGenerationConfigRow: AgentGenerationConfiguration | null = null;
    let agentActionConfigRow: AgentRetrievalConfiguration | null = null;
    let agentDataSourcesConfigRows: AgentDataSourceConfiguration[] = [];

    // Create AgentConfiguration
    agentConfigRow = await AgentConfiguration.create(
      {
        sId: generateModelSId(),
        status: "active",
        name: name,
        pictureUrl: pictureUrl ?? null,
        scope: "workspace",
        workspaceId: owner.id,
      },
      { transaction: t }
    );

    // Create AgentGenerationConfiguration
    if (generation) {
      agentGenerationConfigRow = await AgentGenerationConfiguration.create(
        {
          prompt: generation.prompt,
          modelProvider: generation.model.providerId,
          modelId: generation.model.modelId,
          agentId: agentConfigRow.id,
        },
        { transaction: t }
      );
    }

    // Create AgentRetrievalConfiguration
    if (action) {
      const query = action.query;
      const timeframe = action.relativeTimeFrame;
      agentActionConfigRow = await AgentRetrievalConfiguration.create(
        {
          query: isTemplatedQuery(query) ? "templated" : query,
          queryTemplate: isTemplatedQuery(query) ? query.template : null,
          relativeTimeFrame: isTimeFrame(timeframe) ? "custom" : timeframe,
          relativeTimeFrameDuration: isTimeFrame(timeframe)
            ? timeframe.duration
            : null,
          relativeTimeFrameUnit: isTimeFrame(timeframe) ? timeframe.unit : null,
          topK: action.topK,
          agentId: agentConfigRow.id,
        },
        { transaction: t }
      );
    }

    // Create AgentDataSourceConfiguration
    if (agentActionConfigRow && action?.dataSources) {
      agentDataSourcesConfigRows = await _createAgentDataSourcesConfigData(
        t,
        action.dataSources,
        agentActionConfigRow.id
      );
    }

    return await _getAgentConfigurationType({
      agent: agentConfigRow,
      action: agentActionConfigRow,
      generation: agentGenerationConfigRow,
      dataSources: agentDataSourcesConfigRows,
    });
  });
}

/**
 * Create the AgentDataSourceConfiguration rows in database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obvisously need to do as few queries as possible.
 */
async function _createAgentDataSourcesConfigData(
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

export async function updateAgentConfiguration(
  auth: Authenticator,
  configurationId: string,
  {
    name,
    pictureUrl,
    status,
    action,
    generation,
  }: {
    name: string;
    pictureUrl?: string;
    status: AgentConfigurationStatus;
    action?: AgentActionConfigurationType;
    generation?: AgentGenerationConfigurationType;
  }
): Promise<AgentConfigurationType> {
  return {
    sId: generateModelSId(),
    name,
    pictureUrl: pictureUrl ?? null,
    status,
    action: action ?? null,
    generation: generation ?? null,
  };
}

/**
 * Action Inputs generation.
 */

// This method is used by actions to generate its inputs if needed.
export async function generateActionInputs(
  auth: Authenticator,
  specification: AgentActionSpecification,
  conversation: ConversationType
): Promise<Result<Record<string, string | boolean | number>, Error>> {
  const model = {
    providerId: "openai",
    modelId: "gpt-3.5-turbo-16k",
  };
  const allowedTokenCount = 12288; // for 16k model.

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    allowedTokenCount,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-inputs-generator"].config
  );
  config.MODEL.function_call = specification.name;
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runAction(auth, "assistant-v2-inputs-generator", config, [
    {
      conversation: modelConversationRes.value,
      specification,
    },
  ]);

  if (res.isErr()) {
    return new Err(new Error(`Error generating action inputs: ${res.error}`));
  }

  const run = res.value;

  const output: Record<string, string | boolean | number> = {};
  for (const t of run.traces) {
    if (t[1][0][0].error) {
      return new Err(
        new Error(`Error generating action inputs: ${t[1][0][0].error}`)
      );
    }
    if (t[0][1] === "OUTPUT") {
      const v = t[1][0][0].value as any;
      for (const k in v) {
        if (
          typeof v[k] === "string" ||
          typeof v[k] === "boolean" ||
          typeof v[k] === "number"
        ) {
          output[k] = v[k];
        }
      }
    }
  }

  return new Ok(output);
}

/**
 * Agent execution.
 */

// Generic event sent when an error occured (whether it's during the action or the message generation).
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

// Event sent durint the execution of an action. These are action specific.
export type AgentActionEvent = RetrievalParamsEvent | RetrievalDocumentsEvent;

// Event sent once the action is completed, we're moving to generating a message if applicable.
export type AgentActionSuccessEvent = {
  type: "agent_action_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentActionType;
};

// Event sent once the generation is completed.
export type AgentGenerationSuccessEvent = {
  type: "agent_generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// Event sent once the message is completed and successful.
export type AgentMessageSuccessEvent = {
  type: "agent_message_success";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
};

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runAgent(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentMessageSuccessEvent
> {
  // First run the action if a configuration is present.
  if (configuration.action !== null) {
    if (isRetrievalConfiguration(configuration.action)) {
      const eventStream = runRetrieval(
        auth,
        configuration,
        conversation,
        userMessage,
        agentMessage
      );

      for await (const event of eventStream) {
        if (event.type === "retrieval_params") {
          yield event;
        }
        if (event.type === "retrieval_documents") {
          yield event;
        }
        if (event.type === "retrieval_error") {
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
        }
        if (event.type === "retrieval_success") {
          yield {
            type: "agent_action_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          };

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.action = event.action;
        }
      }
    } else {
      throw new Error(
        "runAgent implementation missing for action configuration"
      );
    }

    // Then run the generation if a configuration is present.
    if (configuration.generation !== null) {
      const eventStream = runGeneration(
        auth,
        configuration,
        conversation,
        userMessage,
        agentMessage
      );

      for await (const event of eventStream) {
        if (event.type === "generation_tokens") {
          yield event;
        }
        if (event.type === "generation_error") {
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
        }
        if (event.type === "generation_success") {
          yield {
            type: "agent_generation_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            text: event.text,
          };
        }
      }
    }
  }

  yield {
    type: "agent_error",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: generateModelSId(),
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}
