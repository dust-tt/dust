import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
  WebsearchActionOutputType,
  WebsearchActionType,
  WebsearchConfigurationType,
  WebsearchErrorEvent,
  WebsearchParamsEvent,
  WebsearchSuccessEvent,
} from "@dust-tt/types";
import {
  BaseAction,
  cloneBaseConfig,
  DustProdActionRegistry,
  Ok,
  WebsearchActionOutputSchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";

import { runActionStreamed } from "@app/lib/actions/server";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import logger from "@app/logger/logger";

interface WebsearchActionBlob {
  id: ModelId; // AgentWebsearchAction
  agentMessageId: ModelId;
  query: string;
  output: WebsearchActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class WebsearchAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly query: string;
  readonly output: WebsearchActionOutputType | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "websearch_action";

  constructor(blob: WebsearchActionBlob) {
    super(blob.id, "websearch_action");

    this.agentMessageId = blob.agentMessageId;
    this.query = blob.query;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? "web_search",
      arguments: JSON.stringify({ query: this.query }),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "WEBSEARCH OUTPUT:\n";
    if (this.output === null) {
      content += "The web search failed.\n";
    } else {
      content += `${JSON.stringify(this.output, null, 2)}\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "web_search",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class WebsearchConfigurationServerRunner extends BaseActionConfigurationServerRunner<WebsearchConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    {
      name,
      description,
    }: { name?: string | undefined; description?: string | undefined }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runWebsearchAction`"
      );
    }

    return new Ok({
      name: name ?? "web_search",
      description:
        description ?? "Perform a web search and return the top results.",
      inputs: [
        {
          name: "query",
          description: "The query used to perform the web search.",
          type: "string",
        },
      ],
    });
  }

  async deprecatedBuildSpecificationForSingleActionAgent(
    auth: Authenticator
  ): Promise<Result<AgentActionSpecification, Error>> {
    return this.buildSpecification(auth, {});
  }

  // This method is in charge of running the websearch and creating an AgentWebsearchAction object in
  // the database. It does not create any generic model related to the conversation. It is possible
  // for an AgentWebsearchAction to be stored (once the query params are infered) but for its execution
  // to fail, in which case an error event will be emitted and the AgentWebsearchAction won't have any
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
    WebsearchParamsEvent | WebsearchSuccessEvent | WebsearchErrorEvent,
    void
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `run` for websearch action"
      );
    }

    const { actionConfiguration } = this;

    const query = rawInputs.query;

    if (!query || typeof query !== "string" || query.length === 0) {
      yield {
        type: "websearch_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "websearch_parameters_generation_error",
          message:
            "The query parameter is required and must be a non-empty string.",
        },
      };
      return;
    }

    // Create the AgentWebsearchAction object in the database and yield an event for the generation of
    // the params. We store the action here as the params have been generated, if an error occurs
    // later on, the action won't have outputs but the error will be stored on the parent agent
    // message.
    const action = await AgentWebsearchAction.create({
      query,
      websearchConfigurationId: actionConfiguration.sId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
    });

    const now = Date.now();

    yield {
      type: "websearch_params",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new WebsearchAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        query,
        output: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    const config = cloneBaseConfig(
      DustProdActionRegistry["assistant-v2-websearch"].config
    );

    // Execute the websearch action.
    const websearchRes = await runActionStreamed(
      auth,
      "assistant-v2-websearch",
      config,
      [{ query }],
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
      }
    );
    if (websearchRes.isErr()) {
      yield {
        type: "websearch_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "websearch_execution_error",
          message: websearchRes.error.message,
        },
      };
      return;
    }

    const { eventStream } = websearchRes.value;
    let output: WebsearchActionOutputType | null = null;

    for await (const event of eventStream) {
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running websearch action"
        );
        yield {
          type: "websearch_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "websearch_execution_error",
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
            "Error running websearch action"
          );
          yield {
            type: "websearch_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "websearch_execution_error",
              message: e.error,
            },
          };
          return;
        }

        if (event.content.block_name === "SEARCH_EXTRACT_FINAL" && e.value) {
          const outputValidation = WebsearchActionOutputSchema.decode(e.value);
          if (isLeft(outputValidation)) {
            logger.error(
              {
                workspaceId: owner.id,
                conversationId: conversation.id,
                error: outputValidation.left,
              },
              "Error running websearch action"
            );
            yield {
              type: "websearch_error",
              created: Date.now(),
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              error: {
                code: "websearch_execution_error",
                message: `Invalid output from websearch action: ${outputValidation.left}`,
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
    });

    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Finished websearch action run execution"
    );

    yield {
      type: "websearch_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new WebsearchAction({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        query,
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
export async function websearchActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<WebsearchActionType[]> {
  const models = await AgentWebsearchAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new WebsearchAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      query: action.query,
      output: action.output,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
