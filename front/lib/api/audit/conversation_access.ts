import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
  isAuditLogsEnabled,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

type AuditableConversation =
  | ConversationResource
  | ConversationWithoutContentType;

type ConversationAccessRelation =
  | "creator"
  | "participant"
  | "non_participant"
  | "unowned";

type ConversationCreatorInfo = {
  creator: { userId: string; email: string } | null;
  relation: ConversationAccessRelation | null;
};

/**
 * @cc [label:audit-logging] conversation-creator-is-first-participant
 * The returned `creator` MUST be the conversation's earliest `ConversationParticipant` by
 * `createdAt`, matching `ConversationResource.isConversationCreator` and the `isCreator` flag
 * served by `lib/api/assistant/participants.ts`. When the conversation has no participant, or
 * the earliest participant's user record can no longer be fetched, `creator` MUST be null and
 * `relation` MUST be `"unowned"` — never a synthesized or placeholder identity.
 */
async function resolveConversationCreator(
  auth: Authenticator,
  conversation: AuditableConversation
): Promise<ConversationCreatorInfo> {
  const actorUser = auth.user();
  const participants = await ConversationResource.listParticipantDetails(
    auth,
    conversation
  );
  const [creatorModelId] = participants.map((p) => p.userId);
  if (creatorModelId === undefined) {
    return { creator: null, relation: actorUser ? "unowned" : null };
  }

  const [creatorUser] = await UserResource.fetchByModelIds([creatorModelId]);
  if (!creatorUser) {
    return { creator: null, relation: actorUser ? "unowned" : null };
  }

  let relation: ConversationAccessRelation | null = null;
  if (actorUser) {
    if (actorUser.id === creatorModelId) {
      relation = "creator";
    } else if (participants.some((p) => p.userId === actorUser.id)) {
      relation = "participant";
    } else {
      relation = "non_participant";
    }
  }

  return {
    creator: { userId: creatorUser.sId, email: creatorUser.email },
    relation,
  };
}

/**
 * @cc [label:audit-logging;performance] conversation-access-audit-is-gated
 * MUST return without issuing any database query when `isAuditLogsEnabled(auth)` is false.
 * This runs on every conversation read, so creator resolution MUST NOT be performed for
 * workspaces that cannot receive audit events.
 */
export async function emitConversationAccessedEvent(
  auth: Authenticator,
  conversation: AuditableConversation
): Promise<void> {
  if (!(await isAuditLogsEnabled(auth))) {
    return;
  }

  const { creator, relation } = await resolveConversationCreator(
    auth,
    conversation
  );

  void emitAuditLogEvent({
    auth,
    action: "conversation.accessed",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("conversation", {
        sId: conversation.sId,
        name: conversation.title ?? "",
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      conversation_id: conversation.sId,
      ...(creator
        ? {
            conversation_creator_id: creator.userId,
            conversation_creator_email: creator.email,
          }
        : {}),
      ...(relation ? { access_relation: relation } : {}),
    },
  });
}
