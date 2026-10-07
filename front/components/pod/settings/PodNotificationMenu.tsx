import {
  usePodNotificationPreference,
  useUpdatePodNotificationPreference,
} from "@app/lib/swr/pods";
import { useUserMetadata } from "@app/lib/swr/user";
import type { NotificationCondition } from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  isNotificationCondition,
} from "@app/types/notification_preferences";
import type { WorkspaceType } from "@app/types/user";
import {
  Bell01,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

const NOTIFICATION_CONDITION_LABELS: Record<
  NotificationCondition,
  MessageDescriptor
> = {
  all_messages: msg`All activity`,
  only_mentions: msg`Only when mentioned`,
  never: msg`Don't notify me`,
};

interface PodNotificationMenuProps {
  activePodId: string | null;
  owner: WorkspaceType;
  shouldWaitBeforeFetching: boolean;
}

export function PodNotificationMenu({
  activePodId,
  owner,
  shouldWaitBeforeFetching,
}: PodNotificationMenuProps) {
  const { t } = useLingui();
  const {
    metadata: defaultNotificationCondition,
    isMetadataLoading: isDefaultNotificationConditionLoading,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition, {
    disabled: shouldWaitBeforeFetching,
  });

  const { podNotificationPreference, isPodNotificationPreferenceLoading } =
    usePodNotificationPreference({
      workspaceId: owner.sId,
      podId: activePodId,
      disabled: shouldWaitBeforeFetching,
    });

  const isLoading =
    isDefaultNotificationConditionLoading || isPodNotificationPreferenceLoading;

  const updateNotificationPreference = useUpdatePodNotificationPreference({
    workspaceId: owner.sId,
    podId: activePodId,
  });

  const [selectedNotificationPreference, setSelectedNotificationPreference] =
    useState<NotificationCondition>(() => {
      if (podNotificationPreference?.preference) {
        return podNotificationPreference.preference;
      }
      if (
        defaultNotificationCondition?.value &&
        isNotificationCondition(defaultNotificationCondition.value)
      ) {
        return defaultNotificationCondition.value;
      }
      return DEFAULT_NOTIFICATION_CONDITION;
    });

  useEffect(() => {
    if (podNotificationPreference?.preference) {
      setSelectedNotificationPreference(podNotificationPreference.preference);
      return;
    }
    if (
      defaultNotificationCondition?.value &&
      isNotificationCondition(defaultNotificationCondition.value)
    ) {
      setSelectedNotificationPreference(defaultNotificationCondition.value);
      return;
    }
  }, [podNotificationPreference, defaultNotificationCondition?.value]);

  const handleNotificationPreferenceChange = (
    preference: NotificationCondition
  ) => {
    setSelectedNotificationPreference(preference);
    void updateNotificationPreference(preference);
  };

  const displayedPreferences: NotificationCondition[] = [
    "never",
    "only_mentions",
    "all_messages",
  ];

  if (!activePodId) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={isLoading || shouldWaitBeforeFetching}
        icon={Bell01}
        label={t`Notifications`}
      />
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={selectedNotificationPreference}>
            {displayedPreferences.map((preference) => (
              <DropdownMenuRadioItem
                key={preference}
                label={t(NOTIFICATION_CONDITION_LABELS[preference])}
                value={preference}
                onClick={() => handleNotificationPreferenceChange(preference)}
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
