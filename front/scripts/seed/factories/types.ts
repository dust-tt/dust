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
import type {
  SkillEditorsSuggestionType,
  SkillEditSuggestionType,
  SkillSuggestionSource,
  SkillSuggestionState,
  SkillUserFacingDescriptionSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
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
  // Used as the created user's sId, so other assets (e.g. skill editors suggestions) can
  // reference the user directly.
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

interface BaseSkillSuggestionAsset {
  // Optional key used to reference the created suggestion from other assets (e.g. conversation
  // placeholders). Must be unique within a seed.
  id?: string;
  skillName: string;
  // When true, an existing suggestion with the same kind, source and title is deleted and
  // recreated on re-runs so the seeded data always reflects the asset. Defaults to false.
  overwrite?: boolean;
  title?: string;
  analysis: string | null;
  state: SkillSuggestionState;
  source: SkillSuggestionSource;
  sourceConversationIds?: string[];
}

export interface SkillEditSuggestionAsset extends BaseSkillSuggestionAsset {
  kind: "edit";
  suggestion: SkillEditSuggestionType;
}

export interface SkillEditorsSuggestionAsset extends BaseSkillSuggestionAsset {
  kind: "editors";
  // User sIds; seeded users have the sId of their `UserAsset`.
  suggestion: SkillEditorsSuggestionType;
}

export interface SkillUserFacingDescriptionSuggestionAsset
  extends BaseSkillSuggestionAsset {
  kind: "user_facing_description";
  suggestion: SkillUserFacingDescriptionSuggestionType;
}

export type SkillSuggestionAsset =
  | SkillEditSuggestionAsset
  | SkillEditorsSuggestionAsset
  | SkillUserFacingDescriptionSuggestionAsset;

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
  // When true, an existing conversation with the same sId is deleted and recreated on re-runs so
  // the seeded messages always reflect the asset. Defaults to false (existing is kept).
  overwrite?: boolean;
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

export interface RemoteMCPToolAsset {
  // Used as the remote server's cached name; existing servers are matched on it.
  name: string;
  description: string;
  url: string;
  tools: { name: string; description: string }[];
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
