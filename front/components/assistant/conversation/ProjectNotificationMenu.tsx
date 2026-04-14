import {
  useProjectNotificationPreference,
  useUpdateProjectNotificationPreference,
} from "@app/lib/swr/spaces";
import { useUserMetadata } from "@app/lib/swr/user";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  isNotificationCondition,
  type NotificationCondition,
} from "@app/types/notification_preferences";
import type { WorkspaceType } from "@app/types/user";
import {
  BellIcon,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "All activity",
  only_mentions: "Only when mentioned",
  never: "Don't notify me",
};

export function ProjectNotificationMenu({
  activeSpaceId,
  owner,
  shouldWaitBeforeFetching,
}: {
  activeSpaceId: string | null;
  owner: WorkspaceType;
  shouldWaitBeforeFetching: boolean;
}) {
  const {
    metadata: defaultNotificationCondition,
    isMetadataLoading: isDefaultNotificationConditionLoading,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition, {
    disabled: shouldWaitBeforeFetching,
  });

  const {
    projectNotificationPreference,
    isProjectNotificationPreferenceLoading,
  } = useProjectNotificationPreference({
    workspaceId: owner.sId,
    spaceId: activeSpaceId,
    disabled: shouldWaitBeforeFetching,
  });

  const isLoading =
    isDefaultNotificationConditionLoading ||
    isProjectNotificationPreferenceLoading;

  const updateNotificationPreference = useUpdateProjectNotificationPreference({
    workspaceId: owner.sId,
    spaceId: activeSpaceId,
  });

  const [selectedNotificationPreference, setSelectedNotificationPreference] =
    useState<NotificationCondition>(() => {
      if (projectNotificationPreference?.preference) {
        return projectNotificationPreference.preference;
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
    if (projectNotificationPreference?.preference) {
      setSelectedNotificationPreference(
        projectNotificationPreference.preference
      );
      return;
    }
    if (
      defaultNotificationCondition?.value &&
      isNotificationCondition(defaultNotificationCondition.value)
    ) {
      setSelectedNotificationPreference(defaultNotificationCondition.value);
      return;
    }
  }, [projectNotificationPreference, defaultNotificationCondition?.value]);

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

  if (!activeSpaceId) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={isLoading || shouldWaitBeforeFetching}
        icon={BellIcon}
        label="Notifications"
      />
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={selectedNotificationPreference}>
            {displayedPreferences.map((preference) => (
              <DropdownMenuRadioItem
                key={preference}
                label={NOTIFICATION_CONDITION_LABELS[preference]}
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
