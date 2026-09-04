import { ConfirmContext } from "@app/components/Confirm";
import { ConfirmDeleteSpaceDialog } from "@app/components/spaces/ConfirmDeleteSpaceDialog";
import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import { RestrictedAccessHeader } from "@app/components/spaces/RestrictedAccessHeader";
import { useAuth } from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import { useAppRouter } from "@app/lib/platform";
import { useGroups } from "@app/lib/swr/groups";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaceInfo,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import type { SpaceCategoryInfo } from "@app/types/api/spaces";
import type { GroupType } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { PlanType } from "@app/types/plan";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Input,
  Page,
  Separator,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type MembersManagementType = "manual" | "group";

interface CreateOrEditSpaceModalProps {
  defaultRestricted?: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (space: SpaceType) => void;
  owner: LightWorkspaceType;
  space?: SpaceType;
  plan: PlanType;
}

export function CreateOrEditSpaceModal({
  defaultRestricted,
  isAdmin,
  isOpen,
  onClose,
  onCreated,
  owner,
  space,
  plan,
}: CreateOrEditSpaceModalProps) {
  const confirm = React.useContext(ConfirmContext);
  const [spaceName, setSpaceName] = useState<string>(space?.name ?? "");
  // The member selection is held as ids, not as user objects: the ids are what the save sends, so
  // a member can never drop out of the space because the UI failed to resolve their user object.
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedGroups, setSelectedGroups] = useState<GroupType[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [managementType, setManagementType] =
    useState<MembersManagementType>("manual");
  const [isDirty, setIsDirty] = useState(false);

  const scimEnabled = isSCIMEnabled(plan);
  const { user } = useAuth();

  useEffect(() => {
    if (!scimEnabled) {
      setManagementType("manual");
    }
  }, [scimEnabled]);

  const doCreate = useCreateSpace({ owner });
  const doUpdate = useUpdateSpace({ owner });
  const doDelete = useDeleteSpace({ owner, force: true });

  const router = useAppRouter();

  const { spaceInfo, mutateSpaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space?.sId ?? null,
    includeAllMembers: true, // Include members whose membership is not active yet.
  });

  const { groups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    disabled: !scimEnabled,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (isOpen) {
      const spaceMembers = spaceInfo?.members ?? null;

      // Initialize management type from space data (if editing) or default to manual for new spaces
      if (spaceInfo?.managementMode !== undefined) {
        setManagementType(spaceInfo.managementMode);
      } else {
        setManagementType("manual");
      }

      // Initialize selected groups based on space's groupIds (only if workos feature is enabled)
      if (
        scimEnabled &&
        spaceInfo?.groupIds &&
        spaceInfo.groupIds.length > 0 &&
        groups
      ) {
        const spaceGroups = groups.filter((group) =>
          spaceInfo.groupIds.includes(group.sId)
        );
        setSelectedGroups(spaceGroups);
      } else {
        setSelectedGroups([]);
      }

      setSpaceName(spaceInfo?.name ?? "");

      const isRestricted = spaceInfo
        ? spaceInfo.isRestricted
        : (defaultRestricted ?? false);
      setIsRestricted(isRestricted);

      let initialMemberIds: string[] = [];
      if (spaceMembers && space) {
        initialMemberIds = spaceMembers.map((member) => member.sId);
      }

      // Auto-add current user when opening with restricted access for new spaces
      if (isRestricted && !space && user && initialMemberIds.length === 0) {
        initialMemberIds = [user.sId];
      }

      setSelectedMemberIds(new Set(initialMemberIds));
    }
  }, [
    defaultRestricted,
    groups,
    isOpen,
    scimEnabled,
    setSpaceName,
    spaceInfo,
    user,
    space,
  ]);

  const handleClose = useCallback(() => {
    // Call the original onClose function.
    onClose();

    setTimeout(() => {
      // Reset state.
      setSpaceName("");
      setIsRestricted(false);
      setSelectedMemberIds(new Set());
      setSelectedGroups([]);
      setManagementType("manual");
      setIsDeleting(false);
      setIsSaving(false);
      setIsDirty(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    const trimmedName = spaceName.trim();
    if (!trimmedName) {
      return;
    }

    // Warn admin if they are modifying a space they don't belong to.
    if (space && spaceInfo && !spaceInfo.isMember) {
      const confirmed = await confirm({
        title: "Security notice",
        message:
          "You are modifying this space's settings while not being a member yourself. " +
          "This action will be logged for security purposes. Do you want to proceed?",
        validateLabel: "Proceed",
        validateVariant: "warning",
      });

      if (!confirmed) {
        return;
      }
    }

    setIsSaving(true);

    if (space) {
      if (scimEnabled && managementType === "group") {
        await doUpdate(space, {
          isRestricted,
          groupIds: selectedGroups.map((group) => group.sId),
          editorGroupIds: [],
          managementMode: "group",
          name: trimmedName,
        });
      } else {
        await doUpdate(space, {
          isRestricted,
          memberIds: Array.from(selectedMemberIds),
          editorIds: [],
          managementMode: "manual",
          name: trimmedName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (scimEnabled && managementType === "group") {
        createdSpace = await doCreate({
          name: trimmedName,
          isRestricted,
          groupIds: selectedGroups.map((group) => group.sId),
          managementMode: "group",
          spaceKind: "regular",
        });
      } else {
        createdSpace = await doCreate({
          name: trimmedName,
          isRestricted,
          memberIds: Array.from(selectedMemberIds),
          managementMode: "manual",
          spaceKind: "regular",
        });
      }

      setIsSaving(false);
      if (createdSpace && onCreated) {
        onCreated(createdSpace);
      }
    }

    handleClose();
  }, [
    confirm,
    doCreate,
    doUpdate,
    handleClose,
    isRestricted,
    mutateSpaceInfo,
    onCreated,
    space,
    spaceInfo,
    selectedMemberIds,
    spaceName,
    managementType,
    selectedGroups,
    scimEnabled,
  ]);

  const onDelete = useCallback(async () => {
    if (!space) {
      return;
    }

    setIsDeleting(true);

    const res = await doDelete(space);
    setIsDeleting(false);

    if (res) {
      handleClose();
      await router.push(`/w/${owner.sId}/spaces`);
    }
  }, [doDelete, handleClose, owner.sId, router, space]);

  const handleManagementTypeChange = useCallback(
    (managementType: MembersManagementType) => {
      setManagementType(managementType);
      setIsDirty(true);
    },
    []
  );

  const disabled = useMemo(() => {
    const hasName = spaceName.trim().length > 0;

    const canSave =
      !isRestricted ||
      (managementType === "manual" && selectedMemberIds.size > 0) ||
      (managementType === "group" && selectedGroups.length > 0);

    if (!spaceInfo) {
      return !canSave || !hasName;
    }

    return !isDirty || !canSave || !hasName;
  }, [
    isRestricted,
    managementType,
    selectedMemberIds.size,
    selectedGroups.length,
    spaceInfo,
    isDirty,
    spaceName,
  ]);
  const isManual = !scimEnabled || managementType === "manual";

  // When editing an existing space, hold the access section back until its members have loaded: the
  // toggle's state and the member table's contents both come from `spaceInfo`, and the table seeds
  // its display cache once, at mount. Rendering it early shows an empty member list.
  // `isSpaceInfoLoading` stays true when there is no space (the hook is disabled), hence the guard.
  const isLoadingSpaceInfo = !!space && isSpaceInfoLoading;

  const handleNameChange = useCallback((value: string) => {
    setSpaceName(value);
    setIsDirty(true);
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent trapFocusScope={false} size="lg">
        <SheetHeader>
          <SheetTitle>
            Space Settings{space ? ` - ${spaceName}` : ""}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex w-full flex-col gap-y-4">
            <SpaceNameSection
              spaceName={spaceName}
              onChange={handleNameChange}
            />
            <SpaceDeleteSection
              isAdmin={isAdmin}
              space={space}
              spaceInfoByCategory={spaceInfo?.categories}
              onDelete={onDelete}
              isDeleting={isDeleting}
            />

            {isLoadingSpaceInfo ? (
              <div className="flex justify-center p-8">
                <Spinner />
              </div>
            ) : (
              <>
                <RestrictedAccessHeader
                  isRestricted={isRestricted}
                  onToggle={() => {
                    const newRestricted = !isRestricted;
                    setIsRestricted(newRestricted);
                    setIsDirty(true);
                    if (
                      newRestricted &&
                      !space &&
                      user &&
                      selectedMemberIds.size === 0
                    ) {
                      setSelectedMemberIds(new Set([user.sId]));
                    }
                  }}
                  restrictedDescription={
                    <>
                      <span>Restricted access is active.</span>
                      <span>
                        Members can read the content of the space and write data
                        into it (upload files, delete documents...).
                      </span>
                    </>
                  }
                  unrestrictedDescription={
                    <>
                      <span>
                        Restricted access is disabled. The space is open.
                      </span>
                      <span>
                        Anyone in the workspace can read the data from this
                        space.
                      </span>
                      <span>
                        Members of the space can also write data (upload files,
                        delete documents...).
                      </span>
                    </>
                  }
                />

                {/* Shown in both states: an open space still has members, and they are the ones
                    who can write to it. The toggle only controls who can read. */}
                <RestrictedAccessBody
                  isManual={isManual}
                  scimEnabled={scimEnabled}
                  managementType={managementType}
                  owner={owner}
                  selectedMemberIds={selectedMemberIds}
                  selectedGroups={selectedGroups}
                  onManagementTypeChange={handleManagementTypeChange}
                  onMemberIdsUpdated={(memberIds) => {
                    setSelectedMemberIds(memberIds);
                    setIsDirty(true);
                  }}
                  onGroupsUpdated={(groups) => {
                    setSelectedGroups(groups);
                    setIsDirty(true);
                  }}
                  initialMembers={spaceInfo?.members}
                />
              </>
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
            label: isSaving ? "Saving..." : space ? "Save" : "Create",
            onClick: onSave,
            disabled: disabled,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

interface SpaceNameSectionProps {
  spaceName: string;
  onChange: (value: string) => void;
}

function SpaceNameSection({ spaceName, onChange }: SpaceNameSectionProps) {
  return (
    <div className="flex w-full flex-col gap-y-4">
      <Page.SectionHeader title="Name" />
      <Input
        placeholder="Space's name"
        value={spaceName}
        name="spaceName"
        message="Space name must be unique"
        messageStatus="info"
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

interface SpaceDeleteSectionProps {
  isAdmin: boolean;
  space?: SpaceType;
  spaceInfoByCategory: { [key: string]: SpaceCategoryInfo } | undefined;
  onDelete: () => void;
  isDeleting: boolean;
}

function SpaceDeleteSection({
  isAdmin,
  space,
  spaceInfoByCategory,
  onDelete,
  isDeleting,
}: SpaceDeleteSectionProps) {
  if (!isAdmin || !space || space.kind !== "regular") {
    return null;
  }

  return (
    <>
      <ConfirmDeleteSpaceDialog
        spaceInfoByCategory={spaceInfoByCategory}
        space={space}
        handleDelete={onDelete}
        isDeleting={isDeleting}
      />
      <Separator />
    </>
  );
}
