import { ConfirmContext } from "@app/components/Confirm";
import { DeletePodDialog } from "@app/components/pod/settings/DeletePodDialog";
import { PodMembersTable } from "@app/components/pod/settings/PodMembersTable";
import { PodSettingsOptionLabel } from "@app/components/pod/settings/PodSettingsOptionLabel";
import { SuggestedTasksGenerationTile } from "@app/components/pod/settings/SuggestedTasksGenerationTile";
import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useArchivePod } from "@app/hooks/useArchivePod";
import {
  useCheckPodName,
  usePodMetadata,
  useUpdatePodMetadata,
} from "@app/lib/swr/pods";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { PatchPodMetadataBodyType } from "@app/types/api/internal/spaces";
import { PatchPodMetadataBodySchema } from "@app/types/api/internal/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArchiveIcon,
  Button,
  ContentMessage,
  Globe01V2,
  Input,
  ScrollArea,
  SearchInput,
  SliderToggle,
  TextArea,
  Tooltip,
  Upload01V2,
  Users01V2,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useContext, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

interface PodSettingsTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  onOpenMembersPanel?: () => void;
}

const OPEN_POD_DISABLED_TOOLTIP =
  "Open Pods are disabled by your workspace admin.";

export function PodSettingsTab({
  owner,
  pod: pod,
  onOpenMembersPanel,
}: PodSettingsTabProps) {
  const { members: podMembers, isEditor: isPodEditor, isRestricted } = pod;
  const isOpen = !isRestricted;
  const areWorkspaceOpenPodsAllowed = areOpenPodsAllowed(owner);
  const isPrivatePodAndOpenPodsDisallowed =
    !areWorkspaceOpenPodsAllowed && !isOpen;
  const isVisibilityToggleDisabled =
    !isPodEditor || isPrivatePodAndOpenPodsDisallowed;
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");

  const confirm = useContext(ConfirmContext);

  const { podMetadata, isPodMetadataLoading } = usePodMetadata({
    workspaceId: owner.sId,
    podId: pod.sId,
  });
  const doUpdateMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
  });

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
  const [podDescription, setPodDescription] = useState(
    podMetadata?.description ?? ""
  );
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  const form = useForm<PatchPodMetadataBodyType>({
    resolver: zodResolver(PatchPodMetadataBodySchema),
    defaultValues: {},
  });

  // Sync form with loaded metadata
  useEffect(() => {
    if (podMetadata) {
      form.reset({});
      setPodDescription(podMetadata.description ?? "");
    }
  }, [podMetadata, form]);

  const doUpdate = useUpdateSpace({ owner });
  const { mutateSpaceInfoRegardlessOfQueryParams: mutatePodInfo } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: pod.sId,
    });
  const { mutate: mutateSpaceSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
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
        isRestricted,
        memberIds: podMembers.filter((m) => !m.isEditor).map((m) => m.sId),
        editorIds: podMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: newPodName,
      },
      {
        title: "Successfully updated Pod name",
        description: "Pod name was successfully updated.",
      }
    );

    if (updated) {
      await mutatePodInfo();
      void mutateSpaceSummary();
      setIsEditingName(false);
    }
  };

  const onSaveDescription = async () => {
    await doUpdateMetadata({ description: podDescription });
    setIsEditingDescription(false);
  };

  const { archivePod, unarchivePod } = useArchivePod({
    owner,
    podId: pod.sId,
  });

  const handleArchiveToggle = useCallback(async () => {
    if (podMetadata?.archivedAt) {
      await unarchivePod();
    } else {
      await archivePod();
    }
  }, [archivePod, unarchivePod, podMetadata?.archivedAt]);

  const handleVisibilityToggle = useCallback(async () => {
    const newIsOpen = !isOpen;
    const title = newIsOpen ? "Switch to open?" : "Switch to restricted?";
    const message = newIsOpen
      ? "All workspace members will be able to join and see everything in the Pod — including existing conversations and files."
      : "Access will be limited to invited members only.";

    const confirmed = await confirm({
      title,
      message,
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const updated = await doUpdate(
      pod,
      {
        isRestricted: !newIsOpen,
        memberIds: podMembers.filter((m) => !m.isEditor).map((m) => m.sId),
        editorIds: podMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: pod.name,
      },
      {
        title: "Successfully updated Pod visibility",
        description: `Pod is now ${newIsOpen ? "open" : "restricted"}.`,
      }
    );

    if (updated) {
      await mutatePodInfo();
    }
  }, [confirm, doUpdate, isOpen, podMembers, pod, mutatePodInfo]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-8">
        {pod.archivedAt && (
          <ContentMessage variant="info" size="lg">
            This Pod has been archived.
          </ContentMessage>
        )}
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
        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Description</div>
          <div className="flex w-full min-w-0 flex-col gap-2">
            <TextArea
              value={podDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setPodDescription(e.target.value);
                setIsEditingDescription(
                  e.target.value !== podMetadata?.description
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
                  onClick={onSaveDescription}
                />
                <Button
                  label="Cancel"
                  variant="outline"
                  onClick={() => {
                    setPodDescription(podMetadata?.description ?? "");
                    setIsEditingDescription(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col border-y border-border">
            <div className="flex items-center justify-between gap-4 py-4">
              <PodSettingsOptionLabel
                icon={Globe01V2}
                title="Open to everyone"
                description="Anyone in the workspace can find and join the Pod."
              />
              <div className="flex shrink-0 items-center gap-2">
                {isVisibilityToggleDisabled ? (
                  <Tooltip
                    label={OPEN_POD_DISABLED_TOOLTIP}
                    trigger={
                      <div>
                        <SliderToggle
                          size="xs"
                          selected={isOpen}
                          onClick={handleVisibilityToggle}
                          disabled
                        />
                      </div>
                    }
                  />
                ) : (
                  <SliderToggle
                    size="xs"
                    selected={isOpen}
                    onClick={handleVisibilityToggle}
                    disabled={isVisibilityToggleDisabled}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-border py-4">
              <SuggestedTasksGenerationTile owner={owner} pod={pod} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="heading-lg flex-1">Members</h3>
            {isPodEditor && onOpenMembersPanel && (
              <Button
                label="Manage"
                variant="outline"
                icon={Users01V2}
                onClick={onOpenMembersPanel}
              />
            )}
          </div>
          {podMembers.length > 0 && (
            <>
              <SearchInput
                name="search"
                placeholder="Search (email)"
                value={searchSelectedMembers}
                onChange={setSearchSelectedMembers}
              />
              <ScrollArea className="h-full" orientation="horizontal">
                <PodMembersTable
                  owner={owner}
                  pod={pod}
                  selectedMembers={podMembers}
                  searchSelectedMembers={searchSelectedMembers}
                  isEditor={isPodEditor}
                  mutatePodInfo={() => mutatePodInfo()}
                />
              </ScrollArea>
            </>
          )}
        </div>

        {isPodEditor && (
          <div className="flex w-full flex-col gap-3 border-t border-border pt-8 dark:border-border-night">
            <h3 className="heading-lg">Danger Zone</h3>
            <h4 className="heading-base">Archive</h4>
            {podMetadata?.archivedAt ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground dark:text-foreground-night">
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
                  icon={Upload01V2}
                  variant="outline"
                  label="Unarchive"
                  onClick={handleArchiveToggle}
                  className="w-fit"
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  This Pod will be removed from the sidebar. Its data stays
                  intact and can still be used as a data source.
                </p>
                <Button
                  icon={ArchiveIcon}
                  variant="warning-secondary"
                  label="Archive"
                  onClick={handleArchiveToggle}
                  className="w-fit"
                />
              </>
            )}
            <h4 className="heading-base">Delete</h4>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              This permanently removes all content—conversations, folders,
              websites, and data sources. Agents using this Pod's tools will be
              impacted. This cannot be undone.
            </p>
            <DeletePodDialog owner={owner} pod={pod} />
          </div>
        )}
      </div>
    </div>
  );
}
