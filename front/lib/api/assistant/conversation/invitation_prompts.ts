import type { Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { PendingMentionModel } from "@app/lib/models/agent/conversation";
import type {
  ConversationWithoutContentType,
  MessageType,
  UserType,
} from "@app/types";

/**
 * Creates a content fragment that displays an invitation prompt for a pending mention.
 * This prompt is visible to all participants but only actionable by the mentioner.
 *
 * TODO(Phase 3): Implement content fragment creation for invitation prompts.
 * For now, this is a placeholder that will be implemented when we add the frontend UI.
 * The content fragment should include:
 * - pendingMentionId
 * - mentionedUser info (sId, name, username)
 * - mentionerUser info (sId, name)
 * - status: "pending"
 * - messageId
 */
export async function postInvitationPromptContentFragment(
  auth: Authenticator,
  {
    conversation,
    message,
    mentionedUser,
    mentionerUser,
    pendingMentionId,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    message: MessageType;
    mentionedUser: UserType;
    mentionerUser: UserType;
    pendingMentionId: number;
    transaction?: Transaction;
  }
): Promise<void> {
  // Placeholder - will be implemented in Phase 3 with frontend
  // The content fragment creation will be added here
  void auth;
  void conversation;
  void message;
  void mentionedUser;
  void mentionerUser;
  void pendingMentionId;
  void transaction;
}

/**
 * Updates an existing invitation prompt content fragment with a new status.
 *
 * TODO(Phase 3): Implement content fragment update for invitation prompts.
 */
export async function updateInvitationPromptContentFragment(
  auth: Authenticator,
  {
    pendingMentionId,
    status,
    mentionedUser,
  }: {
    pendingMentionId: number;
    status: "accepted" | "declined";
    mentionedUser?: UserType;
  }
): Promise<void> {
  // Placeholder - will be implemented in Phase 3 with frontend
  void auth;
  void pendingMentionId;
  void status;
  void mentionedUser;
}
