import { Button } from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type {
  GroupType,
  LightWorkspaceType,
  SpaceType,
  UserType,
} from "@app/types";

interface SpaceAboutTabProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  initialMembers: UserType[];
  initialGroups: GroupType[];
  initialManagementMode: "manual" | "group";
  planAllowsSCIM: boolean;
}

export function SpaceAboutTab({
  owner,
  space,
  initialMembers,
  initialGroups,
  initialManagementMode,
  planAllowsSCIM,
}: SpaceAboutTabProps) {
  const [managementType, setManagementType] = useState<"manual" | "group">(
    initialManagementMode
  );
  const [selectedMembers, setSelectedMembers] =
    useState<UserType[]>(initialMembers);
  const [selectedGroups, setSelectedGroups] =
    useState<GroupType[]>(initialGroups);
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isManual = !planAllowsSCIM || managementType === "manual";
  const doUpdate = useUpdateSpace({ owner });

  // Update state when initial values change
  useEffect(() => {
    setManagementType(initialManagementMode);
    setSelectedMembers(initialMembers);
    setSelectedGroups(initialGroups);
  }, [initialManagementMode, initialMembers, initialGroups]);

  const hasChanges = useMemo(() => {
    if (managementType !== initialManagementMode) {
      return true;
    }

    if (managementType === "manual") {
      const currentMemberIds = selectedMembers.map((m) => m.sId).sort();
      const initialMemberIds = initialMembers.map((m) => m.sId).sort();
      return (
        JSON.stringify(currentMemberIds) !== JSON.stringify(initialMemberIds)
      );
    } else {
      const currentGroupIds = selectedGroups.map((g) => g.sId).sort();
      const initialGroupIds = initialGroups.map((g) => g.sId).sort();
      return (
        JSON.stringify(currentGroupIds) !== JSON.stringify(initialGroupIds)
      );
    }
  }, [
    managementType,
    initialManagementMode,
    selectedMembers,
    initialMembers,
    selectedGroups,
    initialGroups,
  ]);

  const canSave = useMemo(() => {
    if (!hasChanges) {
      return false;
    }
    if (managementType === "manual" && selectedMembers.length === 0) {
      return false;
    }
    if (managementType === "group" && selectedGroups.length === 0) {
      return false;
    }
    return true;
  }, [hasChanges, managementType, selectedMembers, selectedGroups]);

  const onSave = useCallback(async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);

    if (planAllowsSCIM && managementType === "group") {
      await doUpdate(space, {
        isRestricted: false,
        groupIds: selectedGroups.map((group) => group.sId),
        managementMode: "group",
        name: space.name,
      });
    } else {
      await doUpdate(space, {
        isRestricted: false,
        memberIds: selectedMembers.map((member) => member.sId),
        managementMode: "manual",
        name: space.name,
      });
    }

    setIsSaving(false);
  }, [
    canSave,
    doUpdate,
    managementType,
    planAllowsSCIM,
    selectedGroups,
    selectedMembers,
    space,
  ]);

  return (
    <div className="flex w-full flex-col gap-y-4 p-8">
      <RestrictedAccessBody
        isManual={isManual}
        planAllowsSCIM={planAllowsSCIM}
        managementType={managementType}
        owner={owner}
        selectedMembers={selectedMembers}
        selectedGroups={selectedGroups}
        searchSelectedMembers={searchSelectedMembers}
        onSearchChange={setSearchSelectedMembers}
        onManagementTypeChange={(value) => {
          if (value === "manual" || value === "group") {
            setManagementType(value);
          }
        }}
        onMembersUpdated={setSelectedMembers}
        onGroupsUpdated={setSelectedGroups}
      />

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="primary"
          label={isSaving ? "Saving..." : "Save"}
          onClick={onSave}
          disabled={!hasChanges || !canSave || isSaving}
        />
      </div>
    </div>
  );
}
