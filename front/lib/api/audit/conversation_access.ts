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
  | "no_creator";

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
 * `relation` MUST be `"no_creator"` — never a synthesized or placeholder identity.
 */
async function resolveConversationCreator(
  auth: Authenticator,
  conversation: AuditableConversation
): Promise<ConversationCreatorInfo> {
  const actorUser = auth.user();
  const creatorModelId = await ConversationResource.fetchFirstParticipantUserId(
    auth,
    conversation
  );
  if (creatorModelId === null) {
    return { creator: null, relation: "no_creator" };
  }

  const [creatorUser] = await UserResource.fetchByModelIds([creatorModelId]);
  if (!creatorUser) {
    return { creator: null, relation: "no_creator" };
  }

  let relation: ConversationAccessRelation | null = null;
  if (actorUser) {
    if (actorUser.id === creatorModelId) {
      relation = "creator";
    } else if (
      await ConversationResource.isConversationParticipant(auth, {
        conversation,
        user: actorUser.toJSON(),
      })
    ) {
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
 * When `isAuditLogsEnabled(auth)` is false, MUST return without performing creator resolution
 * (no conversation-participant or user lookups for this emit). `isAuditLogsEnabled` itself may
 * consult feature flags / plan state; that enablement check is allowed. This runs on every
 * conversation read, so the expensive creator path MUST NOT run for workspaces that cannot
 * receive audit events.
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

  const metadata: Record<string, string> = {
    conversation_id: conversation.sId,
  };
  if (creator) {
    metadata.conversation_creator_id = creator.userId;
    metadata.conversation_creator_email = creator.email;
  }
  if (relation) {
    metadata.access_relation = relation;
  }

  return emitAuditLogEvent({
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
    metadata,
  });
}
