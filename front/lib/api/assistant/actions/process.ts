import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  ProcessActionOutputsType,
  ProcessActionType,
  ProcessConfigurationType,
  ProcessErrorEvent,
  ProcessParamsEvent,
  ProcessSchemaPropertyType,
  ProcessSuccessEvent,
  Result,
  TimeFrame,
  UserMessageType,
} from "@dust-tt/types";
import {
  BaseAction,
  cloneBaseConfig,
  DustProdActionRegistry,
  isCustomDustAppsWorkspaceId,
  isDevelopment,
  Ok,
  PROCESS_ACTION_TOP_K,
  PRODUCTION_DUST_WORKSPACE_ID,
  renderSchemaPropertiesAsJSONSchema,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_PROCESS_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import {
  parseTimeFrame,
  retrievalAutoTimeFrameInputSpecification,
  timeFrameFromNow,
} from "@app/lib/api/assistant/actions/retrieval";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import logger from "@app/logger/logger";

interface ProcessActionBlob {
  id: ModelId; // AgentProcessAction.
  agentMessageId: ModelId;
  params: {
    relativeTimeFrame: TimeFrame | null;
  };
  schema: ProcessSchemaPropertyType[];
  outputs: ProcessActionOutputsType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class ProcessAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    relativeTimeFrame: TimeFrame | null;
  };
  readonly schema: ProcessSchemaPropertyType[];
  readonly outputs: ProcessActionOutputsType | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "process_action";

  constructor(blob: ProcessActionBlob) {
    super(blob.id, "process_action");

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

  renderForMultiActionsModel(): FunctionMessageTypeModel {
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

  // Process does not use citations.
  getCitationsCount(): number {
    return 0;
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
      agentMessageId: agentMessage.agentMessageId,
      step,
    });

    const now = Date.now();

    yield {
      type: "process_params",
      created: now,
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      dataSources: actionConfiguration.dataSources,
      action: new ProcessAction({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        params: {
          relativeTimeFrame,
        },
        schema: action.schema,
        outputs: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    const prompt = await constructPromptMultiActions(auth, {
      conversation,
      userMessage,
      agentConfiguration,
      fallbackPrompt:
        "Process the retrieved data to extract structured information based on the provided schema.",
      model: supportedModel,
      hasAvailableActions: false,
    });

    const config = cloneBaseConfig(
      DustProdActionRegistry["assistant-v2-process"].config
    );

    // Set the process action model configuration to the assistant model configuration.
    config.MODEL.provider_id = model.providerId;
    config.MODEL.model_id = model.modelId;
    config.MODEL.temperature = model.temperature;

    // Handle data sources list and parents/tags filtering.
    config.DATASOURCE.data_sources = actionConfiguration.dataSources.map(
      (d) => ({
        workspace_id:
          isDevelopment() && !isCustomDustAppsWorkspaceId()
            ? PRODUCTION_DUST_WORKSPACE_ID
            : d.workspaceId,

        // Use dataSourceViewId if it exists; otherwise, use dataSourceId.
        // Note: This value is passed to the registry for lookup.
        data_source_id: d.dataSourceViewId ?? d.dataSourceId,
      })
    );

    if (
      actionConfiguration.tagsFilter &&
      actionConfiguration.tagsFilter.in &&
      actionConfiguration.tagsFilter.in.length > 0
    ) {
      // Note: we explicitely ignore if `tagsFilter.in` is empty as there is no use-case for no
      // retrieval at all.
      if (!config.DATASOURCE.filter.tags) {
        config.DATASOURCE.filter.tags = {};
      }
      config.DATASOURCE.filter.tags.in = actionConfiguration.tagsFilter.in;
    }

    for (const ds of actionConfiguration.dataSources) {
      if (!config.DATASOURCE.filter.parents) {
        config.DATASOURCE.filter.parents = {};
      }
      if (ds.filter.parents?.in) {
        if (!config.DATASOURCE.filter.parents.in_map) {
          config.DATASOURCE.filter.parents.in_map = {};
        }

        // Note: We use dataSourceId here because after the registry lookup,
        // it returns either the data source itself or the data source associated with the data source view.
        config.DATASOURCE.filter.parents.in_map[ds.dataSourceId] =
          ds.filter.parents.in;
      }
      if (ds.filter.parents?.not) {
        if (!config.DATASOURCE.filter.parents.not) {
          config.DATASOURCE.filter.parents.not = [];
        }
        config.DATASOURCE.filter.parents.not.push(...ds.filter.parents.not);
      }
    }

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
      action: new ProcessAction({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        params: {
          relativeTimeFrame,
        },
        schema: action.schema,
        outputs,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
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

  if (actionConfiguration.relativeTimeFrame === "auto") {
    inputs.push(retrievalAutoTimeFrameInputSpecification());
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

    return new ProcessAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      params: {
        relativeTimeFrame,
      },
      schema: action.schema,
      outputs: action.outputs,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
