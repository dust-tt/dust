import type {
  AgentActionConfigurationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  RetrievalDocumentChunkType,
  RetrievalErrorEvent,
  RetrievalParamsEvent,
  RetrievalSuccessEvent,
} from "@dust-tt/types";
import type {
  RetrievalActionType,
  RetrievalConfigurationType,
  RetrievalDocumentType,
  TimeFrame,
} from "@dust-tt/types";
import type { AgentActionSpecification } from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import { BaseAction, isDevelopment } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";

import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_RETRIEVAL_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import {
  actionRefsOffset,
  getRetrievalTopK,
} from "@app/lib/api/assistant/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
  PRODUCTION_DUST_WORKSPACE_ID,
} from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { RetrievalDocumentBlob } from "@app/lib/resources/retrieval_document_resource";
import { RetrievalDocumentResource } from "@app/lib/resources/retrieval_document_resource";
import logger from "@app/logger/logger";

/**
 * TimeFrame parsing
 */

// Attempts to parse a string representation of the time frame of the form `{k}{unit}` or `all`
// where {k} is a number and {unit} is one of `d`, `w`, `m`, `y` for day, week, month, year.
export function parseTimeFrame(raw: string): TimeFrame | null {
  const r = raw.trim().toLowerCase();
  if (r === "all") {
    return null;
  }

  const m = r.match(/^(\d+)([hdwmy])$/);
  if (!m) {
    return null;
  }

  const duration = parseInt(m[1], 10);
  if (isNaN(duration)) {
    return null;
  }

  let unit: TimeFrame["unit"];
  switch (m[2]) {
    case "h":
      unit = "hour";
      break;
    case "d":
      unit = "day";
      break;
    case "w":
      unit = "week";
      break;
    case "m":
      unit = "month";
      break;
    case "y":
      unit = "year";
      break;
    default:
      return null;
  }

  return {
    duration,
    unit,
  };
}

// Turns a TimeFrame into a number of milliseconds from now.
export function timeFrameFromNow(timeFrame: TimeFrame): number {
  const now = Date.now();

  switch (timeFrame.unit) {
    case "hour":
      return now - timeFrame.duration * 60 * 60 * 1000;
    case "day":
      return now - timeFrame.duration * 24 * 60 * 60 * 1000;
    case "week":
      return now - timeFrame.duration * 7 * 24 * 60 * 60 * 1000;
    case "month":
      return now - timeFrame.duration * 30 * 24 * 60 * 60 * 1000;
    case "year":
      return now - timeFrame.duration * 365 * 24 * 60 * 60 * 1000;
    default:
      ((x: never) => {
        throw new Error(`Unexpected time frame unit ${x}`);
      })(timeFrame.unit);
  }
}

interface RetrievalActionBlob {
  id: ModelId; // AgentRetrievalAction.
  agentMessageId: ModelId;
  params: {
    relativeTimeFrame: TimeFrame | null;
    query: string | null;
    topK: number;
  };
  functionCallId: string | null;
  functionCallName: string | null;
  documents: RetrievalDocumentType[] | null;
  step: number;
}

export class RetrievalAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    relativeTimeFrame: TimeFrame | null;
    query: string | null;
    topK: number;
  };
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly documents: RetrievalDocumentType[] | null;
  readonly step: number;
  readonly type = "retrieval_action";

  constructor(blob: RetrievalActionBlob) {
    super(blob.id, "retrieval_action");

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.documents = blob.documents;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    const timeFrame = this.params.relativeTimeFrame;
    const params = {
      query: this.params.query,
      relativeTimeFrame: timeFrame
        ? `${timeFrame.duration}${timeFrame.unit}`
        : "all",
      topK: this.params.topK,
    };

    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_RETRIEVAL_ACTION_NAME,
      arguments: JSON.stringify(params),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "";
    if (!this.documents?.length) {
      content += "(retrieval failed)\n";
    } else {
      for (const d of this.documents) {
        let title = d.documentId;
        for (const t of d.tags) {
          if (t.startsWith("title:")) {
            title = t.substring(6);
            break;
          }
        }

        const dataSourceName = d.dataSourceView
          ? getDataSourceNameFromView(d.dataSourceView)
          : "unknown";

        content += `TITLE: ${title} (data source: ${dataSourceName})\n`;
        content += `REFERENCE: ${d.reference}\n`;
        content += `EXTRACTS:\n`;
        for (const c of d.chunks) {
          content += `${c.text}\n`;
        }
        content += "\n";
      }
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_RETRIEVAL_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class RetrievalConfigurationServerRunner extends BaseActionConfigurationServerRunner<RetrievalConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    {
      name,
      description,
    }: {
      name: string;
      description: string | null;
    }
  ): Promise<Result<AgentActionSpecification, Error>> {
    // Generates the action specification for generation of rawInputs passed to `runRetrieval`.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runRetrieval`");
    }

    const { actionConfiguration } = this;

    const baseDescription = (() => {
      if (actionConfiguration.query === "auto") {
        return (
          "Search the data sources specified by the user." +
          " The search is based on semantic similarity between the query and chunks of information" +
          " from the data sources."
        );
      } else {
        let description =
          "Retrieve the most recent content from the data sources specified by the user";
        if (
          actionConfiguration.relativeTimeFrame === "auto" ||
          actionConfiguration.relativeTimeFrame === "none"
        ) {
          return `${description}.`;
        }
        const timeFrame = actionConfiguration.relativeTimeFrame;
        const plural = timeFrame.duration > 1 ? "s" : "";
        description += ` over the last ${timeFrame.duration} ${timeFrame.unit}${plural}.`;
        return description;
      }
    })();

    let actionDescription = `${baseDescription}`;
    if (description) {
      actionDescription += `\nDescription of the data sources:\n${description}`;
    }

    const spec = retrievalActionSpecification({
      actionConfiguration,
      name: name,
      description: actionDescription,
    });

    return new Ok(spec);
  }

  // This method is in charge of running the retrieval and creating an AgentRetrievalAction object
  // in the database (along with the RetrievalDocument and RetrievalDocumentChunk objects). It does
  // not create any generic model related to the conversation. It is possible for an
  // AgentRetrievalAction to be stored (once the query params are infered) but for the retrieval to
  // fail, in which case an error event will be emitted and the AgentRetrievalAction won't have any
  // documents associated. The error is expected to be stored by the caller on the parent agent
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
      stepActionIndex,
      stepActions,
      citationsRefsOffset,
    }: {
      stepActionIndex: number;
      stepActions: AgentActionConfigurationType[];
      citationsRefsOffset: number;
    }
  ): AsyncGenerator<
    RetrievalParamsEvent | RetrievalSuccessEvent | RetrievalErrorEvent,
    void
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runRetrieval`");
    }

    const { actionConfiguration } = this;

    let query: string | null = null;
    let relativeTimeFrame: TimeFrame | null = null;

    if (
      actionConfiguration.relativeTimeFrame !== "none" &&
      actionConfiguration.relativeTimeFrame !== "auto"
    ) {
      relativeTimeFrame = actionConfiguration.relativeTimeFrame;
    }

    if (actionConfiguration.query === "auto") {
      if (!rawInputs.query || typeof rawInputs.query !== "string") {
        yield {
          type: "retrieval_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "retrieval_parameters_generation_error",
            message: `Error generating parameters for retrieval: failed to generate a valid query.`,
          },
        };
        return;
      }
      query = rawInputs.query as string;
    }

    if (actionConfiguration.relativeTimeFrame === "auto") {
      if (
        rawInputs.relativeTimeFrame &&
        typeof rawInputs.relativeTimeFrame === "string"
      ) {
        relativeTimeFrame = parseTimeFrame(rawInputs.relativeTimeFrame);
      }
    }

    const topK = getRetrievalTopK({
      agentConfiguration,
      stepActions,
    });
    const refsOffset = actionRefsOffset({
      agentConfiguration,
      stepActionIndex,
      stepActions,
      refsOffset: citationsRefsOffset,
    });

    // Create the AgentRetrievalAction object in the database and yield an event for the generation
    // of the params. We store the action here as the params have been generated, if an error occurs
    // later on, the action won't have retrieved documents but the error will be stored on the
    // parent agent message.
    const action = await AgentRetrievalAction.create({
      query: query,
      relativeTimeFrameDuration: relativeTimeFrame?.duration ?? null,
      relativeTimeFrameUnit: relativeTimeFrame?.unit ?? null,
      topK,
      retrievalConfigurationId: actionConfiguration.sId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step: step,
    });

    yield {
      type: "retrieval_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      dataSources: actionConfiguration.dataSources,
      action: new RetrievalAction({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        params: {
          relativeTimeFrame,
          query,
          topK,
        },
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        documents: null,
        step: action.step,
      }),
    };

    const now = Date.now();

    const dataSourceViews = await DataSourceViewResource.fetchByIds(
      auth,
      _.uniq(actionConfiguration.dataSources.map((ds) => ds.dataSourceViewId))
    );
    const dataSourceViewsMap = Object.fromEntries(
      dataSourceViews.map((dsv) => [dsv.sId, dsv])
    );

    // "assistant-v2-retrieval" has no model interaction.
    const config = cloneBaseConfig(
      DustProdActionRegistry["assistant-v2-retrieval"].config
    );

    // Handle data sources list and parents/tags filtering.
    config.DATASOURCE.data_sources = actionConfiguration.dataSources.map(
      (d) => ({
        workspace_id:
          isDevelopment() && !apiConfig.getDevelopmentDustAppsWorkspaceId()
            ? PRODUCTION_DUST_WORKSPACE_ID
            : d.workspaceId,
        // Note: This value is passed to the registry for lookup. The registry will return the
        // associated data source's dustAPIDataSourceId.
        data_source_id: d.dataSourceViewId,
      })
    );

    for (const ds of actionConfiguration.dataSources) {
      // Not: empty array in parents/tags.in means "no document match" since no documents has any
      // tags/parents that is in the empty array.
      if (!config.DATASOURCE.filter.parents) {
        config.DATASOURCE.filter.parents = {};
      }
      if (ds.filter.parents?.in) {
        if (!config.DATASOURCE.filter.parents.in_map) {
          config.DATASOURCE.filter.parents.in_map = {};
        }

        const dsView = dataSourceViewsMap[ds.dataSourceViewId];
        // This should never happen since dataSourceViews are stored by id in the
        // agent_data_source_configurations table.
        assert(dsView, `Data source view ${ds.dataSourceViewId} not found`);

        // Note we use the dustAPIDataSourceId here since this is what is returned from the registry
        // lookup.
        config.DATASOURCE.filter.parents.in_map[
          dsView.dataSource.dustAPIDataSourceId
        ] = ds.filter.parents.in;
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

    // Handle top k.
    config.DATASOURCE.top_k = topK;

    const res = await runActionStreamed(
      auth,
      "assistant-v2-retrieval",
      config,
      [
        {
          query,
        },
      ],
      {
        conversationId: conversation.sId,
        workspaceId: conversation.owner.sId,
        agentMessageId: agentMessage.sId,
      }
    );

    if (res.isErr()) {
      logger.error(
        {
          workspaceId: owner.id,
          conversationId: conversation.id,
          error: res.error,
        },
        "Error running retrieval"
      );
      yield {
        type: "retrieval_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "retrieval_search_error",
          message: `Error searching data sources: ${res.error.message}`,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = res.value;

    let blobs: {
      blob: RetrievalDocumentBlob;
      chunks: RetrievalDocumentChunkType[];
      dataSourceView: DataSourceViewResource;
    }[] = [];

    // This is not perfect and will be erroneous in case of two data sources with the same id from
    // two different workspaces. We don't support cross workspace data sources right now. But we'll
    // likely want `core` to return the `workspace_id` that was used eventualy.
    const dustAPIDataSourcesIdToDetails = Object.fromEntries(
      actionConfiguration.dataSources.map((ds) => [
        dataSourceViewsMap[ds.dataSourceViewId].dataSource.dustAPIDataSourceId,
        {
          dataSourceView: dataSourceViewsMap[ds.dataSourceViewId],
          workspaceId: ds.workspaceId,
        },
      ])
    );

    for await (const event of eventStream) {
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running retrieval"
        );
        yield {
          type: "retrieval_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "retrieval_search_error",
            message: `Error searching data sources: ${event.content.message}`,
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
            "Error running retrieval"
          );
          yield {
            type: "retrieval_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "retrieval_search_error",
              message: `Error searching data sources: ${e.error}`,
            },
          };
          return;
        }

        if (event.content.block_name === "DATASOURCE" && e.value) {
          const v = e.value as {
            data_source_id: string;
            created: number;
            document_id: string;
            timestamp: number;
            tags: string[];
            parents: string[];
            source_url: string | null;
            hash: string;
            text_size: number;
            chunk_count: number;
            chunks: {
              text: string;
              hash: string;
              offset: number;
              score: number;
            }[];
          }[];

          if (refsOffset + topK > getRefs().length) {
            logger.error(
              {
                refsOffset,
                topK,
                conversationId: conversation.sId,
                panic: true,
              },
              "Exhausted the total number of references available"
            );
            yield {
              type: "retrieval_error",
              created: Date.now(),
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              error: {
                code: "retrieval_references_exhausted",
                message:
                  "The retrieval actions exhausted the total number of references available for citations",
              },
            };
            return;
          }

          const refs = getRefs().slice(refsOffset, refsOffset + topK);

          // Prepare an array of document blobs and chunks to be passed to makeNewBatch.
          blobs = v.map((d, i) => {
            const reference = refs[i % refs.length];

            const details = dustAPIDataSourcesIdToDetails[d.data_source_id];
            assert(details, `Data source view ${d.data_source_id} not found`);

            return {
              blob: {
                sourceUrl: d.source_url,
                documentId: d.document_id,
                reference,
                documentTimestamp: new Date(d.timestamp),
                tags: d.tags,
                score: Math.max(...d.chunks.map((c) => c.score)),
                retrievalActionId: action.id,
              },
              chunks: d.chunks,
              dataSourceView: details.dataSourceView,
            };
          });
        }
      }
    }

    // We are done, store documents and chunks in database and yield the final events.
    const documents = await RetrievalDocumentResource.makeNewBatch(blobs);

    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Retrieval action execution"
    );

    // Update RetrievalAction with the runId.
    await action.update({
      runId: await dustRunId,
    });

    yield {
      type: "retrieval_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new RetrievalAction({
        id: action.id,
        agentMessageId: agentMessage.agentMessageId,
        params: {
          relativeTimeFrame: relativeTimeFrame,
          query: query,
          topK,
        },
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        documents: documents.map((d) => d.toJSON(auth)),
        step: action.step,
      }),
    };
  }
}

export function retrievalAutoQueryInputSpecification() {
  return {
    name: "query",
    description:
      "The string used to retrieve relevant chunks of information using semantic similarity" +
      " based on the user request and conversation context." +
      " Include as much semantic signal based on the entire conversation history," +
      " paraphrasing if necessary. longer queries are generally better.",
    type: "string" as const,
  };
}

export function retrievalAutoTimeFrameInputSpecification() {
  return {
    name: "relativeTimeFrame",
    description:
      "The time frame (relative to LOCAL_TIME) to restrict the search based" +
      " on the user request and past conversation context." +
      " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
      " where {k} is a number. Be strict, do not invent invalid values.",
    type: "string" as const,
  };
}

function retrievalActionSpecification({
  actionConfiguration,
  name,
  description,
}: {
  actionConfiguration: RetrievalConfigurationType;
  name: string;
  description: string;
}): AgentActionSpecification {
  const inputs = [];

  if (actionConfiguration.query === "auto") {
    inputs.push(retrievalAutoQueryInputSpecification());
  }
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
export async function retrievalActionTypesFromAgentMessageIds(
  auth: Authenticator,
  agentMessageIds: ModelId[]
): Promise<RetrievalActionType[]> {
  const models = await AgentRetrievalAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  const actionById = models.reduce<{
    [id: ModelId]: AgentRetrievalAction;
  }>((acc, a) => {
    acc[a.id] = a;
    return acc;
  }, {});

  const actionIds = models.map((a) => a.id);

  const documents = await RetrievalDocumentResource.listAllForActions(
    auth,
    actionIds
  );
  const documentRowsByActionId = documents.reduce<{
    [id: ModelId]: RetrievalDocumentResource[];
  }>((acc, d) => {
    if (!acc[d.retrievalActionId]) {
      acc[d.retrievalActionId] = [];
    }
    acc[d.retrievalActionId].push(d);
    return acc;
  }, {});

  const actions: RetrievalActionType[] = [];

  for (const id of actionIds) {
    const action = actionById[id];
    const documentRows = documentRowsByActionId[id] ?? [];

    let relativeTimeFrame: TimeFrame | null = null;
    if (action.relativeTimeFrameDuration && action.relativeTimeFrameUnit) {
      relativeTimeFrame = {
        duration: action.relativeTimeFrameDuration,
        unit: action.relativeTimeFrameUnit,
      };
    }

    const documents: RetrievalDocumentType[] = documentRows.map((d) =>
      d.toJSON(auth)
    );

    documents.sort((a, b) => {
      if (a.score === null && b.score === null) {
        return b.timestamp - a.timestamp;
      }
      if (a.score !== null && b.score !== null) {
        return b.score - a.score;
      }
      throw new Error(
        "Unexpected comparison of null and non-null scored documents."
      );
    });

    actions.push(
      new RetrievalAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        params: {
          query: action.query,
          relativeTimeFrame,
          topK: action.topK,
        },
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        documents,
        step: action.step,
      })
    );
  }

  return actions;
}
