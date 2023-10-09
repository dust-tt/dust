import { Authenticator } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { SpecificationType } from "@app/types/app";
import {
  DustAppParameters,
  DustAppRunActionType,
  DustAppRunConfigurationType,
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

import { getApp } from "../../app";
import { getDatasetSchema } from "../../datasets";
import { generateActionInputs } from "../agent";

/**
 * Params generation.
 */

export async function dustAppRunActionSpecification(
  auth: Authenticator,
  configuration: DustAppRunConfigurationType
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    return new Err(
      new Error(
        "Unexpected unauthenticated call to `dustAppRunActionSpecification`"
      )
    );
  }

  if (owner.sId !== configuration.app.workspaceId) {
    return new Err(
      new Error(
        "Runing Dust apps that are not part of your own workspace is not supported yet."
      )
    );
  }

  const app = await getApp(auth, configuration.app.appId);
  if (!app) {
    return new Err(
      new Error(
        `Failed to retrieve Dust app with id: ${configuration.app.appId}`
      )
    );
  }

  const appName = app.name;
  const appDescription = app.description;

  // Parse the specifiaction of the app.
  const appSpec = JSON.parse(
    app.savedSpecification || `[]`
  ) as SpecificationType;
  const input = appSpec.find((b) => b.type === "input");

  // If we have no input block there is no need to generate any input.
  if (!input) {
    return new Ok({
      name: appName,
      description: appDescription || "",
      inputs: [],
    });
  }

  // We have an input block, we need to find associated dataset and its schema.
  const config = extractConfig(JSON.parse(app.savedSpecification || `{}`));
  const datasetName: string = config.input?.dataset || "";

  const schema = await getDatasetSchema(auth, app, datasetName);
  if (!schema) {
    return new Err(
      new Error(
        `Failed to retrieve schema for dataset: ${configuration.app.appId}/${datasetName}`
      )
    );
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
  userMessage: UserMessageType
): Promise<Result<DustAppParameters, Error>> {
  const c = configuration.action;
  if (!isDustAppRunConfiguration(c)) {
    throw new Error(
      "Unexpected action configuration received in `generateDustAppRunParams`"
    );
  }

  const specRes = await dustAppRunActionSpecification(auth, c);
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
      // Check that all inputs are accounted for.

      logger.info(
        {
          elapsed: Date.now() - now,
        },
        "[ASSISTANT_TRACE] DustAppRun action inputs generation"
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
        "Error generating DustAppRun action inputs"
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

// Event sent during before the execution of a dust app run with the finalized params to be used.
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
  DustAppRunParamsEvent | DustAppRunSuccessEvent | DustAppRunErrorEvent,
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

  const paramsRes = await generateDustAppParams(
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

  // This is not perfect and will be erroneous in case of two data sources with the same id from two
  // different workspaces. We don't support cross workspace data sources right now. But we'll likely
  // want `core` to return the `workspace_id` that was used eventualy.
  // TODO(spolu): make `core` return data source workspace id.
  const dataSourcesIdToWorkspaceId: { [key: string]: string } = {};
  for (const ds of c.dataSources) {
    dataSourcesIdToWorkspaceId[ds.dataSourceId] = ds.workspaceId;
  }

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
          dataSourceWorkspaceId: dataSourcesIdToWorkspaceId[d.data_source_id],
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
          dataSourceWorkspaceId: d.dataSourceWorkspaceId,
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
