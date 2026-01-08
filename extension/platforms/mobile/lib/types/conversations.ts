// Re-export types from @dust-tt/client with backward-compatible aliases
export type {
  ConversationPublicType as ConversationWithContent,
  ConversationWithoutContentPublicType as ConversationWithoutContent,
  UserMessageType as UserMessage,
  AgentMessagePublicType as AgentMessage,
  ContentFragmentType as ContentFragment,
  LightAgentConfigurationType as LightAgentConfiguration,
  LightAgentConfigurationType as AgentConfiguration,
  AgentActionPublicType as AgentAction,
  MessagePublicType as Message,
  ActionGeneratedFileType as GeneratedFile,
} from "@dust-tt/client";

// CitationType - used for citation markers in markdown
// Defined locally as the SDK doesn't export this type
export type CitationType = {
  href: string;
  title: string;
  provider: string;
  contentType?: string;
};

// Types that don't have direct SDK equivalents - define locally
export type ConversationVisibility = "unlisted" | "deleted";
export type MessageVisibility = "visible" | "deleted";
export type AgentMessageStatus = "created" | "succeeded" | "failed" | "cancelled";

// Response types that match mobile's usage patterns
export type GetConversationsResponse = {
  conversations: import("@dust-tt/client").ConversationWithoutContentPublicType[];
};

export type GetConversationResponse = {
  conversation: import("@dust-tt/client").ConversationPublicType;
};

export type GetAgentConfigurationsResponse = {
  agentConfigurations: import("@dust-tt/client").LightAgentConfigurationType[];
};

// Parsed content types for UI rendering
export type AgentActionOutput =
  | { type: "text"; text: string }
  | {
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

export type ParsedContentItem =
  | { kind: "reasoning"; content: string }
  | { kind: "action"; action: import("@dust-tt/client").AgentActionPublicType };

// MessageArray type for conversation content
export type MessageArray =
  | import("@dust-tt/client").UserMessageType[]
  | import("@dust-tt/client").AgentMessagePublicType[]
  | import("@dust-tt/client").ContentFragmentType[];
