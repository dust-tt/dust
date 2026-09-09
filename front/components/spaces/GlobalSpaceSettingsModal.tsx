import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import { getSpaceName } from "@app/lib/spaces";
import { useGroups } from "@app/lib/swr/groups";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import type { GroupType } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

interface GlobalSpaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  space: SpaceType;
}

/**
 * Settings of the company space (the `global` space): its name is fixed and it cannot be deleted,
 * so the only thing to configure is who may write to it. Everyone in the workspace reads it; its
 * members — the people picked here plus the members of the groups picked here — are the ones
 * allowed to modify its content, on top of admins and managers.
 */
export function GlobalSpaceSettingsModal({
  isOpen,
  onClose,
  owner,
  space,
}: GlobalSpaceSettingsModalProps) {
  // The member selection is held as ids, not as user objects: the ids are what the save sends, so
  // a member can never drop out of the space because the UI failed to resolve their user object.
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedGroups, setSelectedGroups] = useState<GroupType[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const doUpdate = useUpdateSpace({ owner });

  // Both hooks are held back while the panel is closed: it stays mounted on the space page, and
  // neither the member list nor the workspace groups are needed until an admin opens it.
  const { spaceInfo, mutateSpaceInfo, isSpaceInfoLoading, isSpaceInfoError } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: space.sId,
      includeAllMembers: true, // Include members whose membership is not active yet.
      disabled: !isOpen,
    });

  const { groups, isGroupsLoading, isGroupsError } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    disabled: !isOpen,
  });

  // A save carries the space's whole membership, both lists at once, so the sheet must not open on
  // half of it: `useSpaceInfo` seeds the selected members and groups, and `useGroups` names the
  // groups that can be picked. Either one still loading and a save would write an empty list.
  const isAccessLoading = isSpaceInfoLoading || isGroupsLoading;

  // Either one failing blocks the save outright, for the same reason: the sheet cannot send a
  // membership it does not know.
  const isAccessUnavailable = !!isSpaceInfoError || isGroupsError;

  // Seeded once per opening: `spaceInfo` is revalidated by SWR while the panel is open, and
  // re-seeding on every revalidation would discard the admin's pending edits.
  const hasSeededRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasSeededRef.current = false;
      return;
    }
    // Nothing is seeded until the space's current access is known: seeding an empty selection from
    // a failed or pending fetch would let a save replace the whole member list with a partial one.
    if (hasSeededRef.current || isAccessLoading || !spaceInfo) {
      return;
    }
    hasSeededRef.current = true;

    setSelectedMemberIds(
      new Set(spaceInfo.members.map((member) => member.sId))
    );
    setSelectedGroups(
      groups.filter((group) => spaceInfo.groupIds.includes(group.sId))
    );
    setIsDirty(false);
  }, [groups, isAccessLoading, isOpen, spaceInfo]);

  const handleClose = useCallback(() => {
    onClose();
    setIsDirty(false);
    setIsSaving(false);
  }, [onClose]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    // Both lists are always sent: the space's members are the manual list plus the members of the
    // groups given access to it, and the request describes the whole membership.
    await doUpdate(space, {
      // The company space is readable by the whole workspace and can never be restricted.
      isRestricted: false,
      memberIds: Array.from(selectedMemberIds),
      groupIds: selectedGroups.map((group) => group.sId),
    });

    await mutateSpaceInfo();
    handleClose();
  }, [
    doUpdate,
    handleClose,
    mutateSpaceInfo,
    selectedGroups,
    selectedMemberIds,
    space,
  ]);

  const spaceName = getSpaceName(space);

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent trapFocusScope={false} size="lg">
        <SheetHeader>
          <SheetTitle>Space Settings - {spaceName}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex w-full flex-col gap-y-4">
            <Page.SectionHeader title="Access" />
            {/* Separate lines rather than one `description`: read access, write access and where
                the members come from are three statements, as in `RestrictedAccessHeader`. */}
            <div className="flex flex-col gap-y-1">
              <span>
                {spaceName} is the space where you upload and connect the data
                the whole company has access to, so anyone in the workspace can
                read this data.
              </span>
              <span>
                Only admins, managers and the people selected here can modify
                the data (upload files, delete documents, connect data
                sources...).
              </span>
              <span>
                They are the people picked below, plus everyone in the groups
                given access to the space.
              </span>
            </div>

            {isAccessLoading ? (
              <div className="flex justify-center p-8">
                <Spinner />
              </div>
            ) : isAccessUnavailable ? (
              <ContentMessage
                variant="warning"
                title="Access settings unavailable"
              >
                Failed to load group members, please reload the page.
              </ContentMessage>
            ) : (
              <RestrictedAccessBody
                owner={owner}
                selectedMemberIds={selectedMemberIds}
                selectedGroups={selectedGroups}
                onMemberIdsUpdated={(memberIds) => {
                  setSelectedMemberIds(memberIds);
                  setIsDirty(true);
                }}
                onGroupsUpdated={(updatedGroups) => {
                  setSelectedGroups(updatedGroups);
                  setIsDirty(true);
                }}
                initialMembers={spaceInfo?.members}
              />
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: isSaving ? "Saving..." : "Save",
            onClick: onSave,
            disabled:
              !isDirty || isSaving || isAccessLoading || isAccessUnavailable,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
