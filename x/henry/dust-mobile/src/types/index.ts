import type {
  AgentMessagePublicType,
  ConversationPublicType,
  LightAgentConfigurationType,
  UserMessageType,
  UserType,
  WorkspaceType,
} from "@dust-tt/client";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type StoredUser = UserType & {
  workspaces: WorkspaceType[];
  selectedWorkspace: string | null;
  dustDomain: string;
  connectionStrategy?: string;
  connection?: string;
};

export type AgentStateClassification =
  | "thinking"
  | "acting"
  | "writing"
  | "done";

export type MessageTemporaryState = {
  message: AgentMessagePublicType;
  agentState: AgentStateClassification;
  lastUpdated: Date;
};

export type MessageWithContentFragments =
  | AgentMessagePublicType
  | UserMessageType;

export type ConversationWithMessages = ConversationPublicType;

export type NavigationParamList = {
  Login: undefined;
  WorkspaceSelection: undefined;
  Main: undefined;
  ConversationList: undefined;
  Conversation: {
    conversationId?: string;
    agentId?: string;
  };
  AgentPicker: undefined;
};

export type { LightAgentConfigurationType };
