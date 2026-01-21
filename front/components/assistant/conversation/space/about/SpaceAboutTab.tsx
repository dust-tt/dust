import {
  ActionExternalLinkIcon,
  ActionTrashIcon,
  Button,
  ContentMessage,
  IconButton,
  Input,
  Label,
} from "@dust-tt/sparkle";
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
  const [urls, setUrls] = useState<Array<{ name: string; url: string }>>([]);
  const [newUrlName, setNewUrlName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const { projectMetadata, isProjectMetadataLoading } = useProjectMetadata({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const doUpdateMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: space.sId,
  });

  // Sync description and URLs state with loaded metadata
  useEffect(() => {
    if (projectMetadata?.description) {
      setDescription(projectMetadata.description);
    }
    if (projectMetadata?.urls) {
      setUrls(projectMetadata.urls);
    }
  }, [projectMetadata?.description, projectMetadata?.urls]);

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

  const onSaveMetadata = useCallback(async () => {
    setIsSavingMetadata(true);

    // Auto-add pending URL if both fields are filled
    const urlsToSave =
      newUrlName.trim() && newUrl.trim()
        ? [...urls, { name: newUrlName.trim(), url: newUrl.trim() }]
        : urls;

    await doUpdateMetadata({
      description: description || null,
      urls: urlsToSave,
    });

    // Clear the input fields after saving
    if (newUrlName.trim() && newUrl.trim()) {
      setNewUrlName("");
      setNewUrl("");
    }

    setIsSavingMetadata(false);
  }, [doUpdateMetadata, description, urls, newUrlName, newUrl]);

  const onAddUrl = useCallback(() => {
    if (newUrlName.trim() && newUrl.trim()) {
      setUrls([...urls, { name: newUrlName.trim(), url: newUrl.trim() }]);
      setNewUrlName("");
      setNewUrl("");
    }
  }, [newUrlName, newUrl, urls]);

  const onUpdateUrlName = useCallback(
    (index: number, name: string) => {
      setUrls(urls.map((u, i) => (i === index ? { ...u, name } : u)));
    },
    [urls]
  );

  const onUpdateUrlValue = useCallback(
    (index: number, url: string) => {
      setUrls(urls.map((u, i) => (i === index ? { ...u, url } : u)));
    },
    [urls]
  );

  const onRemoveUrl = useCallback(
    (index: number) => {
      setUrls(urls.filter((_, i) => i !== index));
    },
    [urls]
  );

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
      <div className="flex flex-col gap-y-4">
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
        </div>

        <div className="flex flex-col gap-y-2">
          <Label>URLs</Label>
          {urls.length > 0 && (
            <div className="flex flex-col gap-y-2">
              {urls.map((urlItem, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="URL name"
                    value={urlItem.name}
                    onChange={(e) => onUpdateUrlName(index, e.target.value)}
                    disabled={isProjectMetadataLoading}
                    className="w-48"
                  />
                  <Input
                    type="url"
                    placeholder="URL"
                    value={urlItem.url}
                    onChange={(e) => onUpdateUrlValue(index, e.target.value)}
                    disabled={isProjectMetadataLoading}
                    className="flex-1"
                  />
                  <IconButton
                    icon={ActionExternalLinkIcon}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        urlItem.url.startsWith("http")
                          ? urlItem.url
                          : `https://${urlItem.url}`,
                        "_blank",
                        "noopener noreferrer"
                      )
                    }
                    disabled={isProjectMetadataLoading || !urlItem.url.trim()}
                    tooltip="Open URL"
                  />
                  <IconButton
                    icon={ActionTrashIcon}
                    variant="outline"
                    size="sm"
                    onClick={() => onRemoveUrl(index)}
                    disabled={isProjectMetadataLoading}
                    tooltip="Remove URL"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="URL name (e.g. Documentation)"
              value={newUrlName}
              onChange={(e) => {
                e.preventDefault();
                setNewUrlName(e.target.value);
              }}
              disabled={isProjectMetadataLoading}
              className="w-48"
            />
            <Input
              placeholder="URL"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddUrl();
                }
              }}
              disabled={isProjectMetadataLoading}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              label="Add"
              onClick={onAddUrl}
              disabled={
                !newUrlName.trim() || !newUrl.trim() || isProjectMetadataLoading
              }
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            label={isSavingMetadata ? "Saving..." : "Save changes"}
            onClick={onSaveMetadata}
            disabled={isSavingMetadata || isProjectMetadataLoading}
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
