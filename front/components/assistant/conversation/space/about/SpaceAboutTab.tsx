import { Button, ContentMessage, Input, Label } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import { RestrictedAccessHeader } from "@app/components/spaces/RestrictedAccessHeader";
import {
  useProjectMetadata,
  useUpdateProjectMetadata,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
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
  initialIsRestricted: boolean;
  planAllowsSCIM: boolean;
}

export function SpaceAboutTab({
  owner,
  space,
  initialMembers,
  initialGroups,
  initialManagementMode,
  initialIsRestricted,
  planAllowsSCIM,
}: SpaceAboutTabProps) {
  const [managementType, setManagementType] = useState<"manual" | "group">(
    initialManagementMode
  );
  const [selectedMembers, setSelectedMembers] =
    useState<UserType[]>(initialMembers);
  const [selectedGroups, setSelectedGroups] =
    useState<GroupType[]>(initialGroups);
  const [isSaving, setIsSaving] = useState(false);

  const [isRestricted, setIsRestricted] = useState(initialIsRestricted);

  // Project metadata state
  const [description, setDescription] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const { projectMetadata, isProjectMetadataLoading } = useProjectMetadata({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const doUpdateMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: space.sId,
  });

  // Sync description state with loaded metadata
  useEffect(() => {
    if (projectMetadata?.description) {
      setDescription(projectMetadata.description);
    }
  }, [projectMetadata?.description]);

  const isManual = !planAllowsSCIM || managementType === "manual";
  const doUpdate = useUpdateSpace({ owner });

  const hasChanges = useMemo(() => {
    if (managementType !== initialManagementMode) {
      return true;
    }
    if (isRestricted !== initialIsRestricted) {
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
    isRestricted,
    initialIsRestricted,
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

  const hasDescriptionChanges = useMemo(() => {
    return description !== (projectMetadata?.description ?? "");
  }, [description, projectMetadata?.description]);

  const onSaveDescription = useCallback(async () => {
    if (!hasDescriptionChanges) {
      return;
    }
    setIsSavingDescription(true);
    await doUpdateMetadata({ description: description || null });
    setIsSavingDescription(false);
  }, [hasDescriptionChanges, doUpdateMetadata, description]);

  const onSave = useCallback(async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);

    if (planAllowsSCIM && managementType === "group") {
      await doUpdate(space, {
        isRestricted,
        groupIds: selectedGroups.map((group) => group.sId),
        managementMode: "group",
        name: space.name,
      });
    } else {
      await doUpdate(space, {
        isRestricted,
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
    isRestricted,
    space,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-y-4 overflow-y-scroll p-8">
      <div className="flex flex-col gap-y-2">
        <Label>Description</Label>
        <Input
          placeholder={
            isProjectMetadataLoading
              ? "Loading..."
              : "Describe what this project is about..."
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isProjectMetadataLoading}
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            label={isSavingDescription ? "Saving..." : "Save description"}
            onClick={onSaveDescription}
            disabled={
              !hasDescriptionChanges ||
              isSavingDescription ||
              isProjectMetadataLoading
            }
          />
        </div>
      </div>

      <div className="border-t pt-4" />

      <RestrictedAccessHeader
        isRestricted={isRestricted}
        onToggle={() => setIsRestricted(!isRestricted)}
        restrictedDescription="The project is only accessible to selected members."
        unrestrictedDescription="The project is accessible to everyone in the workspace."
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
      />

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="primary"
          label={isSaving ? "Saving..." : "Save"}
          onClick={onSave}
          disabled={!canSave || isSaving}
        />
      </div>

      <div className="flex w-full flex-col items-center gap-y-4 border-t pt-8">
        <ContentMessage
          variant="warning"
          title="Danger Zone"
          className="flex w-full"
        >
          <div className="flex flex-col gap-y-4">
            <p className="text-sm text-muted-foreground">
              Deleting this project will permanently remove all its content,
              including conversations, folders, websites, and data sources. This
              action cannot be undone. All assistants using tools that depend on
              this project will be impacted.
            </p>
            <DeleteSpaceDialog owner={owner} space={space} />
          </div>
        </ContentMessage>
      </div>
    </div>
  );
}
