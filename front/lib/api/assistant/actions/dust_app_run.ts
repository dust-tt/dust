import type {
  DustAppRunBlockEvent,
  DustAppRunConfigurationType,
  DustAppRunErrorEvent,
  DustAppRunParamsEvent,
  DustAppRunSuccessEvent,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
} from "@dust-tt/types";
import type { DustAppParameters, DustAppRunActionType } from "@dust-tt/types";
import type { AgentActionSpecification } from "@dust-tt/types";
import type { SpecificationType } from "@dust-tt/types";
import type { DatasetSchema } from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import { BaseAction, DustAPI } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getApp } from "@app/lib/api/app";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import config from "@app/lib/api/config"
import { getDatasetSchema } from "@app/lib/api/datasets";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";

interface DustAppRunActionBlob {
  id: ModelId; // AgentDustAppRun.
  agentMessageId: ModelId;
  appWorkspaceId: string;
  appId: string;
  appName: string;
  params: DustAppParameters;
  runningBlock: {
    type: string;
    name: string;
    status: "running" | "succeeded" | "errored";
  } | null;
  output: unknown | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class DustAppRunAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly appWorkspaceId: string;
  readonly appId: string;
  readonly appName: string;
  readonly params: DustAppParameters;
  readonly runningBlock: {
    type: string;
    name: string;
    status: "running" | "succeeded" | "errored";
  } | null;
  readonly output: unknown | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "dust_app_run_action";

  constructor(blob: DustAppRunActionBlob) {
    super(blob.id, "dust_app_run_action");

    this.agentMessageId = blob.agentMessageId;
    this.appWorkspaceId = blob.appWorkspaceId;
    this.appId = blob.appId;
    this.appName = blob.appName;
    this.params = blob.params;
    this.runningBlock = blob.runningBlock;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? this.appName,
      arguments: JSON.stringify(this.params),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "";

    // Note action.output can be any valid JSON including null.
    content += `OUTPUT:\n`;
    content += `${JSON.stringify(this.output, null, 2)}\n`;

    return {
      role: "function" as const,
      name: this.functionCallName ?? this.appName,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class DustAppRunConfigurationServerRunner extends BaseActionConfigurationServerRunner<DustAppRunConfigurationType> {
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

    if (name !== app.name) {
      return new Err(
        new Error("Unreachable: Dust app name and action name differ.")
      );
    }

    return dustAppRunActionSpecification({
      schema,
      name,
      description: description ?? app.description ?? `Run app ${app.name}`,
    });
  }

  // DustAppRun does not use citations.
  getCitationsCount(): number {
    return 0;
  }

  // This method is in charge of running a dust app and creating an AgentDustAppRunAction object in
  // the database. It does not create any generic model related to the conversation. It is possible
  // for an AgentDustAppRunAction to be stored (once the params are infered) but for the dust app run
  // to fail, in which case an error event will be emitted and the AgentDustAppRunAction won't have
  // any output associated. The error is expected to be stored by the caller on the parent agent
  // message.
  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams,
    {
      spec,
    }: {
      spec: AgentActionSpecification;
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
      throw new Error("Unexpected unauthenticated call to `run`");
    }

    const { actionConfiguration } = this;

    const app = await getApp(auth, actionConfiguration.appId);
    if (!app) {
      yield {
        type: "dust_app_run_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
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
        // As defined in dustAppRunActionSpecification, type is either "string", "number" or "boolean"
        params[k.name] = rawInputs[k.name] as string | number | boolean;
      } else {
        yield {
          type: "dust_app_run_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
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
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
    });

    yield {
      type: "dust_app_run_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new DustAppRunAction({
        id: action.id,
        appWorkspaceId: actionConfiguration.appWorkspaceId,
        appId: actionConfiguration.appId,
        appName: app.name,
        params,
        runningBlock: null,
        output: null,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
      }),
    };

    // Let's run the app now.
    const now = Date.now();

    const prodCredentials = await prodAPICredentialsForOwner(owner, {
      useLocalInDev: true,
    });
    const api = new DustAPI(
      config.getDustAPIConfig(),
      prodCredentials,
      logger,
      {
        useLocalInDev: true,
      }
    );

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
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "dust_app_run_error",
          message: `Error running Dust app: ${runRes.error.message}`,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = runRes.value;
    let lastBlockOutput: unknown | null = null;

    for await (const event of eventStream) {
      if (event.type === "error") {
        yield {
          type: "dust_app_run_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
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
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          action: new DustAppRunAction({
            id: action.id,
            appWorkspaceId: actionConfiguration.appWorkspaceId,
            appId: actionConfiguration.appId,
            appName: app.name,
            params,
            functionCallId,
            functionCallName: actionConfiguration.name,
            runningBlock: {
              type: event.content.block_type,
              name: event.content.name,
              status: event.content.status,
            },
            output: null,
            agentMessageId: agentMessage.agentMessageId,
            step: action.step,
          }),
        };
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          yield {
            type: "dust_app_run_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
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

    const output = sanitizeJSONOutput(lastBlockOutput);

    // Update DustAppRunAction with the output of the last block.
    await action.update({
      runId: await dustRunId,
      output,
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
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new DustAppRunAction({
        id: action.id,
        appWorkspaceId: actionConfiguration.appWorkspaceId,
        appId: actionConfiguration.appId,
        appName: app.name,
        params,
        functionCallId,
        functionCallName: actionConfiguration.name,
        runningBlock: null,
        output,
        agentMessageId: agentMessage.agentMessageId,
        step: action.step,
      }),
    };
  }
}

async function dustAppRunActionSpecification({
  schema,
  name,
  description,
}: {
  schema: DatasetSchema | null;
  name: string;
  description: string;
}): Promise<Result<AgentActionSpecification, Error>> {
  // If we have no schema (aka no input block) there is no need to generate any input.
  if (!schema) {
    return new Ok({
      name,
      description,
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
    name,
    description,
    inputs,
  });
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a DustAppRun action. This should not be
// used outside of api/assistant. We allow a ModelId interface here because we don't have `sId` on
// actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of this action).
export async function dustAppRunTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<DustAppRunActionType[]> {
  const actions = await AgentDustAppRunAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return actions.map((action) => {
    return new DustAppRunAction({
      id: action.id,
      appWorkspaceId: action.appWorkspaceId,
      appId: action.appId,
      appName: action.appName,
      params: action.params,
      runningBlock: null,
      output: action.output,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
    });
  });
}
