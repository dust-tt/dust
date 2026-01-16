import type { KeyedMutator } from "swr";
import type {
  ConversationPublicType,
  ConversationWithoutContentPublicType,
  LightAgentConfigurationType,
} from "@dust-tt/client";

// SWR key types
export type AgentConfigurationsKey =
  | ["getAgentConfigurations", string]
  | ["getAgentConfigurations", string, string | undefined]
  | null;
export type ConversationsKey = ["getConversations", string] | null;
export type ConversationKey =
  | ["getConversation", string, { conversationId: string }]
  | null;

// Hook result types
export interface UseAgentConfigurationsResult {
  agents: LightAgentConfigurationType[];
  isAgentConfigurationsLoading: boolean;
  isAgentConfigurationsError: Error | undefined;
  mutate: KeyedMutator<LightAgentConfigurationType[]>;
  mutateRegardlessOfQueryParams: KeyedMutator<LightAgentConfigurationType[]>;
}

export interface UseConversationsResult {
  conversations: ConversationWithoutContentPublicType[];
  isConversationsLoading: boolean;
  isConversationsError: Error | undefined;
  mutateConversations: KeyedMutator<ConversationWithoutContentPublicType[]>;
}

export interface UseConversationResult {
  conversation: ConversationPublicType | null;
  isConversationLoading: boolean;
  conversationError: Error | undefined;
  mutateConversation: KeyedMutator<ConversationPublicType | null>;
}
