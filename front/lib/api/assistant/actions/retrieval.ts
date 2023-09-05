import { Authenticator } from "@app/lib/auth";
import {
  DataSourceConfiguration,
  DataSourceFilter,
  RetrievalActionType,
  RetrievalDocumentType,
  TimeFrame,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionInputsSpecification,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  AssistantAgentMessageType,
  AssistantConversationType,
} from "@app/types/assistant/conversation";

/**
 * Inputs generation.
 */

export async function retrievalInputsSpecification(
  auth: Authenticator,
  configuration: AgentConfigurationType
): Promise<AgentActionInputsSpecification> {
  return {
    inputs: [],
  };
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
  yield {
    type: "retrieval_error",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: message.sId,
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}
