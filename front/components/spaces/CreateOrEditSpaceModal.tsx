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
  SliderToggle,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { ConfirmDeleteSpaceDialog } from "@app/components/spaces/ConfirmDeleteSpaceDialog";
import type { MembersManagementType } from "@app/components/spaces/RestrictedAccessBody";
import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import { useGroups } from "@app/lib/swr/groups";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaceInfo,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import { useUser } from "@app/lib/swr/user";
import type { SpaceCategoryInfo } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type {
  GroupType,
  LightWorkspaceType,
  PlanType,
  SpaceType,
  UserType,
} from "@app/types";

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
  const [currentMembers, setCurrentMembers] = useState<UserType[]>([]);
  const [currentGroups, setCurrentGroups] = useState<GroupType[]>([]);
  const [currentManagementType, setCurrentManagementType] =
    useState<MembersManagementType>("manual");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Used to track initial members/groups for the RestrictedAccessBody
  const [initialMembers, setInitialMembers] = useState<UserType[]>([]);
  const [initialGroups, setInitialGroups] = useState<GroupType[]>([]);
  const [initialManagementType, setInitialManagementType] =
    useState<MembersManagementType>("manual");

  const onChangeRef = useRef<
    | ((data: {
        groups: GroupType[];
        managementType: MembersManagementType;
        members: UserType[];
      }) => void)
    | null
  >(null);

  const planAllowsSCIM = plan.limits.users.isSCIMAllowed;
  const { user } = useUser();

  // Handle changes from RestrictedAccessBody
  const handleChange = useCallback(
    async (data: {
      groups: GroupType[];
      managementType: MembersManagementType;
      members: UserType[];
    }) => {
      // Check if management type changed
      if (data.managementType !== currentManagementType) {
        if (!planAllowsSCIM) {
          return;
        }

        // If switching from manual to group mode with manually added members
        if (
          currentManagementType === "manual" &&
          data.managementType === "group" &&
          currentMembers.length > 0
        ) {
          const confirmed = await confirm({
            title: "Switch to groups",
            message:
              "This switches from manual member to group-based access. " +
              "Your current member list will be saved but no longer active.",
            validateLabel: "Confirm",
            validateVariant: "primary",
          });

          if (!confirmed) {
            // Reset to previous type
            setInitialManagementType(currentManagementType);
            return;
          }
        }
        // If switching from group to manual mode with selected groups
        else if (
          currentManagementType === "group" &&
          data.managementType === "manual" &&
          currentGroups.length > 0
        ) {
          const confirmed = await confirm({
            title: "Switch to members",
            message:
              "This switches from group-based access to manual member management. " +
              "Your current group settings will be saved but no longer active.",
            validateLabel: "Confirm",
            validateVariant: "primary",
          });

          if (!confirmed) {
            // Reset to previous type
            setInitialManagementType(currentManagementType);
            return;
          }
        }
      }

      setCurrentMembers(data.members);
      setCurrentGroups(data.groups);
      setCurrentManagementType(data.managementType);
      setIsDirty(true);
    },
    [
      confirm,
      currentGroups.length,
      currentManagementType,
      currentMembers.length,
      planAllowsSCIM,
    ]
  );

  useEffect(() => {
    onChangeRef.current = handleChange;
  }, [handleChange]);

  useEffect(() => {
    if (!planAllowsSCIM) {
      setCurrentManagementType("manual");
      setInitialManagementType("manual");
    }
  }, [planAllowsSCIM]);

  const doCreate = useCreateSpace({ owner });
  const doUpdate = useUpdateSpace({ owner });
  const doDelete = useDeleteSpace({ owner, force: true });

  const router = useRouter();

  const { spaceInfo, mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space?.sId ?? null,
    includeAllMembers: true, // Always include all members so we can see suspended ones when switching modes
  });

  const { groups } = useGroups({
    owner,
    kinds: ["provisioned"],
    disabled: !planAllowsSCIM,
  });

  useEffect(() => {
    if (isOpen) {
      const spaceMembers = spaceInfo?.members ?? null;

      // Initialize management type from space data (if editing) or default to manual for new spaces
      const mgmtType = spaceInfo?.managementMode ?? "manual";
      setCurrentManagementType(mgmtType);
      setInitialManagementType(mgmtType);

      // Initialize selected groups based on space's groupIds (only if workos feature is enabled)
      let initialGroupsList: GroupType[] = [];
      if (
        planAllowsSCIM &&
        spaceInfo?.groupIds &&
        spaceInfo.groupIds.length > 0 &&
        groups
      ) {
        initialGroupsList = groups.filter((group) =>
          spaceInfo.groupIds.includes(group.sId)
        );
      }
      setCurrentGroups(initialGroupsList);
      setInitialGroups(initialGroupsList);

      setSpaceName(spaceInfo?.name ?? "");

      const isRestricted = spaceInfo
        ? spaceInfo.isRestricted
        : (defaultRestricted ?? false);
      setIsRestricted(isRestricted);

      let initialMembersList: UserType[] = [];
      if (spaceMembers && space) {
        initialMembersList = spaceMembers;
      } else if (!space) {
        initialMembersList = [];
      }

      // Auto-add current user when opening with restricted access for new spaces
      if (isRestricted && !space && user && initialMembersList.length === 0) {
        initialMembersList = [user];
      }

      setCurrentMembers(initialMembersList);
      setInitialMembers(initialMembersList);
    }
  }, [
    defaultRestricted,
    groups,
    isOpen,
    planAllowsSCIM,
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
      setCurrentMembers([]);
      setCurrentGroups([]);
      setCurrentManagementType("manual");
      setInitialMembers([]);
      setInitialGroups([]);
      setInitialManagementType("manual");
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
      if (planAllowsSCIM && currentManagementType === "group") {
        await doUpdate(space, {
          isRestricted,
          groupIds: currentGroups.map((group) => group.sId),
          managementMode: "group",
          name: trimmedName,
        });
      } else {
        await doUpdate(space, {
          isRestricted,
          memberIds: currentMembers.map((vm) => vm.sId),
          managementMode: "manual",
          name: trimmedName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (planAllowsSCIM && currentManagementType === "group") {
        createdSpace = await doCreate({
          name: trimmedName,
          isRestricted,
          groupIds: currentGroups.map((group) => group.sId),
          managementMode: "group",
          spaceKind: "regular",
        });
      } else {
        createdSpace = await doCreate({
          name: trimmedName,
          isRestricted,
          memberIds: currentMembers.map((vm) => vm.sId),
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
    currentGroups,
    currentManagementType,
    currentMembers,
    doCreate,
    doUpdate,
    handleClose,
    isRestricted,
    mutateSpaceInfo,
    onCreated,
    planAllowsSCIM,
    space,
    spaceInfo,
    spaceName,
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

  const disabled = useMemo(() => {
    const hasName = spaceName.trim().length > 0;

    const canSave =
      !isRestricted ||
      (currentManagementType === "manual" && currentMembers.length > 0) ||
      (currentManagementType === "group" && currentGroups.length > 0);

    if (!spaceInfo) {
      return !canSave || !hasName;
    }

    return !isDirty || !canSave || !hasName;
  }, [
    currentGroups.length,
    currentManagementType,
    currentMembers.length,
    isDirty,
    isRestricted,
    spaceInfo,
    spaceName,
  ]);

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
                  currentMembers.length === 0
                ) {
                  const newMembers = [user];
                  setCurrentMembers(newMembers);
                  setInitialMembers(newMembers);
                }
              }}
            />
            <RestrictedAccessBody
              isRestricted={isRestricted}
              planAllowsSCIM={planAllowsSCIM}
              owner={owner}
              initialMembers={initialMembers}
              initialGroups={initialGroups}
              initialManagementType={initialManagementType}
              onChange={(data) => {
                if (onChangeRef.current) {
                  void onChangeRef.current(data);
                }
              }}
            />
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

interface RestrictedAccessHeaderProps {
  isRestricted: boolean;
  onToggle: () => void;
}

function RestrictedAccessHeader({
  isRestricted,
  onToggle,
}: RestrictedAccessHeaderProps) {
  return (
    <>
      <div className="flex w-full items-center justify-between overflow-visible">
        <Page.SectionHeader title="Restricted Access" />
        <SliderToggle selected={isRestricted} onClick={onToggle} />
      </div>
      {isRestricted ? (
        <span>Restricted access is active.</span>
      ) : (
        <span>
          Restricted access is disabled. The space is accessible to everyone in
          the workspace.
        </span>
      )}
    </>
  );
}
