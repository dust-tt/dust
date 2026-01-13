import { Button, ContentMessage } from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import { RestrictedAccessHeader } from "@app/components/spaces/RestrictedAccessHeader";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type {
  GroupType,
  LightWorkspaceType,
  SpaceType,
  SpaceUserType,
} from "@app/types";

interface SpaceAboutTabProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  initialMembers: SpaceUserType[];
  initialGroups: GroupType[];
  initialManagementMode: "manual" | "group";
  initialIsRestricted: boolean;
  isSpaceEditor: boolean;
  planAllowsSCIM: boolean;
}

export function SpaceAboutTab({
  owner,
  space,
  initialMembers,
  initialGroups,
  initialManagementMode,
  initialIsRestricted,
  isSpaceEditor,
  planAllowsSCIM,
}: SpaceAboutTabProps) {
  const [savedManagementType, setSavedManagementType] = useState<
    "manual" | "group"
  >(initialManagementMode);
  const [managementType, setManagementType] = useState<"manual" | "group">(
    initialManagementMode
  );
  const [savedIsRestricted, setSavedIsRestricted] =
    useState(initialIsRestricted);
  const [isRestricted, setIsRestricted] = useState(initialIsRestricted);
  const [savedMembers, setSavedMembers] =
    useState<SpaceUserType[]>(initialMembers);
  const [selectedMembers, setSelectedMembers] =
    useState<SpaceUserType[]>(initialMembers);
  const [savedGroups, setSavedGroups] = useState<GroupType[]>(initialGroups);
  const [selectedGroups, setSelectedGroups] =
    useState<GroupType[]>(initialGroups);
  const [isSaving, setIsSaving] = useState(false);

  const isManual = !planAllowsSCIM || managementType === "manual";
  const doUpdate = useUpdateSpace({ owner });

  const hasChanges = useMemo(() => {
    if (managementType !== savedManagementType) {
      return true;
    }
    if (isRestricted !== savedIsRestricted) {
      return true;
    }

    if (managementType === "manual") {
      const currentMemberIds = selectedMembers.map((m) => m.sId).sort();
      const savedMemberIds = savedMembers.map((m) => m.sId).sort();
      const memberIdsChanged =
        JSON.stringify(currentMemberIds) !== JSON.stringify(savedMemberIds);

      // Check if editor IDs have changed
      const selectedEditorIds = selectedMembers
        .filter((m) => m.isEditor)
        .map((m) => m.sId)
        .sort();
      const savedEditorIds = savedMembers
        .filter((m: SpaceUserType) => m.isEditor)
        .map((m) => m.sId)
        .sort();
      const editorsChanged =
        JSON.stringify(savedEditorIds) !== JSON.stringify(selectedEditorIds);

      return memberIdsChanged || editorsChanged;
    } else {
      const currentGroupIds = selectedGroups.map((g) => g.sId).sort();
      const savedGroupIds = savedGroups.map((g) => g.sId).sort();
      return JSON.stringify(currentGroupIds) !== JSON.stringify(savedGroupIds);
    }
  }, [
    managementType,
    savedManagementType,
    selectedMembers,
    savedMembers,
    selectedGroups,
    savedGroups,
    isRestricted,
    savedIsRestricted,
  ]);

  const canSave = useMemo(() => {
    if (!isSpaceEditor) {
      return false;
    }
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
      const updatedtedSpace = await doUpdate(space, {
        isRestricted,
        groupIds: selectedGroups.map((group) => group.sId),
        managementMode: "group",
        name: space.name,
      });
      if (updatedtedSpace) {
        setSavedGroups(selectedGroups);
        setSavedManagementType("group");
        setSavedIsRestricted(isRestricted);
      }
    } else {
      const updatedtedSpace = await doUpdate(space, {
        isRestricted,
        memberIds: selectedMembers
          .filter((m) => !m.isEditor)
          .map((member) => member.sId),
        editorIds: selectedMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: space.name,
      });
      if (updatedtedSpace) {
        setSavedMembers(selectedMembers);
        setSavedManagementType("manual");
        setSavedIsRestricted(isRestricted);
      }
    }
    setIsSaving(false);
  }, [
    canSave,
    doUpdate,
    managementType,
    planAllowsSCIM,
    selectedGroups,
    selectedMembers,
    isRestricted,
    space,
  ]);

  return (
    <div className="flex w-full flex-col gap-y-4 px-4 py-8">
      <RestrictedAccessHeader
        isRestricted={isRestricted}
        onToggle={() => setIsRestricted(!isRestricted)}
        restrictedDescription="The project is only accessible to selected members."
        unrestrictedDescription="The project is accessible to everyone in the workspace."
        disabled={!isSpaceEditor}
      />
      <RestrictedAccessBody
        isManual={isManual}
        planAllowsSCIM={planAllowsSCIM}
        managementType={managementType}
        owner={owner}
        selectedMembers={selectedMembers}
        selectedGroups={selectedGroups}
        onManagementTypeChange={setManagementType}
        onMembersUpdated={setSelectedMembers}
        onGroupsUpdated={setSelectedGroups}
        canSetEditors
        disabled={!isSpaceEditor}
      />

      {isSpaceEditor && (
        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="primary"
            label={isSaving ? "Saving..." : "Save"}
            onClick={onSave}
            disabled={!canSave || isSaving}
          />
        </div>
      )}

      {isSpaceEditor && (
        <div className="flex w-full flex-col items-center gap-y-4 border-t pt-8">
          <ContentMessage
            variant="warning"
            title="Danger Zone"
            className="flex w-full"
          >
            <div className="flex flex-col gap-y-4">
              <p className="text-sm text-muted-foreground">
                Deleting this project will permanently remove all its content,
                including conversations, folders, websites, and data sources.
                This action cannot be undone. All assistants using tools that
                depend on this project will be impacted.
              </p>
              <DeleteSpaceDialog owner={owner} space={space} />
            </div>
          </ContentMessage>
        </div>
      )}
    </div>
  );
}
