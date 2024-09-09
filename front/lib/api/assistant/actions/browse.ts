import type {
  AgentActionSpecification,
  BrowseActionOutputType,
  BrowseActionType,
  BrowseConfigurationType,
  BrowseErrorEvent,
  BrowseParamsEvent,
  BrowseSuccessEvent,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@dust-tt/types";
import { BaseAction, BrowseActionOutputSchema, Ok } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";

import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_BROWSE_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import logger from "@app/logger/logger";

interface BrowseActionBlob {
  id: ModelId; // AgentBrowseAction
  agentMessageId: ModelId;
  urls: string[];
  output: BrowseActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((t) => typeof t === "string");
}

export class BrowseAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly urls: string[];
  readonly output: BrowseActionOutputType | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "browse_action";

  constructor(blob: BrowseActionBlob) {
    super(blob.id, "browse_action");
    this.agentMessageId = blob.agentMessageId;
    this.urls = blob.urls;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_BROWSE_ACTION_NAME,
      arguments: JSON.stringify({ urls: this.urls }),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "BROWSE OUTPUT:\n";
    if (this.output === null) {
      content += "The browse failed.\n";
    } else {
      content += `${JSON.stringify(this.output, null, 2)}\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_BROWSE_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class BrowseConfigurationServerRunner extends BaseActionConfigurationServerRunner<BrowseConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runBrowseAction`");
    }

    return new Ok({
      name: name,
      description: description ?? "Get the content of a web page.",
      inputs: [
        {
          name: "urls",
          description: "List of urls to browse.",
          type: "array",
          items: {
            type: "string",
          },
        },
      ],
    });
  }

  // This method is in charge of running the browse and creating an AgentBrowseAction object in
  // the database. It does not create any generic model related to the conversation. It is possible
  // for an AgentBrowseAction to be stored (once the query params are infered) but for its execution
  // to fail, in which case an error event will be emitted and the AgentBrowseAction won't have any
  // outputs associated. The error is expected to be stored by the caller on the parent agent message.
  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    BrowseParamsEvent | BrowseSuccessEvent | BrowseErrorEvent,
    void
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `run` for browse action"
      );
    }

    const { actionConfiguration } = this;

    const urls = rawInputs.urls;

    if (!isStringArray(urls) || urls.length === 0) {
      yield {
        type: "browse_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "browse_parameters_generation_error",
          message:
            "The urls parameter is required and must be a valid list of URLs.",
        },
      };
      return;
    }

    // Create the AgentBrowseAction object in the database and yield an event for the generation of
    // the params. We store the action here as the params have been generated, if an error occurs
    // later on, the action won't have outputs but the error will be stored on the parent agent
    // message.
    const action = await AgentBrowseAction.create({
      urls: urls,
      browseConfigurationId: actionConfiguration.sId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
    });

    const now = Date.now();

    yield {
      type: "browse_params",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new BrowseAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        urls,
        output: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    const config = cloneBaseConfig(
      DustProdActionRegistry["assistant-v2-browse"].config
    );

    // Execute the browse action.
    const browseRes = await runActionStreamed(
      auth,
      "assistant-v2-browse",
      config,
      [{ urls }],
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
      }
    );
    if (browseRes.isErr()) {
      yield {
        type: "browse_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "browse_execution_error",
          message: browseRes.error.message,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = browseRes.value;
    let output: BrowseActionOutputType | null = null;

    for await (const event of eventStream) {
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running browse action"
        );
        yield {
          type: "browse_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "browse_execution_error",
            message: event.content.message,
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
            "Error running browse action"
          );
          yield {
            type: "browse_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "browse_execution_error",
              message: e.error,
            },
          };
          return;
        }

        if (event.content.block_name === "BROWSE_FINAL" && e.value) {
          const outputValidation = BrowseActionOutputSchema.decode(e.value);
          if (isLeft(outputValidation)) {
            logger.error(
              {
                workspaceId: owner.id,
                conversationId: conversation.id,
                error: outputValidation.left,
              },
              "Error running browse action"
            );
            yield {
              type: "browse_error",
              created: Date.now(),
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              error: {
                code: "browse_execution_error",
                message: `Invalid output from browse action: ${outputValidation.left}`,
              },
            };
            return;
          }
          output = outputValidation.right;
        }
      }
    }

    // Update ProcessAction with the output of the last block.
    await action.update({
      output,
      runId: await dustRunId,
    });

    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Finished browse action run execution"
    );

    yield {
      type: "browse_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new BrowseAction({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        urls,
        output,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };
  }
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a actions from AgentMessage ModelIds. This
// should not be used outside of api/assistant. We allow a ModelId interface here because for
// optimization purposes to avoid duplicating DB requests while having clear action specific code.
export async function browseActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<BrowseActionType[]> {
  const models = await AgentBrowseAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new BrowseAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      urls: action.urls,
      output: action.output,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
