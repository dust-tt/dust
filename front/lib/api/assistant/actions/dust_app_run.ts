import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { ModelId } from "@app/lib/databases";
import { DustAPI } from "@app/lib/dust_api";
import { AgentDustAppRunAction } from "@app/lib/models";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { AppType, SpecificationType } from "@app/types/app";
import {
  DustAppParameters,
  DustAppRunActionType,
  isDustAppRunConfiguration,
} from "@app/types/assistant/actions/dust_app_run";
import {
  AgentActionSpecification,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { DatasetSchema } from "@app/types/dataset";

import { getApp } from "../../app";
import { getDatasetSchema } from "../../datasets";
import { generateActionInputs } from "../agent";
import { ModelMessageType } from "../generation";

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

// Generates Dust app run parameters given the agent configuration and the conversation context.
export async function generateDustAppRunParams(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  app: AppType,
  schema: DatasetSchema | null
): Promise<Result<DustAppParameters, Error>> {
  const c = configuration.action;
  if (!isDustAppRunConfiguration(c)) {
    throw new Error(
      "Unexpected action configuration received in `generateDustAppRunParams`"
    );
  }

  const specRes = await dustAppRunActionSpecification(app, schema);
  if (specRes.isErr()) {
    return new Err(specRes.error);
  }

  if (specRes.value.inputs.length > 0) {
    const now = Date.now();

    const rawInputsRes = await generateActionInputs(
      auth,
      configuration,
      specRes.value,
      conversation,
      userMessage
    );

    if (rawInputsRes.isOk()) {
      const rawInputs = rawInputsRes.value;
      logger.info(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          elapsed: Date.now() - now,
        },
        "[ASSISTANT_TRACE] DustAppRun action inputs generation"
      );

      // Check that all inputs are accounted for.
      const inputs: DustAppParameters = {};

      for (const k of specRes.value.inputs) {
        if (rawInputs[k.name] && typeof rawInputs[k.name] === k.type) {
          inputs[k.name] = rawInputs[k.name];
        } else {
          return new Err(
            new Error(
              `Failed to generate input ${k.name} (expected type ${
                k.type
              }, got ${rawInputs[k.name]})`
            )
          );
        }
      }

      return new Ok(inputs);
    }
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
        error: rawInputsRes.error,
      },
      "Error generating DustAppRun action inputs"
    );

    return new Err(rawInputsRes.error);
  }

  return new Ok({});
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

// Event sent before the execution of a dust app run with the finalized params to be used.
export type DustAppRunParamsEvent = {
  type: "dust_app_run_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: DustAppRunActionType;
};

export type DustAppRunErrorEvent = {
  type: "dust_app_run_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type DustAppRunBlockEvent = {
  type: "dust_app_run_block";
  created: number;
  configurationId: string;
  messageId: string;
  action: DustAppRunActionType;
};

export type DustAppRunSuccessEvent = {
  type: "dust_app_run_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: DustAppRunActionType;
};

// This method is in charge of running a dust app and creating an AgentDustAppRunAction object in
// the database. It does not create any generic model related to the conversation. It is possible
// for an AgentDustAppRunAction to be stored (once the params are infered) but for the dust app run
// to fail, in which case an error event will be emitted and the AgentDustAppRunAction won't have
// any output associated. The error is expected to be stored by the caller on the parent agent
// message.
export async function* runDustApp(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | DustAppRunParamsEvent
  | DustAppRunBlockEvent
  | DustAppRunSuccessEvent
  | DustAppRunErrorEvent,
  void
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runRetrieval`");
  }

  const c = configuration.action;
  if (!isDustAppRunConfiguration(c)) {
    throw new Error("Unexpected action configuration received in `runDustApp`");
  }

  if (owner.sId !== c.appWorkspaceId) {
    yield {
      type: "dust_app_run_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "dust_app_run_workspace_error",
        message:
          "Runing Dust apps that are not part of your own workspace is not supported yet.",
      },
    };
    return;
  }

  const app = await getApp(auth, c.appId);
  if (!app) {
    yield {
      type: "dust_app_run_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "dust_app_run_app_error",
        message: `Failed to retrieve Dust app ${c.appWorkspaceId}/${c.appId}`,
      },
    };
    return;
  }

  // Parse the specifiaction of the app.
  const appSpec = JSON.parse(
    app.savedSpecification || `[]`
  ) as SpecificationType;

  const appConfig = extractConfig(JSON.parse(app.savedSpecification || `{}`));

  let schema: DatasetSchema | null = null;

  const inputSpec = appSpec.find((b) => b.type === "input");
  const inputConfig = inputSpec ? appConfig[inputSpec.name] : null;
  const datasetName: string | null = inputConfig ? inputConfig.dataset : null;

  if (datasetName) {
    // We have a dataset name we need to find associated schema.
    schema = await getDatasetSchema(auth, app, datasetName);
    if (!schema) {
      yield {
        type: "dust_app_run_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "dust_app_run_app_schema_error",
          message:
            `Failed to retrieve schema for Dust app: ${c.appWorkspaceId}/${c.appId} dataset=${datasetName}` +
            " (make sure you have set descriptions in your app input block dataset)",
        },
      };
      return;
    }
  }

  const paramsRes = await generateDustAppRunParams(
    auth,
    configuration,
    conversation,
    userMessage,
    app,
    schema
  );

  if (paramsRes.isErr()) {
    yield {
      type: "dust_app_run_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "dust_app_run_parameters_generation_error",
        message: `Error generating parameters for Dust App run: ${paramsRes.error.message}`,
      },
    };
    return;
  }

  const params = paramsRes.value;

  // Create the AgentDustAppRunAction object in the database and yield an event for the generation
  // of the params. We store the action here as the params have been generated, if an error occurs
  // later on, the action won't have an output but the error will be stored on the parent agent
  // message.
  const action = await AgentDustAppRunAction.create({
    dustAppRunConfigurationId: c.sId,
    appWorkspaceId: c.appWorkspaceId,
    appId: c.appId,
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
      appWorkspaceId: c.appWorkspaceId,
      appId: c.appId,
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
  const api = new DustAPI(prodCredentials, {
    useLocalInDev: true,
  });

  const runRes = await api.runAppStreamed(
    {
      workspaceId: c.appWorkspaceId,
      appId: c.appId,
      appHash: "latest",
    },
    appConfig,
    [params]
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

      yield {
        type: "dust_app_run_block",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        action: {
          id: action.id,
          type: "dust_app_run_action",
          appWorkspaceId: c.appWorkspaceId,
          appId: c.appId,
          appName: app.name,
          params,
          runningBlock: {
            type: event.content.block_type,
            name: event.content.block_name,
          },
          output: null,
        },
      };
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
      appWorkspaceId: c.appWorkspaceId,
      appId: c.appId,
      appName: app.name,
      params,
      runningBlock: null,
      output: lastBlockOutput,
    },
  };
}
