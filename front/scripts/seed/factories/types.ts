import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import type { AgentSuggestionData } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";

// Seed context shared across all seed functions
export interface SeedContext {
  auth: Authenticator;
  workspace: LightWorkspaceType;
  user: UserResource;
  execute: boolean;
  logger: Logger;
}

export interface AgentAsset {
  name: string;
  description: string;
  instructions: string;
  pictureUrl: string;
  sharedWithAdditionalUsers?: boolean;
}

export interface UserAsset {
  sId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SkillAsset {
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string;
}

export interface SuggestedSkillAsset {
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string;
}

export interface MessageAsset {
  sId: string;
  content: string;
}

export interface Exchange {
  user: MessageAsset;
  agent: MessageAsset;
}

export interface ConversationAsset {
  sId: string;
  title: string;
  agentName?: string;
  userSId?: string;
  exchanges: Exchange[];
}

export interface ConversationsAsset {
  customAgentConversations: ConversationAsset[];
  dustAgentConversations: ConversationAsset[];
}

export interface FeedbackAsset {
  conversationSId: string;
  agentMessageSId: string;
  thumbDirection: "up" | "down";
  content: string | null;
}

export interface CreatedAgent {
  sId: string;
  name: string;
}

export interface SeedSpaceResult {
  restrictedSpace: SpaceResource | undefined;
}

export type SuggestionAsset = AgentSuggestionData & {
  agentName: string;
  analysis: string | null;
};

export interface DataSourceDocumentAsset {
  id: string;
  title: string;
  content: string;
}

export interface DataSourceAsset {
  name: string;
  description: string;
  documents: DataSourceDocumentAsset[];
}

export interface TemplateAsset {
  handle: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  emoji: string;
  backgroundColor: string;
  visibility: "draft" | "published" | "disabled";
  tags: TemplateTagCodeType[];
  presetInstructions?: string;
  copilotInstructions?: string;
}
