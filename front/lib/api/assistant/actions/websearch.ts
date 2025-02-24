import type {
  ActionConfigurationType,
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
  WebsearchResultType,
  WebsearchSuccessEvent,
} from "@dust-tt/types";
import { BaseAction, Ok, WebsearchAppActionOutputSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";

import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_WEBSEARCH_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import {
  actionRefsOffset,
  getWebsearchNumResults,
} from "@app/lib/api/assistant/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((t) => typeof t === "string");
}

interface WebsearchActionBlob {
  id: ModelId; // AgentWebsearchAction
  agentMessageId: ModelId;
  query: string; // Keeping for backward compatibility
  queries?: string[]; // New field for multiple queries
  output: WebsearchActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class WebsearchAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly query: string; // Keeping for backward compatibility
  readonly queries?: string[]; // New field for multiple queries
  readonly output: WebsearchActionOutputType | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "websearch_action";

  constructor(blob: WebsearchActionBlob) {
    super(blob.id, "websearch_action");

    this.agentMessageId = blob.agentMessageId;
    this.query = blob.query;
    this.queries = blob.queries;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    // If we have multiple queries, use them; otherwise, fall back to the single query
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_WEBSEARCH_ACTION_NAME,
      arguments: JSON.stringify(
        this.queries && this.queries.length > 0
          ? { queries: this.queries }
          : { query: this.query }
      ),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    let content = "WEBSEARCH OUTPUT:\n";
    if (this.output === null) {
      content += "The web search failed.\n";
    } else {
      // Group results by query if we have multiple queries
      if (
        this.queries &&
        this.queries.length > 1 &&
        this.output.results.length > 0
      ) {
        // Create a map of query -> results
        const resultsByQuery: Record<string, WebsearchResultType[]> = {};

        // Group results by query
        this.output.results.forEach((result) => {
          // Ensure we always have a valid string for the query key
          const query = result.query || this.query || "Unknown query";
          if (!resultsByQuery[query]) {
            resultsByQuery[query] = [];
          }
          resultsByQuery[query].push({
            title: result.title,
            snippet: result.snippet,
            link: result.link,
            reference: result.reference,
            query: result.query,
          });
        });

        // Format the output with results grouped by query
        content += "Results for multiple queries:\n\n";

        Object.entries(resultsByQuery).forEach(([query, results]) => {
          content += `Query: "${query}"\n`;
          content += `${JSON.stringify(
            results.map((result) => ({
              title: result.title,
              snippet: result.snippet,
              link: result.link,
              reference: result.reference,
            })),
            null,
            2
          )}\n\n`;
        });

        // Add any error messages
        if ("error" in this.output && this.output.error) {
          content += `Errors: ${this.output.error}\n`;
        }
      } else {
        // Just output the regular format for a single query
        type OutputResult = {
          title: string;
          snippet: string;
          link: string;
          reference: string;
        };

        type OutputObject = {
          results: OutputResult[];
          error?: string;
        };

        const outputObj: OutputObject = {
          results: this.output.results.map((result) => ({
            title: result.title,
            snippet: result.snippet,
            link: result.link,
            reference: result.reference,
          })),
        };

        // Add error if it exists
        if ("error" in this.output && this.output.error) {
          outputObj.error = this.output.error;
        }

        content += `${JSON.stringify(outputObj, null, 2)}\n`;
      }
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_WEBSEARCH_ACTION_NAME,
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
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runWebsearchAction`"
      );
    }

    return new Ok({
      name,
      description:
        description ??
        "Perform multiple google searches and return the top results.",
      inputs: [
        {
          name: "queries",
          description:
            "List of queries to perform google searches. Each query can use the google syntax `site:` to restrict the search to a particular website or domain.",
          type: "array",
          items: {
            type: "string",
          },
        },
        {
          name: "query",
          description:
            "The query used to perform a single google search. If requested by the user, use the google syntax `site:` to restrict the search to a particular website or domain.",
          type: "string",
        },
      ],
    });
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
    }: BaseActionRunParams,
    {
      stepActionIndex,
      stepActions,
      citationsRefsOffset,
    }: {
      stepActionIndex: number;
      stepActions: ActionConfigurationType[];
      citationsRefsOffset: number;
    }
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

    // Check for queries array first, then fall back to single query
    let queries: string[] = [];

    if (rawInputs.queries) {
      if (isStringArray(rawInputs.queries) && rawInputs.queries.length > 0) {
        queries = rawInputs.queries;
      }
    }

    // If no valid queries in the array, check for a single query
    if (queries.length === 0) {
      const query = rawInputs.query;
      if (typeof query === "string" && query.length > 0) {
        queries = [query];
      }
    }

    // If we still have no valid queries, return an error
    if (queries.length === 0) {
      yield {
        type: "websearch_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "websearch_parameters_generation_error",
          message:
            "Either the 'queries' parameter (array of strings) or the 'query' parameter (string) is required and must not be empty.",
        },
      };
      return;
    }

    const numResults = getWebsearchNumResults({ stepActions });
    const refsOffset = actionRefsOffset({
      agentConfiguration,
      stepActionIndex,
      stepActions,
      refsOffset: citationsRefsOffset,
    });

    // Create the AgentWebsearchAction object in the database and yield an event for the generation of
    // the params. We store the action here as the params have been generated, if an error occurs
    // later on, the action won't have outputs but the error will be stored on the parent agent
    // message.
    const action = await AgentWebsearchAction.create({
      query: queries[0], // Store the first query in the legacy field for backward compatibility
      queries: queries,
      websearchConfigurationId: actionConfiguration.sId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: owner.id,
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
        query: queries[0],
        queries: queries,
        output: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    // "assitsant-v2-websearch" has no model interaction.
    const config = cloneBaseConfig(
      getDustProdAction("assistant-v2-websearch").config
    );

    config.SEARCH.num = numResults;

    // Execute the websearch action for each query in parallel
    const websearchPromises = queries.map((query) =>
      runActionStreamed(auth, "assistant-v2-websearch", config, [{ query }], {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
      })
    );

    // Wait for all searches to complete
    const websearchResults = await Promise.all(websearchPromises);

    // Check if any search failed
    const failedSearch = websearchResults.find((result) => result.isErr());
    if (failedSearch && failedSearch.isErr()) {
      yield {
        type: "websearch_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "websearch_execution_error",
          message: failedSearch.error.message,
        },
      };
      return;
    }

    // Process all successful search results
    const allFormattedResults: WebsearchResultType[] = [];
    const errorMessages: string[] = [];

    // Process each search result
    for (let i = 0; i < websearchResults.length; i++) {
      const websearchRes = websearchResults[i];
      if (websearchRes.isErr()) {
        // This should never happen as we already checked for errors above
        continue;
      }

      const { eventStream } = websearchRes.value;

      for await (const event of eventStream) {
        if (event.type === "error") {
          logger.error(
            {
              workspaceId: owner.id,
              conversationId: conversation.id,
              error: event.content.message,
            },
            `Error running websearch action for query: ${queries[i]}`
          );
          errorMessages.push(
            `Error for query "${queries[i]}": ${event.content.message}`
          );
          continue;
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
              `Error running websearch action for query: ${queries[i]}`
            );
            errorMessages.push(`Error for query "${queries[i]}": ${e.error}`);
            continue;
          }

          if (event.content.block_name === "SEARCH_EXTRACT_FINAL" && e.value) {
            const outputValidation = WebsearchAppActionOutputSchema.decode(
              e.value
            );
            if (isLeft(outputValidation)) {
              logger.error(
                {
                  workspaceId: owner.id,
                  conversationId: conversation.id,
                  error: outputValidation.left,
                },
                `Error running websearch action for query: ${queries[i]}`
              );
              errorMessages.push(
                `Error for query "${queries[i]}": Invalid output format`
              );
              continue;
            }

            if ("error" in outputValidation.right) {
              errorMessages.push(
                `Error for query "${queries[i]}": ${outputValidation.right.error}`
              );
            }

            const rawResults = outputValidation.right.results;
            if (rawResults && rawResults.length > 0) {
              // Calculate how many references we need for this query's results
              const refsNeeded = Math.min(rawResults.length, numResults);
              const queryRefsOffset = refsOffset + allFormattedResults.length;
              const refs = getRefs().slice(
                queryRefsOffset,
                queryRefsOffset + refsNeeded
              );

              // Add query information to each result
              rawResults.forEach((result, index) => {
                if (index < refsNeeded) {
                  allFormattedResults.push({
                    ...result,
                    reference: refs[index],
                    query: queries[i],
                  });
                }
              });
            }
          }
        }
      }
    }

    // Prepare the final output
    let output: WebsearchActionOutputType;
    if (errorMessages.length > 0) {
      output = {
        results: allFormattedResults,
        error: errorMessages.join("; "),
      };
    } else {
      output = { results: allFormattedResults };
    }

    // Update ProcessAction with the output of the last block.
    await action.update({
      output,
      runId: "multiple_searches", // We don't have a single runId anymore
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
        agentMessageId: action.agentMessageId,
        query: queries[0],
        queries: queries,
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
      queries: action.queries,
      output: action.output,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
