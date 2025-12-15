/**
 * Centralized mention types and utilities.
 *
 * This module provides a unified type system for handling mentions across
 * the application, including API formats, UI representations, and type guards.
 */

import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";

/**
 * Base mention structure used in API requests and database storage.
 * This is the minimal representation of an agent mention.
 */
export type AgentMention = {
  // TODO(mentions v2) add a type here
  configurationId: string;
};

/**
 * User mention type for future support of mentioning users in conversations.
 */
export type UserMention = {
  type: "user";
  userId: string;
};

/**
 * Union type of all supported mention types.
 * Agent mentions are always supported.
 * User mentions are supported when the mentions_v2 feature flag is enabled.
 */
export type MentionType = AgentMention | UserMention;

/**
 * Rich mention type with full display metadata.
 * Used in UI components and the editor where we need display information.
 */
export interface RichMention {
  id: string; // configurationId for agents, userId for users
  type: "agent" | "user";
  label: string; // Display name
  pictureUrl: string;
  description: string;
  userFavorite?: boolean;
}

/**
 * Agent-specific rich mention with additional metadata.
 */
export interface RichAgentMention extends RichMention {
  type: "agent";
  userFavorite?: boolean;
}

export interface RichAgentMentionInConversation extends RichAgentMention {
  isParticipant?: boolean;
}

/**
 * User-specific rich mention.
 */
export interface RichUserMention extends RichMention {
  type: "user";
}

export interface RichUserMentionInConversation extends RichUserMention {
  isParticipant?: boolean;
}

/**
 * Type guard to check if a mention is an agent mention.
 */
export function isAgentMention(mention: MentionType): mention is AgentMention {
  return (mention as AgentMention).configurationId !== undefined;
}

/**
 * Type guard to check if a rich mention is an agent mention.
 */
export function isRichAgentMention(
  mention: RichMention
): mention is RichAgentMention {
  return mention.type === "agent";
}

/**
 * Type guard to check if a mention is a user mention.
 */
export function isUserMention(mention: MentionType): mention is UserMention {
  return (
    mention &&
    "type" in mention &&
    mention.type === "user" &&
    "userId" in mention &&
    mention.userId !== undefined
  );
}

/**
 * Type guard to check if a rich mention is a user mention.
 */
export function isRichUserMention(
  mention: RichMention
): mention is RichUserMention {
  return mention.type === "user";
}

/**
 * Converts a rich mention to the API MentionType format.
 * Used when sending data to the API.
 */
export function toMentionType(rich: RichMention): MentionType {
  switch (rich.type) {
    case "agent": {
      return {
        configurationId: rich.id,
      } satisfies AgentMention;
    }
    case "user": {
      return {
        type: "user",
        userId: rich.id,
      } satisfies UserMention;
    }
    default:
      assertNever(rich.type);
  }
}

export function toRichAgentMentionType(
  agentConfiguration: LightAgentConfigurationType
): RichAgentMention {
  return {
    id: agentConfiguration.sId,
    type: "agent",
    label: agentConfiguration.name,
    pictureUrl: agentConfiguration.pictureUrl,
    description: agentConfiguration.description,
    userFavorite: agentConfiguration.userFavorite,
  };
}

export function toRichUserMentionType(user: UserType): RichUserMention {
  return {
    id: user.sId,
    type: "user",
    label: user.fullName,
    pictureUrl: user.image ?? "/static/humanavatar/anonymous.png",
    description: user.email,
  };
}

/**
 * Converts an API MentionType to a rich mention with display metadata.
 * Requires additional metadata to be provided.
 */
export function toRichMention(
  mention: MentionType,
  metadata: {
    label: string;
    pictureUrl: string;
    description: string;
    userFavorite?: boolean;
  }
): RichMention {
  if (isAgentMention(mention)) {
    return {
      id: mention.configurationId,
      type: "agent",
      label: metadata.label,
      pictureUrl: metadata.pictureUrl,
      description: metadata.description,
      userFavorite: metadata.userFavorite,
    } satisfies RichAgentMention;
  }

  if (isUserMention(mention)) {
    return {
      id: mention.userId,
      type: "user",
      label: metadata.label,
      pictureUrl: metadata.pictureUrl,
      description: metadata.description,
    } satisfies RichUserMention;
  }

  throw new Error("Unsupported mention type");
}
