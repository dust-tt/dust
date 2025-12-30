export type CitationType = {
  href: string;
  title: string;
  provider: string;
  contentType?: string;
};

export type ConversationVisibility = "unlisted" | "deleted";
export type MessageVisibility = "visible" | "deleted";
export type AgentMessageStatus = "created" | "succeeded" | "failed" | "cancelled";

export type ConversationWithoutContent = {
  id: number;
  sId: string;
  title: string | null;
  created: number;
  updated?: number;
  unread: boolean;
  actionRequired: boolean;
  visibility: ConversationVisibility;
  owner: {
    sId: string;
    name: string;
  };
  groupIds?: string[];
};

export type UserMessage = {
  id: number;
  created: number;
  type: "user_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  user: {
    sId: string;
    fullName: string;
    image: string | null;
  } | null;
  content: string;
};

export type AgentConfiguration = {
  sId: string;
  name: string;
  pictureUrl: string | null;
};

export type AgentActionOutput = {
  type: "text";
  text: string;
} | {
  type: "resource";
  resource: {
    ref?: string;
    reference?: string;
    text?: string;
    title?: string;
    uri?: string;
    mimeType?: string;
    source?: { provider?: string };
    metadata?: { title?: string; connectorProvider?: string };
  };
};

export type AgentAction = {
  id: number;
  type: string;
  functionCallName: string | null;
  toolName: string;
  internalMCPServerName: string | null;
  params: Record<string, unknown>;
  output: AgentActionOutput[] | null;
  status: "pending" | "running" | "succeeded" | "failed" | "denied";
  generatedFiles: GeneratedFile[];
};

export type GeneratedFile = {
  fileId: string;
  title: string;
  contentType: string;
  hidden?: boolean;
};

export type ParsedContentItem =
  | { kind: "reasoning"; content: string }
  | { kind: "action"; action: AgentAction };

export type AgentMessage = {
  id: number;
  agentMessageId: number;
  created: number;
  completedTs: number | null;
  type: "agent_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  configuration: AgentConfiguration;
  status: AgentMessageStatus;
  content: string | null;
  chainOfThought: string | null;
  actions: AgentAction[];
  parsedContents: Record<number, ParsedContentItem[]>;
  generatedFiles: GeneratedFile[];
  error: {
    code: string;
    message: string;
  } | null;
};

export type ContentFragment = {
  id: number;
  type: "content_fragment";
  sId: string;
  created: number;
  visibility: MessageVisibility;
  title: string;
  sourceUrl: string | null;
};

export type Message = UserMessage | AgentMessage | ContentFragment;
export type MessageArray = UserMessage[] | AgentMessage[] | ContentFragment[];

export type ConversationWithContent = ConversationWithoutContent & {
  content: MessageArray[];
};

export type GetConversationsResponse = {
  conversations: ConversationWithoutContent[];
};

export type GetConversationResponse = {
  conversation: ConversationWithContent;
};

export type LightAgentConfiguration = {
  sId: string;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  status: "active" | "archived" | "draft";
  scope: "workspace" | "published" | "private" | "global";
};

export type GetAgentConfigurationsResponse = {
  agentConfigurations: LightAgentConfiguration[];
};
