import { useConversationParticipants } from "@app/hooks/conversations";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useUserMemory } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { Icon, InfoCircle, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface ConversationMemoryNoticeProps {
  owner: LightWorkspaceType;
  conversationId: string;
}

// Agents get no user memory once a conversation has more than one participant: it is redacted so it
// is not disclosed to the other users.
export function ConversationMemoryNotice({
  owner,
  conversationId,
}: ConversationMemoryNoticeProps) {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();
  const hasUserMemory = hasFeature("user_memory");
  const { isMemoryEnabled } = useUserMemory({
    owner,
    disabled: !hasUserMemory,
  });
  const { conversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: !hasUserMemory || !isMemoryEnabled },
  });

  if (
    !hasUserMemory ||
    !isMemoryEnabled ||
    !conversationParticipants ||
    conversationParticipants.users.length <= 1
  ) {
    return null;
  }

  return (
    <Tooltip
      label={t`Agents don't use your memory in this conversation because other people are in it.`}
      trigger={
        <span className="flex items-center">
          <Icon
            visual={InfoCircle}
            size="sm"
            className="text-muted-foreground"
          />
          <span className="sr-only">{t`Memory off`}</span>
        </span>
      }
    />
  );
}
