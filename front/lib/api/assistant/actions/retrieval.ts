import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { generateActionInputs } from "@app/lib/api/assistant/agent";
import { ModelMessageType } from "@app/lib/api/assistant/generation";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize, ModelId } from "@app/lib/databases";
import {
  AgentRetrievalAction,
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import {
  DataSourceConfiguration,
  isRetrievalConfiguration,
  RetrievalActionType,
  RetrievalConfigurationType,
  RetrievalDocumentType,
  TimeFrame,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionSpecification,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";

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

/**
 * Model rendering of retrievals.
 */

export function renderRetrievalActionForModel(
  action: RetrievalActionType
): ModelMessageType {
  let content = "";
  if (!action.documents) {
    throw new Error(
      "Documents not set on retrieval action; this usually means the retrieval action is not finished."
    );
  }
  for (const d of action.documents) {
    let title = d.documentId;
    for (const t of d.tags) {
      if (t.startsWith("title:")) {
        title = t.substring(6);
        break;
      }
    }

    let dataSourceName = d.dataSourceId;
    if (d.dataSourceId.startsWith("managed-")) {
      dataSourceName = d.dataSourceId.substring(8);
    }

    content += `TITLE: ${title} (data source: ${dataSourceName})\n`;
    content += `REFERENCE: ${d.reference}\n`;
    content += `EXTRACTS:\n`;
    for (const c of d.chunks) {
      content += `${c.text}\n`;
    }
    content += "\n";
  }

  return {
    role: "action" as const,
    name: "search_data_sources",
    content,
  };
}

/**
 * Params generation.
 */

export async function retrievalActionSpecification(
  configuration: RetrievalConfigurationType
): Promise<AgentActionSpecification> {
  const inputs = [];

  if (configuration.query === "auto") {
    inputs.push({
      name: "query",
      description:
        "The string used to retrieve relevant chunks of information using semantic similarity" +
        " based on the user request and conversation context.",
      type: "string" as const,
    });
  }
  if (configuration.relativeTimeFrame === "auto") {
    inputs.push({
      name: "relativeTimeFrame",
      description:
        "The time frame (relative to now) to restrict the search based on the user request and past conversation context." +
        " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y` where {k} is a number.",
      type: "string" as const,
    });
  }

  return {
    name: "search_data_sources",
    description:
      "Search the data sources specified by the user for information to answer their request." +
      " The search is based on semantic similarity between the query and chunks of information from the data sources.",
    inputs,
  };
}

/// Generates retrieval parameters given the agent configuration and the conversation context,
/// potentially generating the query and relative time frame.
export async function generateRetrievalParams(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType
): Promise<
  Result<
    {
      query: string | null;
      relativeTimeFrame: TimeFrame | null;
      topK: number | "auto";
    },
    Error
  >
> {
  const c = configuration.action;
  if (!isRetrievalConfiguration(c)) {
    throw new Error(
      "Unexpected action configuration received in `generateRetrievalParams`"
    );
  }

  let query: string | null = null;
  let relativeTimeFrame: TimeFrame | null = null;

  if (c.relativeTimeFrame !== "none" && c.relativeTimeFrame !== "auto") {
    relativeTimeFrame = c.relativeTimeFrame;
  }

  if (c.query !== "none" && c.query !== "auto") {
    query = c.query.template.replace("_USER_MESSAGE_", userMessage.content);
  }

  const spec = await retrievalActionSpecification(c);

  if (spec.inputs.length > 0) {
    const now = Date.now();

    const rawInputsRes = await generateActionInputs(
      auth,
      configuration,
      spec,
      conversation,
      userMessage
    );

    if (rawInputsRes.isOk()) {
      const rawInputs = rawInputsRes.value;

      logger.info(
        {
          elapsed: Date.now() - now,
        },
        "[ASSISTANT_TRACE] retrieval action inputs generation"
      );

      if (c.query === "auto") {
        if (!rawInputs.query || typeof rawInputs.query !== "string") {
          return new Err(
            new Error("Failed to generate a valid retrieval query.")
          );
        }
        query = rawInputs.query as string;
      }

      if (c.relativeTimeFrame === "auto") {
        if (
          rawInputs.relativeTimeFrame &&
          typeof rawInputs.relativeTimeFrame === "string"
        ) {
          relativeTimeFrame = parseTimeFrame(rawInputs.relativeTimeFrame);
        }
      }
    } else {
      logger.info(
        {
          elapsed: Date.now() - now,
          error: rawInputsRes.error,
        },
        "Error generating retrieval action inputs"
      );

      // We fail the rerieval only if we had to generate a query but failed to do so, if the
      // relativeTimeFrame failed, we'll just use `null`.
      if (c.query === "auto") {
        return rawInputsRes;
      }
    }
  }

  return new Ok({
    query,
    relativeTimeFrame,
    topK: c.topK,
  });
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a retrieval action. This should not be used
// outside of api/assistant. We allow a ModelId interface here because we don't have `sId` on
// actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of this action).
export async function renderRetrievalActionByModelId(
  id: ModelId
): Promise<RetrievalActionType> {
  const action = await AgentRetrievalAction.findByPk(id);
  if (!action) {
    throw new Error(`No retrieval action found with id ${id}`);
  }

  const documentRows = await RetrievalDocument.findAll({
    where: {
      retrievalActionId: action.id,
    },
  });

  const chunkRows = await RetrievalDocumentChunk.findAll({
    where: {
      retrievalDocumentId: documentRows.map((d) => d.id),
    },
  });

  let relativeTimeFrame: TimeFrame | null = null;
  if (action.relativeTimeFrameDuration && action.relativeTimeFrameUnit) {
    relativeTimeFrame = {
      duration: action.relativeTimeFrameDuration,
      unit: action.relativeTimeFrameUnit,
    };
  }

  const documents: RetrievalDocumentType[] = documentRows.map((d) => {
    const chunks = chunkRows
      .filter((c) => c.retrievalDocumentId === d.id)
      .map((c) => ({
        text: c.text,
        offset: c.offset,
        score: c.score,
      }));
    chunks.sort((a, b) => {
      if (a.score === null && b.score === null) {
        return a.offset - b.offset;
      }
      if (a.score !== null && b.score !== null) {
        b.score - a.score;
      }
      throw new Error(
        "Unexpected comparison of null and non-null scored chunks."
      );
    });

    return {
      id: d.id,
      dataSourceId: d.dataSourceId,
      sourceUrl: d.sourceUrl,
      documentId: d.documentId,
      reference: d.reference,
      timestamp: d.documentTimestamp.getTime(),
      tags: d.tags,
      score: d.score,
      chunks,
    };
  });

  documents.sort((a, b) => {
    if (a.score === null && b.score === null) {
      return b.timestamp - a.timestamp;
    }
    if (a.score !== null && b.score !== null) {
      b.score - a.score;
    }
    throw new Error(
      "Unexpected comparison of null and non-null scored documents."
    );
  });

  return {
    id: action.id,
    type: "retrieval_action",
    params: {
      query: action.query,
      relativeTimeFrame,
      topK: action.topK,
    },
    documents,
  };
}

/**
 * Retrieval meta-prompt
 */
export function retrievalMetaPrompt() {
  return (
    "To cite retrieved documents from data sources use the markdown directive :cite[REFERENCE]" +
    " (eg :cite[XX] or :cite[XX,XX] but not :site[XX][XX])." +
    " Use citations as close as possible to the information you are citing."
  );
}

/**
 * Action execution.
 */

let REFS: string[] | null = null;

const getRefs = () => {
  if (REFS === null) {
    REFS = "abcdefghijklmnopqrstuvwxyz"
      .split("")
      .map((c) => {
        return "123456789".split("").map((n) => {
          return `${c}${n}`;
        });
      })
      .flat();
    // randomize
    REFS.sort(() => Math.random() - 0.5);
  }
  return REFS;
};

// Event sent during retrieval with the finalized query used to retrieve documents.
export type RetrievalParamsEvent = {
  type: "retrieval_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: "all" | DataSourceConfiguration[];
  action: RetrievalActionType;
};

export type RetrievalErrorEvent = {
  type: "retrieval_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type RetrievalSuccessEvent = {
  type: "retrieval_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: RetrievalActionType;
};

// This method is in charge of running the retrieval and creating an AgentRetrievalAction object in
// the database (along with the RetrievalDocument and RetrievalDocumentChunk objects). It does not
// create any generic model related to the conversation. It is possible for an AgentRetrievalAction
// to be stored (once the query params are infered) but for the retrieval to fail, in which case an
// error event will be emitted and the AgentRetrievalAction won't have any documents associated. The
// error is expected to be stored by the caller on the parent agent message.
export async function* runRetrieval(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  RetrievalParamsEvent | RetrievalSuccessEvent | RetrievalErrorEvent,
  void
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runRetrieval`");
  }

  const c = configuration.action;
  if (!isRetrievalConfiguration(c)) {
    throw new Error(
      "Unexpected action configuration received in `runRetrieval`"
    );
  }

  const paramsRes = await generateRetrievalParams(
    auth,
    configuration,
    conversation,
    userMessage
  );

  if (paramsRes.isErr()) {
    yield {
      type: "retrieval_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "retrieval_parameters_generation_error",
        message: `Error generating parameters for retrieval: ${paramsRes.error.message}`,
      },
    };
    return;
  }

  const params = paramsRes.value;

  const model = configuration.generation?.model;

  let topK = 16;

  if (params.topK === "auto") {
    if (!model) {
      logger.warn(
        "Retrieval topK mode is set to auto, but there is no model to infer it from. Defaulting to 16."
      );
    } else {
      const supportedModel = getSupportedModelConfig(model);
      topK = supportedModel.recommendedTopK;
    }
  } else {
    topK = params.topK;
  }

  // Create the AgentRetrievalAction object in the database and yield an event for the generation of
  // the params. We store the action here as the params have been generated, if an error occurs
  // later on, the action won't have retrieved documents but the error will be stored on the parent
  // agent message.
  const action = await AgentRetrievalAction.create({
    query: params.query,
    relativeTimeFrameDuration: params.relativeTimeFrame?.duration ?? null,
    relativeTimeFrameUnit: params.relativeTimeFrame?.unit ?? null,
    topK,
    retrievalConfigurationId: c.sId,
  });

  yield {
    type: "retrieval_params",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    dataSources: c.dataSources,
    action: {
      id: action.id,
      type: "retrieval_action",
      params: {
        relativeTimeFrame: params.relativeTimeFrame,
        query: params.query,
        topK,
      },
      documents: null,
    },
  };

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-retrieval"].config
  );

  // Handle data sources list and parents/tags filtering.
  config.DATASOURCE.data_sources = c.dataSources.map((d) => ({
    workspace_id: d.workspaceId,
    data_source_id: d.dataSourceId,
  }));

  for (const ds of c.dataSources) {
    if (ds.filter.tags) {
      if (!config.DATASOURCE.filter.tags) {
        config.DATASOURCE.filter.tags = { in: [], not: [] };
      }

      config.DATASOURCE.filter.tags.in.push(...ds.filter.tags.in);
      config.DATASOURCE.filter.tags.not.push(...ds.filter.tags.not);
    }

    if (ds.filter.parents) {
      if (!config.DATASOURCE.filter.parents) {
        config.DATASOURCE.filter.parents = { in: [], not: [] };
      }

      config.DATASOURCE.filter.parents.in.push(...ds.filter.parents.in);
      config.DATASOURCE.filter.parents.not.push(...ds.filter.parents.not);
    }
  }

  // Handle timestamp filtering.
  if (params.relativeTimeFrame) {
    config.DATASOURCE.filter.timestamp = {
      gt: timeFrameFromNow(params.relativeTimeFrame),
    };
  }

  // Handle top k.
  config.DATASOURCE.top_k = topK;

  const res = await runAction(auth, "assistant-v2-retrieval", config, [
    {
      query: params.query,
    },
  ]);

  if (res.isErr()) {
    yield {
      type: "retrieval_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "retrieval_search_error",
        message: `Error searching data sources: ${res.error.message}`,
      },
    };
    return;
  }

  const run = res.value;
  let documents: RetrievalDocumentType[] = [];

  for (const t of run.traces) {
    if (t[1][0][0].error) {
      yield {
        type: "retrieval_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "retrieval_search_error",
          message: `Error searching data sources: ${t[1][0][0].error}`,
        },
      };
      return;
    }
    if (t[0][1] === "DATASOURCE") {
      const v = t[1][0][0].value as {
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
        chunks: { text: string; hash: string; offset: number; score: number }[];
        token_count: number;
      }[];

      const refs = getRefs();
      documents = v.map((d, i) => {
        const reference = refs[i % refs.length];
        return {
          id: 0, // dummy pending database insertion
          dataSourceId: d.data_source_id,
          documentId: d.document_id,
          reference,
          timestamp: d.timestamp,
          tags: d.tags,
          sourceUrl: d.source_url ?? null,
          score: d.chunks.map((c) => c.score)[0],
          chunks: d.chunks.map((c) => ({
            text: c.text,
            offset: c.offset,
            score: c.score,
          })),
        };
      });
    }
  }

  // We are done, store documents and chunks in database and yield the final events.

  await front_sequelize.transaction(async (t) => {
    for (const d of documents) {
      const document = await RetrievalDocument.create(
        {
          dataSourceId: d.dataSourceId,
          sourceUrl: d.sourceUrl,
          documentId: d.documentId,
          reference: d.reference,
          documentTimestamp: new Date(d.timestamp),
          tags: d.tags,
          score: d.score,
          retrievalActionId: action.id,
        },
        { transaction: t }
      );

      d.id = document.id;

      for (const c of d.chunks) {
        await RetrievalDocumentChunk.create(
          {
            text: c.text,
            offset: c.offset,
            score: c.score,
            retrievalDocumentId: document.id,
          },
          { transaction: t }
        );
      }
    }
  });

  yield {
    type: "retrieval_success",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      type: "retrieval_action",
      params: {
        relativeTimeFrame: params.relativeTimeFrame,
        query: params.query,
        topK,
      },
      documents,
    },
  };
}
