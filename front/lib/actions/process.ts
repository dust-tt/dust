import _ from "lodash";

import {
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_SEARCH_LABELS_ACTION_NAME,
  PROCESS_ACTION_TOP_K,
} from "@app/lib/actions/constants";
import type {
  DataSourceConfiguration,
  RetrievalTimeframe,
} from "@app/lib/actions/retrieval";
import {
  applyDataSourceFilters,
  retrievalAutoTimeFrameInputSpecification,
  retrievalTagsInputSpecification,
} from "@app/lib/actions/retrieval";
import { runActionStreamed } from "@app/lib/actions/server";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import type { BaseActionRunParams } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/actions/types";
import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
  TimeFrame,
  UserMessageType,
} from "@app/types";
import { Ok, parseTimeFrame, timeFrameFromNow } from "@app/types";

export const PROCESS_SCHEMA_ALLOWED_TYPES = [
  "string",
  "number",
  "boolean",
] as const;

// Properties in the process configuration table are stored as an array of objects.
export type ProcessSchemaPropertyType = {
  name: string;
  type: (typeof PROCESS_SCHEMA_ALLOWED_TYPES)[number];
  description: string;
};

function renderSchemaPropertiesAsJSONSchema(
  schema: ProcessSchemaPropertyType[]
): { [name: string]: { type: string; description: string } } {
  let jsonSchema: { [name: string]: { type: string; description: string } } =
    {};

  if (schema.length > 0) {
    schema.forEach((f) => {
      jsonSchema[f.name] = {
        type: f.type,
        description: f.description,
      };
    });
  } else {
    // Default schema for extraction.
    jsonSchema = {
      required_data: {
        type: "string",
        description:
          "Minimal (short and concise) piece of information extracted to follow instructions",
      },
    };
  }

  return jsonSchema;
}

export type ProcessConfigurationType = {
  id: ModelId;
  sId: string;

  type: "process_configuration";

  dataSources: DataSourceConfiguration[];
  relativeTimeFrame: RetrievalTimeframe;
  schema: ProcessSchemaPropertyType[];

  name: string;
  description: string | null;
};

export type ProcessActionOutputsType = {
  data: unknown[];
  min_timestamp: number;
  total_documents: number;
  total_chunks: number;
  total_tokens: number;
};

// Event sent before the execution with the finalized params to be used.
type ProcessParamsEvent = {
  type: "process_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: DataSourceConfiguration[];
  action: ProcessActionType;
};

type ProcessErrorEvent = {
  type: "process_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

type ProcessSuccessEvent = {
  type: "process_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ProcessActionType;
};

export type ProcessActionRunningEvents = ProcessParamsEvent;

type ProcessActionBlob = ExtractActionBlob<ProcessActionType>;

export class ProcessActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    relativeTimeFrame: TimeFrame | null;
    tagsIn: string[] | null;
    tagsNot: string[] | null;
  };
  readonly schema: ProcessSchemaPropertyType[];
  readonly outputs: ProcessActionOutputsType | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "process_action";

  constructor(blob: ProcessActionBlob) {
    super(blob.id, blob.type);

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.schema = blob.schema;
    this.outputs = blob.outputs;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_PROCESS_ACTION_NAME,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    let content = "";

    content += "PROCESSED OUTPUTS:\n";

    if (this.outputs) {
      if (this.outputs.data.length === 0) {
        content += "(none)\n";
      } else {
        for (const o of this.outputs.data) {
          content += `${JSON.stringify(o)}\n`;
        }
      }
    } else if (this.outputs === null) {
      content += "(processing failed)\n";
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "process_data_sources",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class ProcessConfigurationServerRunner extends BaseActionConfigurationServerRunner<ProcessConfigurationType> {
  // Generates the action specification for generation of rawInputs passed to `run`.
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runRetrieval`");
    }

    const { actionConfiguration } = this;

    const spec = await processActionSpecification({
      actionConfiguration,
      name,
      description:
        description ??
        "Process data sources specified by the user over a specific time-frame by extracting" +
          " structured blobs of information (complying to a fixed schema).",
    });
    return new Ok(spec);
  }

  getSupportingActions(): ActionConfigurationType[] {
    const hasAutoTags = this.actionConfiguration.dataSources.some(
      (ds) => ds.filter.tags?.mode === "auto"
    );

    if (hasAutoTags) {
      return [
        {
          id: -1,
          sId: generateRandomModelSId(),
          type: "search_labels_configuration",
          // Tool name must be unique. We use the parent tool name to make it unique.
          name: `${DEFAULT_SEARCH_LABELS_ACTION_NAME}_${this.actionConfiguration.name}`,
          dataSourceViewIds: this.actionConfiguration.dataSources.map(
            (ds) => ds.dataSourceViewId
          ),
          parentTool: this.actionConfiguration.name,
        },
      ];
    }

    return [];
  }

  // This method is in charge of running the retrieval and creating an AgentProcessAction object in
  // the database. It does not create any generic model related to the conversation. It is possible
  // for an AgentProcessAction to be stored (once the query params are infered) but for its execution
  // to fail, in which case an error event will be emitted and the AgentProcessAction won't have any
  // outputs associated. The error is expected to be stored by the caller on the parent agent message.
  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      userMessage,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams & {
      userMessage: UserMessageType;
    }
  ): AsyncGenerator<
    ProcessParamsEvent | ProcessSuccessEvent | ProcessErrorEvent,
    void
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `process`");
    }

    const { actionConfiguration } = this;

    let relativeTimeFrame: TimeFrame | null = null;

    if (
      actionConfiguration.relativeTimeFrame !== "none" &&
      actionConfiguration.relativeTimeFrame !== "auto"
    ) {
      relativeTimeFrame = actionConfiguration.relativeTimeFrame;
    }

    if (actionConfiguration.relativeTimeFrame === "auto") {
      if (
        rawInputs.relativeTimeFrame &&
        typeof rawInputs.relativeTimeFrame === "string"
      ) {
        relativeTimeFrame = parseTimeFrame(rawInputs.relativeTimeFrame);
      }
    }

    let globalTagsIn: string[] | null = null;
    let globalTagsNot: string[] | null = null;
    if (
      rawInputs.tagsIn &&
      Array.isArray(rawInputs.tagsIn) &&
      rawInputs.tagsIn.every((tag): tag is string => typeof tag === "string")
    ) {
      globalTagsIn = rawInputs.tagsIn;
    }
    if (
      rawInputs.tagsNot &&
      Array.isArray(rawInputs.tagsNot) &&
      rawInputs.tagsNot.every((tag): tag is string => typeof tag === "string")
    ) {
      globalTagsNot = rawInputs.tagsNot;
    }

    const objective =
      typeof rawInputs.objective === "string" ? rawInputs.objective : "n/a";

    const { model } = agentConfiguration;

    const supportedModel = getSupportedModelConfig(model);
    const contextSize = supportedModel.contextSize;

    // Create the AgentProcessAction object in the database and yield an event for the generation of
    // the params. We store the action here as the params have been generated, if an error occurs
    // later on, the action won't have outputs but the error will be stored on the parent agent
    // message.
    const action = await AgentProcessAction.create({
      relativeTimeFrameDuration: relativeTimeFrame?.duration ?? null,
      relativeTimeFrameUnit: relativeTimeFrame?.unit ?? null,
      processConfigurationId: actionConfiguration.sId,
      schema: actionConfiguration.schema,
      functionCallId,
      functionCallName: actionConfiguration.name,
      tagsIn: globalTagsIn,
      tagsNot: globalTagsNot,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: owner.id,
    });

    const now = Date.now();

    yield {
      type: "process_params",
      created: now,
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      dataSources: actionConfiguration.dataSources,
      action: new ProcessActionType({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        params: {
          relativeTimeFrame,
          tagsIn: globalTagsIn,
          tagsNot: globalTagsNot,
        },
        schema: action.schema,
        outputs: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
        type: "process_action",
        generatedFiles: [],
      }),
    };

    const prompt = await constructPromptMultiActions(auth, {
      userMessage,
      agentConfiguration,
      fallbackPrompt:
        "Process the retrieved data to extract structured information based on the provided schema.",
      model: supportedModel,
      hasAvailableActions: false,
    });

    const dataSourceViews = await DataSourceViewResource.fetchByIds(
      auth,
      _.uniq(actionConfiguration.dataSources.map((ds) => ds.dataSourceViewId))
    );
    const dataSourceViewsMap = Object.fromEntries(
      dataSourceViews.map((dsv) => [dsv.sId, dsv])
    );

    const config = cloneBaseConfig(
      getDustProdAction("assistant-v2-process").config
    );

    // Set the process action model configuration to the agent model configuration.
    config.MODEL.provider_id = model.providerId;
    config.MODEL.model_id = model.modelId;
    config.MODEL.temperature = model.temperature;

    // Handle data sources list and parents/tags filtering.
    config.DATASOURCE.data_sources = actionConfiguration.dataSources.map(
      (d) => ({
        workspace_id: d.workspaceId,
        // Note: This value is passed to the registry for lookup. The registry will return the
        // associated data source's dustAPIDataSourceId.
        data_source_id: d.dataSourceViewId,
      })
    );

    applyDataSourceFilters(
      config,
      actionConfiguration.dataSources,
      dataSourceViewsMap,
      globalTagsIn,
      globalTagsNot
    );

    // Handle timestamp filtering.
    if (relativeTimeFrame) {
      config.DATASOURCE.filter.timestamp = {
        gt: timeFrameFromNow(relativeTimeFrame),
      };
    }

    config.DATASOURCE.top_k = PROCESS_ACTION_TOP_K;

    const res = await runActionStreamed(
      auth,
      "assistant-v2-process",
      config,
      [
        {
          context_size: contextSize,
          prompt,
          schema: renderSchemaPropertiesAsJSONSchema(
            actionConfiguration.schema
          ),
          objective,
        },
      ],
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        userMessageId: userMessage.sId,
      }
    );

    if (res.isErr()) {
      logger.error(
        {
          workspaceId: owner.id,
          conversationId: conversation.id,
          error: res.error,
        },
        "Error running process"
      );
      yield {
        type: "process_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "process_execution_error",
          message: `Error running process app: ${res.error.message}`,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = res.value;
    let outputs: ProcessActionOutputsType | null = null;

    for await (const event of eventStream) {
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running process"
        );
        yield {
          type: "process_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "process_execution_error",
            message: `Error running process app: ${event.content.message}`,
          },
        };
        return;
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          logger.error(
            {
              workspaceId: owner.id,
              conversationId: conversation.id,
              error: e.error,
            },
            "Error running process"
          );
          yield {
            type: "process_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "process_execution_error",
              message: `Error running process app: ${e.error}`,
            },
          };
          return;
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
          outputs = e.value as ProcessActionOutputsType;
        }
      }
    }

    // Update ProcessAction with the output of the last block.
    await action.update({
      outputs,
      runId: await dustRunId,
    });

    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Finished process action run execution"
    );

    yield {
      type: "process_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ProcessActionType({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        params: {
          relativeTimeFrame,
          tagsIn: globalTagsIn,
          tagsNot: globalTagsNot,
        },
        schema: action.schema,
        outputs,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
        type: "process_action",
        generatedFiles: [],
      }),
    };
  }
}

async function processActionSpecification({
  actionConfiguration,
  name,
  description,
}: {
  actionConfiguration: ProcessConfigurationType;
  name: string;
  description: string;
}): Promise<AgentActionSpecification> {
  const inputs = [];

  inputs.push({
    name: "objective",
    description:
      "The objective behind the use of the tool based on the conversation state." +
      " This is used to guide the tool to extract the right data based on the user request.",
    type: "string" as const,
  });

  if (actionConfiguration.relativeTimeFrame === "auto") {
    inputs.push(retrievalAutoTimeFrameInputSpecification());
  }

  if (
    actionConfiguration.dataSources.some(
      (ds) => ds.filter.tags?.mode === "auto"
    )
  ) {
    inputs.push(...retrievalTagsInputSpecification());
  }

  return {
    name,
    description,
    inputs,
  };
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a actions from AgentMessage ModelIds. This
// should not be used outside of api/assistant. We allow a ModelId interface here because for
// optimization purposes to avoid duplicating DB requests while having clear action specific code.
export async function processActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<ProcessActionType[]> {
  const models = await AgentProcessAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    let relativeTimeFrame: TimeFrame | null = null;
    if (action.relativeTimeFrameDuration && action.relativeTimeFrameUnit) {
      relativeTimeFrame = {
        duration: action.relativeTimeFrameDuration,
        unit: action.relativeTimeFrameUnit,
      };
    }

    return new ProcessActionType({
      id: action.id,
      agentMessageId: action.agentMessageId,
      params: {
        relativeTimeFrame,
        tagsIn: action.tagsIn,
        tagsNot: action.tagsNot,
      },
      schema: action.schema,
      outputs: action.outputs,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
      type: "process_action",
      generatedFiles: [],
    });
  });
}
