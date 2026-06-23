import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentMessageStatus,
  AgentMessageType,
  LegacyLightMessageType,
  LightMessageType,
  MessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { ContentFragmentType } from "@app/types/content_fragment";

export type PostMessagesResponseBody = {
  message: UserMessageType;
  contentFragments: ContentFragmentType[];
  agentMessages: AgentMessageType[];
};

// TODO remove after monday 2025-12-01 (once everyone has likely reloaded their browser)
export interface LegacyFetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LegacyLightMessageType[];
}

export interface FetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LightMessageType[];
}

export type FetchConversationMessageResponse = {
  message: MessageType;
};

export type FetchConversationMessageResponseLight = {
  message: LightMessageType;
};

export type FetchConversationMessageActionResponse = {
  action: AgentMCPActionWithOutputType;
  messageStatus: AgentMessageStatus;
};

export type GetAgentMessageSkillsResponseBody = {
  skills: SkillType[];
};
