import {
  Button,
  ContentMessage,
  ScrollArea,
  SearchInput,
  SliderToggle,
  TextArea,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { MembersTable } from "@app/components/assistant/conversation/space/about/MembersTable";
import { ProjectUrlsSection } from "@app/components/assistant/conversation/space/about/ProjectUrlsSection";
import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  useProjectMetadata,
  useUpdateProjectMetadata,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType, SpaceUserType } from "@app/types";
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";

interface SpaceAboutTabProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  initialMembers: SpaceUserType[];
  initialIsRestricted: boolean;
  isProjectEditor: boolean;
  onOpenInvitePanel?: () => void;
}

export function SpaceAboutTab({
  owner,
  space,
  initialMembers,
  initialIsRestricted,
  isProjectEditor,
  onOpenInvitePanel,
}: SpaceAboutTabProps) {
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");
  const [savedIsPublic, setSavedIsPublic] = useState(!initialIsRestricted);
  const [isPublic, setIsPublic] = useState(!initialIsRestricted);
  const [savedMembers, setSavedMembers] =
    useState<SpaceUserType[]>(initialMembers);
  const [selectedMembers, setSelectedMembers] =
    useState<SpaceUserType[]>(initialMembers);
  const [isSaving, setIsSaving] = useState(false);

  // Project metadata form
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const { projectMetadata, isProjectMetadataLoading } = useProjectMetadata({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const doUpdateMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: space.sId,
  });

  const form = useForm<PatchProjectMetadataBodyType>({
    resolver: zodResolver(PatchProjectMetadataBodySchema),
    defaultValues: {
      description: "",
      urls: [],
    },
  });

  // Sync form with loaded metadata
  useEffect(() => {
    if (projectMetadata) {
      form.reset({
        description: projectMetadata.description ?? "",
        urls: projectMetadata.urls ?? [],
      });
    }
  }, [projectMetadata, form]);

  const doUpdate = useUpdateSpace({ owner });

  useEffect(() => {
    setSavedMembers(initialMembers);
    setSelectedMembers(initialMembers);
  }, [initialMembers]);

  const hasChanges = useMemo(() => {
    if (isPublic !== savedIsPublic) {
      return true;
    }

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
  }, [selectedMembers, savedMembers, isPublic, savedIsPublic]);

  const canSave = useMemo(() => {
    if (!isProjectEditor) {
      return false;
    }
    if (!hasChanges) {
      return false;
    }
    if (
      selectedMembers.filter((m) => m.isEditor).length === 0 // a project must have at least one editor
    ) {
      return false;
    }
    return true;
  }, [hasChanges, selectedMembers, isProjectEditor]);

  const onSaveMetadata = form.handleSubmit(async (data) => {
    setIsSavingMetadata(true);
    await doUpdateMetadata(data);
    setIsSavingMetadata(false);
  });

  const onSave = useCallback(async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);

    const updatedSpace = await doUpdate(space, {
      isRestricted: !isPublic,
      memberIds: selectedMembers
        .filter((m) => !m.isEditor)
        .map((member) => member.sId),
      editorIds: selectedMembers.filter((m) => m.isEditor).map((m) => m.sId),
      managementMode: "manual",
      name: space.name,
    });
    if (updatedSpace) {
      // reset only if the update was successful
      setSavedMembers(selectedMembers);
      setSavedIsPublic(isPublic);
    }
    setIsSaving(false);
  }, [
    canSave,
    doUpdate,
    selectedMembers,
    isPublic,
    space,
    setSavedIsPublic,
    setSavedMembers,
  ]);
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        <h3 className="heading-2xl">Settings</h3>
        <FormProvider {...form}>
          <form onSubmit={onSaveMetadata} className="flex flex-col gap-y-4">
            <BaseFormFieldSection
              fieldName="description"
              title="Description"
              helpText="Describe what this project is about"
            >
              {({ registerRef, registerProps, onChange, errorMessage }) => (
                <TextArea
                  ref={registerRef}
                  placeholder={
                    isProjectMetadataLoading
                      ? "Loading..."
                      : "Describe what this project is about..."
                  }
                  disabled={isProjectMetadataLoading}
                  error={errorMessage}
                  onChange={onChange}
                  rows={3}
                  {...registerProps}
                />
              )}
            </BaseFormFieldSection>

            <ProjectUrlsSection disabled={isProjectMetadataLoading} />

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                label={isSavingMetadata ? "Saving..." : "Save changes"}
                type="submit"
                disabled={
                  isSavingMetadata ||
                  isProjectMetadataLoading ||
                  !form.formState.isDirty
                }
              />
            </div>
          </form>
        </FormProvider>

        <div className="border-t pt-4" />

        <div className="flex w-full flex-col gap-2">
          <h3 className="heading-lg">Visibility</h3>
          <div className="flex items-center justify-between gap-4 border-y border-border py-4">
            <div className="flex flex-col">
              <div className="heading-sm text-foreground dark:text-foreground-night">
                Opened to everyone
              </div>
              <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Anyone in the workspace can find and join the project.
              </div>
            </div>
            <SliderToggle
              size="xs"
              selected={isPublic}
              onClick={() => setIsPublic((prev) => !prev)}
              disabled={!isProjectEditor}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Members</h3>
          {isProjectEditor && onOpenInvitePanel && (
            <Button
              label="Invite"
              variant="outline"
              icon={UserGroupIcon}
              onClick={onOpenInvitePanel}
            />
          )}
        </div>
        {selectedMembers.length > 0 && (
          <>
            <SearchInput
              name="search"
              placeholder="Search (email)"
              value={searchSelectedMembers}
              onChange={setSearchSelectedMembers}
            />
            <ScrollArea className="h-full">
              <MembersTable
                owner={owner}
                space={space}
                onMembersUpdated={setSelectedMembers}
                selectedMembers={selectedMembers}
                searchSelectedMembers={searchSelectedMembers}
                isEditor={isProjectEditor}
              />
            </ScrollArea>
          </>
        )}

        {isProjectEditor && (
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="primary"
              label={isSaving ? "Saving..." : "Save"}
              onClick={onSave}
              disabled={!canSave || isSaving}
            />
          </div>
        )}

        {isProjectEditor && (
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
    </div>
  );
}
