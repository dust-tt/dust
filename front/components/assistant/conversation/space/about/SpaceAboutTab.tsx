import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { MembersTable } from "@app/components/assistant/conversation/space/about/MembersTable";
import { ConfirmContext } from "@app/components/Confirm";
import { useSpaceConversationsSummary } from "@app/hooks/conversations";
import {
  useProjectMetadata,
  useSpaceInfo,
  useUpdateProjectMetadata,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  Input,
  ScrollArea,
  SearchInput,
  SliderToggle,
  TextArea,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContext, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

interface SpaceAboutTabProps {
  owner: LightWorkspaceType;
  space: RichSpaceType;
  onOpenMembersPanel?: () => void;
}

export function SpaceAboutTab({
  owner,
  space,
  onOpenMembersPanel,
}: SpaceAboutTabProps) {
  const {
    members: projectMembers,
    isEditor: isProjectEditor,
    isRestricted,
  } = space;
  const isPublic = !isRestricted;
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");

  const confirm = useContext(ConfirmContext);

  const { projectMetadata, isProjectMetadataLoading } = useProjectMetadata({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const doUpdateMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: space.sId,
  });

  const [projectName, setProjectName] = useState(space.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectDescription, setProjectDescription] = useState(
    projectMetadata?.description ?? ""
  );
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  const form = useForm<PatchProjectMetadataBodyType>({
    resolver: zodResolver(PatchProjectMetadataBodySchema),
    defaultValues: {},
  });

  // Sync form with loaded metadata
  useEffect(() => {
    if (projectMetadata) {
      form.reset({});
      setProjectDescription(projectMetadata.description ?? "");
    }
  }, [projectMetadata, form]);

  const doUpdate = useUpdateSpace({ owner });
  const { mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
  });

  const onSaveName = async () => {
    const newProjectName = projectName.trim();
    if (!newProjectName || newProjectName === space.name.trim()) {
      return;
    }
    const confirmed = await confirm({
      title: "Update project name?",
      message: `The project name will be changed to "${newProjectName}".`,
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const updated = await doUpdate(space, {
      isRestricted,
      memberIds: projectMembers.filter((m) => !m.isEditor).map((m) => m.sId),
      editorIds: projectMembers.filter((m) => m.isEditor).map((m) => m.sId),
      managementMode: "manual",
      name: newProjectName,
    });

    if (updated) {
      await mutateSpaceInfo();
      // Optimistically update the space name in the sidebar without refetching
      void mutateSpaceSummary();
      setIsEditingName(false);
    }
  };

  const onSaveDescription = async () => {
    const confirmed = await confirm({
      title: "Update project description?",
      message: "The project description will be updated.",
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    await doUpdateMetadata({ description: projectDescription });
    setIsEditingDescription(false);
  };

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
        <div className="heading-2xl">Settings</div>
        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Name</div>
          <div className="flex w-full min-w-0 gap-2">
            <Input
              value={projectName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setProjectName(e.target.value);
                setIsEditingName(e.target.value.trim() !== space.name.trim());
              }}
              placeholder="Enter project name"
              containerClassName="flex-1"
            />
            {isEditingName && (
              <>
                <Button label="Save" variant="highlight" onClick={onSaveName} />
                <Button
                  label="Cancel"
                  variant="outline"
                  onClick={() => {
                    setProjectName(space.name);
                    setIsEditingName(false);
                  }}
                />
              </>
            )}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Description</div>
          <div className="flex w-full min-w-0 flex-col gap-2">
            <TextArea
              value={projectDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setProjectDescription(e.target.value);
                setIsEditingDescription(
                  e.target.value !== projectMetadata?.description
                );
              }}
              placeholder={
                isProjectMetadataLoading
                  ? "Loading..."
                  : "Describe what this project is about..."
              }
              disabled={isProjectMetadataLoading}
              minRows={3}
              resize="vertical"
              className="flex-1"
            />
            {isEditingDescription && (
              <div className="flex gap-2">
                <Button
                  label="Save"
                  variant="highlight"
                  onClick={onSaveDescription}
                />
                <Button
                  label="Cancel"
                  variant="outline"
                  onClick={() => {
                    setProjectDescription(projectMetadata?.description ?? "");
                    setIsEditingDescription(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <h3 className="heading-lg">Visibility</h3>
          <div className="flex items-center justify-between gap-4 border-y border-border py-4">
            <div className="flex flex-col">
              <div className="heading-sm text-foreground dark:text-foreground-night">
                Open to everyone
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
          {isProjectEditor && onOpenMembersPanel && (
            <Button
              label="Manage"
              variant="outline"
              icon={UserGroupIcon}
              onClick={onOpenMembersPanel}
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
