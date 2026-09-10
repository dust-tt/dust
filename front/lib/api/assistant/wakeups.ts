import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import type { ConversationRefType } from "@app/types/assistant/conversation";
import type { WakeUpStatus, WakeUpType } from "@app/types/assistant/wakeups";
import { removeNulls } from "@app/types/shared/utils/general";

export interface UserWakeUpWithConversation {
  conversation: ConversationRefType;
  wakeUp: WakeUpType;
}

export interface UserWakeUps {
  totalCount: number;
  wakeUps: UserWakeUpWithConversation[];
}

/**
 * @cc [owner:fabiencelier,label:product;security] only-caller-wake-ups
 * The returned wake-ups MUST all be owned by `auth`'s user and in `status`. A wake-up owned by
 * another member of the workspace MUST never be returned, whatever the caller's role.
 */
/**
 * @cc [owner:fabiencelier,label:product] drop-unreachable-conversations
 * A wake-up whose conversation the caller cannot read (deleted conversation, revoked space access)
 * MUST be omitted from `wakeUps` rather than returned without its conversation. `totalCount` still
 * counts it, so it can exceed the number of returned rows.
 */
export async function listUserWakeUps(
  auth: Authenticator,
  {
    limit,
    offset,
    status,
  }: { limit: number; offset: number; status: WakeUpStatus }
): Promise<UserWakeUps> {
  const { wakeUps, totalCount } = await WakeUpResource.listByUserWithTotalCount(
    auth,
    auth.getNonNullableUser(),
    { limit, offset, status }
  );

  if (wakeUps.length === 0) {
    return { totalCount, wakeUps: [] };
  }

  // `fetchByModelIds` resolves the conversation string ids without permission filtering, so those
  // ids then go through `fetchByIds`, which applies the caller's read permissions.
  const conversations = await ConversationResource.fetchByModelIds(
    auth,
    Array.from(new Set(wakeUps.map((w) => w.conversationId)))
  );
  const conversationIdByModelId = new Map(
    conversations.map((c) => [c.id, c.sId])
  );
  const readableConversations = await ConversationResource.fetchByIds(
    auth,
    conversations.map((c) => c.sId)
  );
  const refByConversationId = new Map(
    readableConversations.map((c) => [c.sId, c.toRefJSON()])
  );

  return {
    totalCount,
    wakeUps: removeNulls(
      wakeUps.map((wakeUp) => {
        const conversationId = conversationIdByModelId.get(
          wakeUp.conversationId
        );
        const conversation = conversationId
          ? refByConversationId.get(conversationId)
          : undefined;

        return conversation ? { conversation, wakeUp: wakeUp.toJSON() } : null;
      })
    ),
  };
}
