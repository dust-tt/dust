import { ConfirmContext } from "@app/components/Confirm";
import { ManagePodGroupsPanel } from "@app/components/pod/settings/ManagePodGroupsPanel";
import { PodGroupMembersTable } from "@app/components/pod/settings/PodGroupMembersTable";
import { PodMembersTable } from "@app/components/pod/settings/PodMembersTable";
import { usePodConversationsSummary } from "@app/hooks/conversations";
import { spaceMembershipProperties } from "@app/lib/spaces_utils";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ScrollArea,
  SearchInput,
  Separator,
  SliderToggle,
  Tooltip,
  Users01,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useState } from "react";

const OPEN_POD_DISABLED_TOOLTIP =
  "Open Pods are disabled by your workspace admin.";

interface PodSettingsParticipantsTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  onOpenMembersPanel?: () => void;
}

export function PodSettingsParticipantsTab({
  owner,
  pod,
  onOpenMembersPanel,
}: PodSettingsParticipantsTabProps) {
  const isPodEditor = pod.isEditor;
  const { members: podMembers, groups: podGroups } = pod;
  const isOpen = !pod.isRestricted;
  const confirm = useContext(ConfirmContext);

  const areWorkspaceOpenPodsAllowed = areOpenPodsAllowed(owner);
  const isPrivatePodAndOpenPodsDisallowed =
    !areWorkspaceOpenPodsAllowed && !isOpen;
  const isVisibilityToggleDisabled =
    !isPodEditor || isPrivatePodAndOpenPodsDisallowed;

  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState(false);

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
        ...spaceMembershipProperties(pod),
        name: pod.name,
      },
      {
        title: "Successfully updated Pod visibility",
        description: `Pod is now ${newIsOpen ? "open" : "restricted"}.`,
      }
    );

    if (updated) {
      await mutatePodInfo();
      void mutateSpaceSummary();
    }
  }, [confirm, doUpdate, isOpen, pod, mutatePodInfo, mutateSpaceSummary]);

  return (
    <>
      {/* Visibility */}
      <div className="flex w-full items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="heading-lg">Open to everyone</div>
          <div className="text-sm text-muted-foreground">
            Anyone in the workspace can find and join the Pod.
          </div>
        </div>
        {isVisibilityToggleDisabled ? (
          <Tooltip
            label={OPEN_POD_DISABLED_TOOLTIP}
            trigger={
              <div>
                <SliderToggle
                  selected={isOpen}
                  onClick={handleVisibilityToggle}
                  disabled
                />
              </div>
            }
          />
        ) : (
          <SliderToggle
            selected={isOpen}
            onClick={handleVisibilityToggle}
            disabled={isVisibilityToggleDisabled}
          />
        )}
      </div>

      <Separator />

      {/* Individual members */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Individual members</h3>
          {isPodEditor && onOpenMembersPanel && (
            <Button
              label="Manage"
              variant="outline"
              icon={Users01}
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

      {/* Group members */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Group members</h3>
          {isPodEditor && (
            <Button
              label="Manage"
              variant="outline"
              icon={Users01}
              onClick={() => setIsGroupsPanelOpen(true)}
            />
          )}
        </div>
        {podGroups.length > 0 && (
          <ScrollArea className="h-full" orientation="horizontal">
            <PodGroupMembersTable
              owner={owner}
              pod={pod}
              groups={podGroups}
              isEditor={isPodEditor}
              mutatePodInfo={() => mutatePodInfo()}
            />
          </ScrollArea>
        )}
      </div>

      <ManagePodGroupsPanel
        isOpen={isGroupsPanelOpen}
        setIsOpen={setIsGroupsPanelOpen}
        owner={owner}
        pod={pod}
        onSuccess={() => mutatePodInfo()}
      />
    </>
  );
}
