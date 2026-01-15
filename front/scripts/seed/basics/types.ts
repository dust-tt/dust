import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types";

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
}

export interface SkillAsset {
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
  exchanges: Exchange[];
}

export interface ConversationsAsset {
  customAgentConversations: ConversationAsset[];
  dustAgentConversations: ConversationAsset[];
}

export interface Assets {
  agent: AgentAsset;
  skill: SkillAsset;
  conversations: ConversationsAsset;
}

export interface SeedSpaceResult {
  restrictedSpace: SpaceResource | undefined;
}
