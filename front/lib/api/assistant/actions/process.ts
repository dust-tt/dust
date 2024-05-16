import type {
  AgentActionSpecification,
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  ModelMessageType,
  ProcessActionOutputsType,
  ProcessActionType,
  ProcessConfigurationType,
  ProcessErrorEvent,
  ProcessParamsEvent,
  ProcessSuccessEvent,
  Result,
  TimeFrame,
  UserMessageType,
} from "@dust-tt/types";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
  Ok,
  PROCESS_ACTION_TOP_K,
  renderSchemaPropertiesAsJSONSchema,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import {
  parseTimeFrame,
  retrievalAutoTimeFrameInputSpecification,
  timeFrameFromNow,
} from "@app/lib/api/assistant/actions/retrieval";
import { constructPrompt } from "@app/lib/api/assistant/generation";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  isDevelopment,
  PRODUCTION_DUST_WORKSPACE_ID,
} from "@app/lib/development";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import logger from "@app/logger/logger";

/**
 * Model rendering of process actions.
 */

export function renderProcessActionForModel(
  action: ProcessActionType
): ModelMessageType {
  let content = "";
  if (action.outputs === null) {
    throw new Error(
      "Output not set on process action; this usually means the process action is not finished."
    );
  }

  content += "PROCESSED OUTPUTS:\n";

  // TODO(spolu): figure out if we want to add the schema here?

  if (action.outputs) {
    if (action.outputs.data.length === 0) {
      content += "(none)\n";
    } else {
      for (const o of action.outputs.data) {
        content += `${JSON.stringify(o)}\n`;
      }
    }
  }

  return {
    role: "action" as const,
    name: "process_data_sources",
    content,
  };
}

export function renderProcessActionFunctionCall(
  action: ProcessActionType
): FunctionCallType {
  return {
    id: action.functionCallId ?? `call_${action.id.toString()}`,
    name: "process_data_sources",
    arguments: JSON.stringify(action.params),
  };
}
export function renderProcessActionForMultiActionsModel(
  action: ProcessActionType
): FunctionMessageTypeModel {
  let content = "";
  if (action.outputs === null) {
    throw new Error(
      "Output not set on process action; this usually means the process action is not finished."
    );
  }

  content += "PROCESSED OUTPUTS:\n";

  // TODO(spolu): figure out if we want to add the schema here?

  if (action.outputs) {
    for (const o of action.outputs.data) {
      content += `${JSON.stringify(o)}\n`;
    }
  }

  return {
    role: "function" as const,
    function_call_id: action.functionCallId ?? `call_${action.id.toString()}`,
    content,
  };
}

/**
 * Params generation.
 */

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

// Generates the action specification for generation of rawInputs passed to `runProcess`.
export async function generateProcessSpecification(
  auth: Authenticator,
  {
    actionConfiguration,
    name = "process_data_sources",
    description,
  }: {
    actionConfiguration: ProcessConfigurationType;
    name?: string;
    description?: string;
  }
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runRetrieval`");
  }

  const spec = await processActionSpecification({
    actionConfiguration,
    name,
    description:
      description ??
      "Process data sources specified by the user by performing a search and extracting" +
        " structured information (complying to a fixed schema) from the retrieved information.",
  });
  return new Ok(spec);
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

    return {
      id: action.id,
      agentMessageId: action.agentMessageId,
      type: "process_action",
      params: {
        relativeTimeFrame,
      },
      schema: action.schema,
      outputs: action.outputs,
      functionCallId: action.functionCallId,
      step: action.step,
    } satisfies ProcessActionType;
  });
}

/**
 * Action execution.
 */

// This method is in charge of running the retrieval and creating an AgentProcessAction object in
// the database. It does not create any generic model related to the conversation. It is possible
// for an AgentProcessAction to be stored (once the query params are infered) but for its execution
// to fail, in which case an error event will be emitted and the AgentProcessAction won't have any
// outputs associated. The error is expected to be stored by the caller on the parent agent message.
export async function* runProcess(
  auth: Authenticator,
  {
    configuration,
    actionConfiguration,
    conversation,
    userMessage,
    agentMessage,
    rawInputs,
    functionCallId,
    step,
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: ProcessConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    rawInputs: Record<string, string | boolean | number>;
    functionCallId: string | null;
    step: number;
  }
): AsyncGenerator<
  ProcessParamsEvent | ProcessSuccessEvent | ProcessErrorEvent,
  void
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `process`");
  }

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

  const { model } = configuration;

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
    agentMessageId: agentMessage.agentMessageId,
    step,
  });

  const now = Date.now();

  yield {
    type: "process_params",
    created: now,
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    dataSources: actionConfiguration.dataSources,
    action: {
      id: action.id,
      agentMessageId: agentMessage.agentMessageId,
      type: "process_action",
      params: {
        relativeTimeFrame,
      },
      schema: action.schema,
      outputs: null,
      functionCallId: action.functionCallId,
      step: action.step,
    },
  };

  const prompt = await constructPrompt(
    auth,
    userMessage,
    configuration,
    "Process the retrieved data to extract structured information based on the provided schema."
  );

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-process"].config
  );

  // Set the process action model configuration to the assistant model configuration.
  config.MODEL.provider_id = configuration.model.providerId;
  config.MODEL.model_id = configuration.model.modelId;
  config.MODEL.temperature = configuration.model.temperature;

  // Handle data sources list and parents/tags filtering.
  config.DATASOURCE.data_sources = actionConfiguration.dataSources.map((d) => ({
    workspace_id: isDevelopment()
      ? PRODUCTION_DUST_WORKSPACE_ID
      : d.workspaceId,
    data_source_id: d.dataSourceId,
  }));

  if (actionConfiguration.tagsFilter && actionConfiguration.tagsFilter.in) {
    // Note: empty array in tags/parents.in means "no document match" since no documents has any
    // tags/parents that is in the empty array.
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
        schema: renderSchemaPropertiesAsJSONSchema(actionConfiguration.schema),
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
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "process_execution_error",
        message: `Error running process app: ${res.error.message}`,
      },
    };
    return;
  }

  const { eventStream } = res.value;
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
        configurationId: configuration.sId,
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
          configurationId: configuration.sId,
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
  });

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] Process acion run execution"
  );

  yield {
    type: "process_success",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      agentMessageId: agentMessage.agentMessageId,
      type: "process_action",
      params: {
        relativeTimeFrame,
      },
      schema: action.schema,
      outputs,
      functionCallId: action.functionCallId,
      step: action.step,
    },
  };
}
