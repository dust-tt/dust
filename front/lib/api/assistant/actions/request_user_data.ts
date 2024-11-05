import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  RequestUserDataActionOutputType,
  RequestUserDataConfigurationType,
  RequestUserDataErrorEvent,
  RequestUserDataParamsEvent,
  RequestUserDataSuccessEvent,
  Result,
} from "@dust-tt/types";
import { BaseAction, Ok } from "@dust-tt/types";
import { commandOptions } from "redis";

import { DEFAULT_REQUEST_USER_DATA_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentRequestUserDataAction } from "@app/lib/models/assistant/actions/request_user_data";

interface RequestUserDataActionBlob {
  id: ModelId; // AgentBrowseAction
  agentMessageId: ModelId;
  outputs: RequestUserDataActionOutputType[] | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  params: {
    requested_data: string[];
  };
}

export class RequestUserDataAction extends BaseAction {
  readonly agentMessageId: ModelId;
  public outputs: RequestUserDataActionOutputType[] | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly params: {
    requested_data: string[];
  };
  readonly type = "request_user_data_action";

  constructor(blob: RequestUserDataActionBlob) {
    super(blob.id, "request_user_data_action");
    this.agentMessageId = blob.agentMessageId;
    this.outputs = blob.outputs;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
    this.params = blob.params;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_REQUEST_USER_DATA_ACTION_NAME,
      arguments: "{}",
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "BROWSE OUTPUT:\n";
    if (this.outputs === null) {
      content += "The request data failed.\n";
    } else {
      content += `${JSON.stringify(this.outputs, null, 2)}\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_REQUEST_USER_DATA_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

export class RequestUserDataConfigurationServerRunner extends BaseActionConfigurationServerRunner<RequestUserDataConfigurationType> {
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

    return new Ok({
      name,
      description: `${description || ""}. The following data are available : ${actionConfiguration.available_data}`,
      inputs: [
        {
          name: "requested_data",
          description: `This list of requested data, which must be a subset of :  ${actionConfiguration.available_data}`,
          type: "array",
          items: {
            type: "string",
          },
        },
      ],
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      agentMessage,
      step,
      functionCallId,
      rawInputs,
    }: BaseActionRunParams
  ): AsyncGenerator<
    | RequestUserDataParamsEvent
    | RequestUserDataSuccessEvent
    | RequestUserDataErrorEvent
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `run` for request_user_data action"
      );
    }

    const { actionConfiguration } = this;

    const action = await AgentRequestUserDataAction.create({
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
    });

    const requestedData = rawInputs.requested_data as string[];

    const requestUserDataAction = new RequestUserDataAction({
      id: action.id,
      agentMessageId: agentMessage.agentMessageId,
      outputs: null,
      functionCallId: actionConfiguration.name,
      functionCallName: actionConfiguration.name,
      step,
      params: {
        requested_data: requestedData,
      },
    });
    yield {
      type: "request_user_data_params",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: requestUserDataAction,
    };

    try {
      const redis = await getRedisClient({ origin: "request_user_data" });
      const message = await redis.xRead(
        commandOptions({ isolated: true }), // Use isolated connection
        { key: `request_data_action_${action.id}`, id: "0-0" }, // Start from beginning
        { COUNT: 32, BLOCK: 10 * 1000 } // Block for 60 seconds
      );

      if (message && message.length > 0) {
        const outputs = message.flatMap((m) =>
          m.messages.flatMap((m) => JSON.parse(m.message.payload).outputs)
        );

        requestUserDataAction.outputs = outputs;

        yield {
          type: "request_user_data_success",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          action: requestUserDataAction,
        };
      }
    } catch (error) {
      console.error("Error while requesting data from user", error);
      yield {
        type: "request_user_data_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "request_user_data_error",
          message: "Error while requesting data from user",
        },
      };
    }
  }
}
