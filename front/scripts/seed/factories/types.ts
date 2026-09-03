import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
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
  responseFormat?: string;
  // Defaults to "visible" (published). "hidden" makes the agent visible to its editors only.
  scope?: Exclude<AgentConfigurationScope, "global">;
  // Either a predefined model (resolved to a concrete model at message time) or a pinned model.
  // Defaults to "standard".
  model?: AgentAssetModel;
}

export type AgentAssetModel =
  | "basic"
  | "standard"
  | "premium"
  | { providerId: ModelProviderIdType; modelId: ModelIdType };

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
  instructionsHtml: string;
  // Defaults to DEFAULT_SKILL_AVAILABILITY ("editors", i.e. unpublished).
  availability?: SkillAvailability;
}

export interface SkillSuggestionAsset {
  skillName: string;
  kind: "edit";
  title?: string;
  analysis: string | null;
  state: "pending" | "approved" | "rejected" | "outdated";
  source: "reinforcement" | "synthetic";
  sourceConversationIds?: string[];
  suggestion: {
    instructionEdits?: {
      targetBlockId: string;
      content: string;
      type: "replace";
    }[];
  };
}

export interface SuggestedSkillAsset {
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string;
}

interface MessageAsset {
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
  userId: string;
  exchanges: Exchange[];
}

export interface FeedbackAsset {
  conversationId: string;
  agentMessageId: string;
  thumbDirection: "up" | "down";
  content: string | null;
}

export interface CreatedAgent {
  sId: string;
  name: string;
}

export interface CreatedTrigger {
  sId: string;
  name: string;
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
  sidekickInstructions?: string;
}
