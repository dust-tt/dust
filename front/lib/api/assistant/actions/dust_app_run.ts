import type {
  DustAppRunBlockEvent,
  DustAppRunConfigurationType,
  DustAppRunErrorEvent,
  DustAppRunParamsEvent,
  DustAppRunSuccessEvent,
  ModelId,
  ModelMessageType,
} from "@dust-tt/types";
import type { DustAppParameters, DustAppRunActionType } from "@dust-tt/types";
import type {
  AgentActionSpecification,
  AgentConfigurationType,
} from "@dust-tt/types";
import type { AgentMessageType, ConversationType } from "@dust-tt/types";
import type { AppType, SpecificationType } from "@dust-tt/types";
import type { DatasetSchema } from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getApp } from "@app/lib/api/app";
import { getDatasetSchema } from "@app/lib/api/datasets";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import logger from "@app/logger/logger";

/**
 * Model rendering of DustAppRuns.
 */

export function renderDustAppRunActionForModel(
  action: DustAppRunActionType
): ModelMessageType {
  let content = "";
  if (!action.output) {
    throw new Error(
      "Output not set on DustAppRun action; execution is likely not finished."
    );
  }
  content += `OUTPUT:\n`;
  content += `${JSON.stringify(action.output, null, 2)}\n`;

  return {
    role: "action" as const,
    name: action.appName,
    content,
  };
}

/**
 * Params generation.
 */

export async function dustAppRunActionSpecification(
  app: AppType,
  schema: DatasetSchema | null
): Promise<Result<AgentActionSpecification, Error>> {
  const appName = app.name;
  const appDescription = app.description;

  // If we have no schema (aka no input block) there is no need to generate any input.
  if (!schema) {
    return new Ok({
      name: appName,
      description: appDescription || "",
      inputs: [],
    });
  }

  const inputs: {
    name: string;
    description: string;
    type: "string" | "number" | "boolean";
  }[] = [];

  for (const k of schema) {
    if (k.type === "json") {
      return new Err(
        new Error(
          `JSON type for Dust app parameters is not supported, string, number and boolean are.`
        )
      );
    }

    inputs.push({
      name: k.key,
      description: k.description || "",
      type: k.type,
    });
  }

  return new Ok({
    name: appName,
    description: appDescription || "",
    inputs,
  });
}

// Generates the action specification for generation of rawInputs passed to `runDustApp`.
export async function generateDustAppRunSpecification(
  auth: Authenticator,
  {
    actionConfiguration,
  }: {
    actionConfiguration: DustAppRunConfigurationType;
  }
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runRetrieval`");
  }

  if (owner.sId !== actionConfiguration.appWorkspaceId) {
    return new Err(
      new Error(
        "Runing Dust apps that are not part of your own workspace is not supported yet."
      )
    );
  }

  const app = await getApp(auth, actionConfiguration.appId);
  if (!app) {
    return new Err(
      new Error(
        "Failed to retrieve Dust app " +
          `${actionConfiguration.appWorkspaceId}/${actionConfiguration.appId}`
      )
    );
  }

  // Parse the specifiaction of the app.
  const appSpec = JSON.parse(
    app.savedSpecification || "[]"
  ) as SpecificationType;

  const appConfig = extractConfig(JSON.parse(app.savedSpecification || "{}"));

  let schema: DatasetSchema | null = null;

  const inputSpec = appSpec.find((b) => b.type === "input");
  const inputConfig = inputSpec ? appConfig[inputSpec.name] : null;
  const datasetName: string | null = inputConfig ? inputConfig.dataset : null;

  if (datasetName) {
    // We have a dataset name we need to find associated schema.
    schema = await getDatasetSchema(auth, app, datasetName);
    if (!schema) {
      return new Err(
        new Error(
          "Failed to retrieve schema for Dust app: " +
            `${actionConfiguration.appWorkspaceId}/${actionConfiguration.appId} ` +
            `dataset=${datasetName}` +
            " (make sure you have set descriptions in your app input block dataset)"
        )
      );
    }
  }

  return dustAppRunActionSpecification(app, schema);
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a DustAppRun action. This should not be
// used outside of api/assistant. We allow a ModelId interface here because we don't have `sId` on
// actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of this action).
export async function renderDustAppRunActionByModelId(
  id: ModelId
): Promise<DustAppRunActionType> {
  const action = await AgentDustAppRunAction.findByPk(id);
  if (!action) {
    throw new Error(`No DustAppRun action found with id ${id}`);
  }

  return {
    id: action.id,
    type: "dust_app_run_action",
    appWorkspaceId: action.appWorkspaceId,
    appId: action.appId,
    appName: action.appName,
    params: action.params,
    runningBlock: null,
    output: action.output,
  };
}

/**
 * Action execution.
 */

// This method is in charge of running a dust app and creating an AgentDustAppRunAction object in
// the database. It does not create any generic model related to the conversation. It is possible
// for an AgentDustAppRunAction to be stored (once the params are infered) but for the dust app run
// to fail, in which case an error event will be emitted and the AgentDustAppRunAction won't have
// any output associated. The error is expected to be stored by the caller on the parent agent
// message.
export async function* runDustApp(
  auth: Authenticator,
  {
    configuration,
    actionConfiguration,
    conversation,
    agentMessage,
    spec,
    rawInputs,
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: DustAppRunConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
    spec: AgentActionSpecification;
    rawInputs: Record<string, string | boolean | number>;
  }
): AsyncGenerator<
  | DustAppRunParamsEvent
  | DustAppRunBlockEvent
  | DustAppRunSuccessEvent
  | DustAppRunErrorEvent,
  void
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runDustApp`");
  }

  const app = await getApp(auth, actionConfiguration.appId);
  if (!app) {
    yield {
      type: "dust_app_run_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "dust_app_run_parameters_generation_error",
        message:
          "Failed to retrieve Dust app " +
          `${actionConfiguration.appWorkspaceId}/${actionConfiguration.appId}`,
      },
    };
    return;
  }

  const appConfig = extractConfig(JSON.parse(app.savedSpecification || `{}`));

  // Check that all inputs are accounted for.
  const params: DustAppParameters = {};

  for (const k of spec.inputs) {
    if (rawInputs[k.name] && typeof rawInputs[k.name] === k.type) {
      params[k.name] = rawInputs[k.name];
    } else {
      yield {
        type: "dust_app_run_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "dust_app_run_parameters_generation_error",
          message: `Failed to generate input ${k.name} (expected type ${
            k.type
          }, got ${rawInputs[k.name]})`,
        },
      };
      return;
    }
  }

  // Create the AgentDustAppRunAction object in the database and yield an event for the generation
  // of the params. We store the action here as the params have been generated, if an error occurs
  // later on, the action won't have an output but the error will be stored on the parent agent
  // message.
  const action = await AgentDustAppRunAction.create({
    dustAppRunConfigurationId: actionConfiguration.sId,
    appWorkspaceId: actionConfiguration.appWorkspaceId,
    appId: actionConfiguration.appId,
    appName: app.name,
    params,
  });

  yield {
    type: "dust_app_run_params",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      type: "dust_app_run_action",
      appWorkspaceId: actionConfiguration.appWorkspaceId,
      appId: actionConfiguration.appId,
      appName: app.name,
      params,
      runningBlock: null,
      output: null,
    },
  };

  // Let's run the app now.
  const now = Date.now();

  const prodCredentials = await prodAPICredentialsForOwner(owner, {
    useLocalInDev: true,
  });
  const api = new DustAPI(prodCredentials, logger, {
    useLocalInDev: true,
  });

  // As we run the app (using a system API key here), we do force using the workspace credentials so
  // that the app executes in the exact same conditions in which they were developed.
  const runRes = await api.runAppStreamed(
    {
      workspaceId: actionConfiguration.appWorkspaceId,
      appId: actionConfiguration.appId,
      appHash: "latest",
    },
    appConfig,
    [params],
    { useWorkspaceCredentials: true }
  );

  if (runRes.isErr()) {
    yield {
      type: "dust_app_run_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "dust_app_run_error",
        message: `Error running Dust app: ${runRes.error.message}`,
      },
    };
    return;
  }

  const { eventStream } = runRes.value;
  let lastBlockOutput: unknown | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      yield {
        type: "dust_app_run_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "dust_app_run_error",
          message: `Error running Dust app: ${event.content.message}`,
        },
      };
      return;
    }

    if (event.type === "block_status") {
      yield {
        type: "dust_app_run_block",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        action: {
          id: action.id,
          type: "dust_app_run_action",
          appWorkspaceId: actionConfiguration.appWorkspaceId,
          appId: actionConfiguration.appId,
          appName: app.name,
          params,
          runningBlock: {
            type: event.content.block_type,
            name: event.content.name,
            status: event.content.status,
          },
          output: null,
        },
      };
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        yield {
          type: "dust_app_run_error",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "dust_app_run_error",
            message: `Error running Dust app: ${e.error}`,
          },
        };
        return;
      }

      lastBlockOutput = e.value;
    }
  }

  // Update DustAppRunAction with the output of the last block.
  await action.update({
    output: lastBlockOutput,
  });

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] DustAppRun acion run execution"
  );

  yield {
    type: "dust_app_run_success",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      type: "dust_app_run_action",
      appWorkspaceId: actionConfiguration.appWorkspaceId,
      appId: actionConfiguration.appId,
      appName: app.name,
      params,
      runningBlock: null,
      output: lastBlockOutput,
    },
  };
}
