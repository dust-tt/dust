import { ConfirmContext } from "@app/components/Confirm";
import { DeletePodDialog } from "@app/components/pod/settings/DeletePodDialog";
import { useArchivePod } from "@app/hooks/useArchivePod";
import { spaceMembershipProperties } from "@app/lib/spaces_utils";
import {
  useCheckPodName,
  usePodMetadata,
  usePodNotificationPreference,
  useUpdatePodMetadata,
  useUpdatePodNotificationPreference,
} from "@app/lib/swr/pods";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import { useUserMetadata } from "@app/lib/swr/user";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { NotificationCondition } from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  isNotificationCondition,
} from "@app/types/notification_preferences";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Archive,
  Button,
  Input,
  RadioGroup,
  RadioGroupItem,
  Separator,
  TextArea,
  Upload01,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useEffect, useState } from "react";

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "All activity",
  only_mentions: "Only when mentioned",
  never: "Don't notify me",
};

const DISPLAYED_NOTIFICATION_PREFERENCES: NotificationCondition[] = [
  "all_messages",
  "only_mentions",
  "never",
];

interface PodSettingsGeneralTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function PodSettingsGeneralTab({
  owner,
  pod,
}: PodSettingsGeneralTabProps) {
  const isPodEditor = pod.isEditor;
  const confirm = useContext(ConfirmContext);

  // Name state
  const [podName, setPodName] = useState(pod.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const {
    isNameAvailable,
    isChecking: isCheckingName,
    setValue: setNameToCheck,
  } = useCheckPodName({
    owner,
    whitelistedName: pod.name,
  });
  const nameNotAvailable =
    podName.trim().length > 0 && !isCheckingName && !isNameAvailable;

  // Description state
  const { podMetadata, isPodMetadataLoading } = usePodMetadata({
    workspaceId: owner.sId,
    podId: pod.sId,
  });
  const [podDescription, setPodDescription] = useState(
    podMetadata?.description ?? ""
  );
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const doUpdateMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
  });

  // Sync description with loaded metadata
  useEffect(() => {
    if (podMetadata) {
      setPodDescription(podMetadata.description ?? "");
    }
  }, [podMetadata]);

  // Notifications state
  const {
    metadata: defaultNotificationCondition,
    isMetadataLoading: isDefaultNotificationConditionLoading,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition);

  const { podNotificationPreference, isPodNotificationPreferenceLoading } =
    usePodNotificationPreference({
      workspaceId: owner.sId,
      podId: pod.sId,
    });

  const updateNotificationPreference = useUpdatePodNotificationPreference({
    workspaceId: owner.sId,
    podId: pod.sId,
  });

  const [notificationCondition, setNotificationCondition] =
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
      setNotificationCondition(podNotificationPreference.preference);
      return;
    }
    if (
      defaultNotificationCondition?.value &&
      isNotificationCondition(defaultNotificationCondition.value)
    ) {
      setNotificationCondition(defaultNotificationCondition.value);
      return;
    }
  }, [podNotificationPreference, defaultNotificationCondition?.value]);

  const isNotificationLoading =
    isDefaultNotificationConditionLoading || isPodNotificationPreferenceLoading;

  // Archive/delete state
  const { archivePod, unarchivePod } = useArchivePod({
    owner,
    podId: pod.sId,
  });

  // Update functions
  const doUpdate = useUpdateSpace({ owner });
  const { mutateSpaceInfoRegardlessOfQueryParams: mutatePodInfo } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: pod.sId,
    });

  const onSaveName = async () => {
    const newPodName = podName.trim();
    if (!newPodName || newPodName === pod.name.trim()) {
      return;
    }
    const confirmed = await confirm({
      title: "Update Pod name?",
      message: `The Pod name will be changed to "${newPodName}".`,
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const updated = await doUpdate(
      pod,
      {
        isRestricted: pod.isRestricted,
        ...spaceMembershipProperties(pod),
        name: newPodName,
      },
      {
        title: "Successfully updated Pod name",
        description: "Pod name was successfully updated.",
      }
    );

    if (updated) {
      await mutatePodInfo();
      setIsEditingName(false);
    }
  };

  const onSaveDescription = async () => {
    setIsSavingDescription(true);
    try {
      await doUpdateMetadata({ description: podDescription });
      setIsEditingDescription(false);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleArchiveToggle = useCallback(async () => {
    if (podMetadata?.archivedAt) {
      await unarchivePod();
    } else {
      await archivePod();
    }
  }, [archivePod, unarchivePod, podMetadata?.archivedAt]);

  const handleNotificationConditionChange = (
    condition: NotificationCondition
  ) => {
    setNotificationCondition(condition);
    void updateNotificationPreference(condition);
  };

  return (
    <>
      {/* Name */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Name</div>
        <div className="flex w-full min-w-0 gap-2">
          <Input
            value={podName}
            disabled={!isPodEditor}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setPodName(e.target.value);
              setNameToCheck(e.target.value);
              setIsEditingName(e.target.value.trim() !== pod.name.trim());
            }}
            placeholder="Enter Pod name"
            containerClassName="flex-1"
          />
          {isEditingName && (
            <>
              <Button
                label="Save"
                variant="highlight"
                onClick={onSaveName}
                disabled={nameNotAvailable || isCheckingName}
              />
              <Button
                label="Cancel"
                variant="outline"
                onClick={() => {
                  setPodName(pod.name);
                  setNameToCheck("");
                  setIsEditingName(false);
                }}
              />
            </>
          )}
        </div>
        {isEditingName && nameNotAvailable && (
          <div className="text-xs text-warning-500">
            A Pod or space with this name already exists.
          </div>
        )}
      </div>

      {/* Description */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Description</div>
        <div className="flex w-full min-w-0 flex-col gap-2">
          <TextArea
            value={podDescription}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setPodDescription(e.target.value);
              setIsEditingDescription(
                e.target.value !== (podMetadata?.description ?? "")
              );
            }}
            placeholder={
              isPodMetadataLoading
                ? "Loading..."
                : "Describe what this Pod is about..."
            }
            disabled={isPodMetadataLoading || !isPodEditor}
            minRows={3}
            resize="vertical"
            className="flex-1"
          />
          {isEditingDescription && (
            <div className="flex gap-2">
              <Button
                label="Save"
                variant="highlight"
                isLoading={isSavingDescription}
                onClick={() => void onSaveDescription()}
              />
              <Button
                label="Cancel"
                variant="outline"
                disabled={isSavingDescription}
                onClick={() => {
                  setPodDescription(podMetadata?.description ?? "");
                  setIsEditingDescription(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Notifications */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Notifications</div>
        <p className="text-sm text-muted-foreground">
          How you get notified about activity in this Pod. Also available from
          the Pod menu.
        </p>
        <RadioGroup
          value={notificationCondition}
          onValueChange={(value: string) =>
            handleNotificationConditionChange(value as NotificationCondition)
          }
          disabled={isNotificationLoading}
          className="pt-1"
        >
          {DISPLAYED_NOTIFICATION_PREFERENCES.map((preference) => (
            <RadioGroupItem
              key={preference}
              id={`pod-notifications-${preference}`}
              value={preference}
              label={NOTIFICATION_CONDITION_LABELS[preference]}
            />
          ))}
        </RadioGroup>
      </div>

      {/* Archive and delete */}
      {isPodEditor && (
        <div className="flex w-full flex-col gap-3 border-t border-border pt-8">
          <h3 className="heading-lg">Archive and delete</h3>
          <h4 className="heading-base">Archive</h4>
          {podMetadata?.archivedAt ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">
                Archived on{" "}
                <span className="font-medium">
                  {formatTimestampToFriendlyDate(
                    podMetadata.archivedAt,
                    "short"
                  )}
                </span>
                .
              </p>
              <Button
                icon={Upload01}
                variant="outline"
                label="Unarchive"
                onClick={handleArchiveToggle}
                className="w-fit"
              />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                This Pod is removed from your sidebar. Its content stays intact
                and agents can still use it as a data source. You can restore it
                at any time.
              </p>
              <Button
                icon={Archive}
                variant="warning"
                label="Archive"
                onClick={handleArchiveToggle}
                className="w-fit"
              />
            </>
          )}
          <h4 className="heading-base">Delete</h4>
          <p className="text-sm text-muted-foreground">
            Deleting removes all content in this Pod: conversations, folders,
            websites, and data sources. Agents that use its tools will stop
            working. This cannot be undone.
          </p>
          <div className="flex w-full flex-col items-start">
            <DeletePodDialog owner={owner} pod={pod} />
          </div>
        </div>
      )}
    </>
  );
}
