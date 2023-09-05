import { Authenticator } from "@app/lib/auth";
import { Ok, Result } from "@app/lib/result";
import {
  DataSourceConfiguration,
  RetrievalActionType,
  RetrievalConfigurationType,
  RetrievalDocumentType,
  TimeFrame,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentActionSpecification,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  AssistantAgentMessageType,
  AssistantConversationType,
} from "@app/types/assistant/conversation";

import { generateActionInputs } from "../agent";

export function isRetrievalConfiguration(
  arg: AgentActionConfigurationType | null
): arg is RetrievalConfigurationType {
  return arg !== null && arg.type && arg.type === "retrieval_configuration";
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
        "The time frame (relative to now) to restrict the search based on the user request and conversation context." +
        " Possible values are: `all`, `{k}d`, `{k}w`, `{k}m`, `{k}y` where {k} is a number.",
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

export async function generateRetrievalParams(
  auth: Authenticator,
  configuration: RetrievalConfigurationType,
  conversation: AssistantConversationType,
  message: AssistantAgentMessageType
): Promise<
  Result<
    { query: string | null; relativeTimeFrame: TimeFrame | null; topK: number },
    Error
  >
> {
  const spec = await retrievalActionSpecification(configuration);

  if (spec.inputs.length > 0) {
    const rawInputsRes = await generateActionInputs(
      auth,
      spec,
      conversation,
      message
    );

    if (rawInputsRes.isErr()) {
      return rawInputsRes;
    }
  }

  // TODO(spolu): turn rawInputs into actual params

  return new Ok({
    query: null,
    relativeTimeFrame: null,
    topK: configuration.topK,
  });
}

/**
 * Action execution.
 */

// Event sent during retrieval with the finalized query used to retrieve documents.
export type RetrievalParamsEvent = {
  type: "retrieval_params";
  created: number;
  dataSources: "all" | DataSourceConfiguration[];
  query: string | null;
  relativeTimeFrame: TimeFrame | null;
  topK: number;
};

// Event sent during retrieval once the retrieved documents have been generated.
export type RetrievalDocumentsEvent = {
  type: "retrieval_documents";
  created: number;
  configurationId: string;
  messageId: string;
  documents: RetrievalDocumentType[];
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

// This method is in charge of running the retrieval and creating an AssistantAgentRetrieval DB
// object in the database (along with the RetrievedDocument objects). It does not create any generic
// model related to the conversation.
export async function* runRetrieval(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: AssistantConversationType,
  message: AssistantAgentMessageType
): AsyncGenerator<
  | RetrievalParamsEvent
  | RetrievalDocumentsEvent
  | RetrievalSuccessEvent
  | RetrievalErrorEvent
> {
  const c = configuration.action;
  if (!isRetrievalConfiguration(c)) {
    return yield {
      type: "retrieval_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: message.sId,
      error: {
        code: "internal_server_error",
        message: "Unexpected action configuration received in `runRetrieval`",
      },
    };
  }

  const paramsRes = await generateRetrievalParams(
    auth,
    c,
    conversation,
    message
  );

  if (paramsRes.isErr()) {
    return yield {
      type: "retrieval_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: message.sId,
      error: {
        code: "retrieval_parameters_generation_error",
        message: `Error generating parameters for retrieval: ${paramsRes.error.message}`,
      },
    };
  }

  const params = paramsRes.value;

  yield {
    type: "retrieval_params",
    created: Date.now(),
    dataSources: c.dataSources,
    query: params.query,
    relativeTimeFrame: params.relativeTimeFrame,
    topK: params.topK,
  };
}
