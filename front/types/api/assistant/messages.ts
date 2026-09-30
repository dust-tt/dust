import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentMessageStatus,
  AgentMessageType,
  LightMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { ContentFragmentType } from "@app/types/content_fragment";

export type PostMessagesResponseBody = {
  message: UserMessageType;
  contentFragments: ContentFragmentType[];
  agentMessages: AgentMessageType[];
};

export interface FetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LightMessageType[];
}

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

/**
 * @swaggerschema PrivateAgentMessageEventsPollResponse (swagger_private_schemas.ts)
 */
export type GetAgentMessageEventsResponseBody = {
  events: string[];
};
