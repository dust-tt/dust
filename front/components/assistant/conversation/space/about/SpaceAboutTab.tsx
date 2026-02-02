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
import { useContext, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { MembersTable } from "@app/components/assistant/conversation/space/about/MembersTable";
import { ProjectUrlsSection } from "@app/components/assistant/conversation/space/about/ProjectUrlsSection";
import { ConfirmContext } from "@app/components/Confirm";
import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  useProjectMetadata,
  useSpaceInfo,
  useUpdateProjectMetadata,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType, SpaceUserType } from "@app/types";
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";

interface SpaceAboutTabProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  projectMembers: SpaceUserType[];
  isPublic: boolean;
  isProjectEditor: boolean;
  onOpenInvitePanel?: () => void;
}

export function SpaceAboutTab({
  owner,
  space,
  projectMembers,
  isPublic,
  isProjectEditor,
  onOpenInvitePanel,
}: SpaceAboutTabProps) {
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");

  const confirm = useContext(ConfirmContext);

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
  const { mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  const onSaveMetadata = form.handleSubmit(async (data) => {
    setIsSavingMetadata(true);
    await doUpdateMetadata(data);
    setIsSavingMetadata(false);
  });

  const handleVisibilityToggle = async () => {
    const newIsPublic = !isPublic;
    const title = newIsPublic ? "Switch to public?" : "Switch to restricted?";
    const message = newIsPublic
      ? "Everyone in the workspace will be able to see and join this project."
      : "Access will be limited to invited members only.";

    const confirmed = await confirm({
      title,
      message,
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const updated = await doUpdate(space, {
      isRestricted: !newIsPublic,
      memberIds: projectMembers.filter((m) => !m.isEditor).map((m) => m.sId),
      editorIds: projectMembers.filter((m) => m.isEditor).map((m) => m.sId),
      managementMode: "manual",
      name: space.name,
    });

    if (updated) {
      await mutateSpaceInfo();
    }
  };

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
              onClick={handleVisibilityToggle}
              disabled={!isProjectEditor}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Members</h3>
          {isProjectEditor && onOpenInvitePanel && (
            <Button
              label="Manage"
              variant="outline"
              icon={UserGroupIcon}
              onClick={onOpenInvitePanel}
            />
          )}
        </div>
        {projectMembers.length > 0 && (
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
                selectedMembers={projectMembers}
                searchSelectedMembers={searchSelectedMembers}
                isEditor={isProjectEditor}
              />
            </ScrollArea>
          </>
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
