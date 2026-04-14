import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { MembersTable } from "@app/components/assistant/conversation/space/about/MembersTable";
import { ConfirmContext } from "@app/components/Confirm";
import { useSpaceConversationsSummary } from "@app/hooks/conversations";
import { useArchiveProject } from "@app/hooks/useArchiveProject";
import { useCheckProjectName } from "@app/lib/swr/projects";
import {
  useProjectMetadata,
  useSpaceInfo,
  useUpdateProjectMetadata,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArchiveIcon,
  ArrowUpOnSquareIcon,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  MoreIcon,
  ScrollArea,
  SearchInput,
  SliderToggle,
  TextArea,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useContext, useEffect, useState } from "react";
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
  const {
    isNameAvailable,
    isChecking: isCheckingName,
    setValue: setNameToCheck,
  } = useCheckProjectName({
    owner,
    whitelistedName: space.name,
  });
  const nameNotAvailable =
    projectName.trim().length > 0 && !isCheckingName && !isNameAvailable;
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
  const { mutateSpaceInfoRegardlessOfQueryParams } = useSpaceInfo({
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

    const updated = await doUpdate(
      space,
      {
        isRestricted,
        memberIds: projectMembers.filter((m) => !m.isEditor).map((m) => m.sId),
        editorIds: projectMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: newProjectName,
      },
      {
        title: "Successfully updated project name",
        description: "Project name was successfully updated.",
      }
    );

    if (updated) {
      await mutateSpaceInfoRegardlessOfQueryParams();
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

  const { archiveProject, unarchiveProject } = useArchiveProject({
    owner,
    spaceId: space.sId,
  });

  const handleArchiveToggle = useCallback(async () => {
    if (projectMetadata?.archivedAt) {
      await unarchiveProject();
    } else {
      await archiveProject();
    }
  }, [archiveProject, unarchiveProject, projectMetadata?.archivedAt]);

  const handleVisibilityToggle = useCallback(async () => {
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

    const updated = await doUpdate(
      space,
      {
        isRestricted: !newIsPublic,
        memberIds: projectMembers.filter((m) => !m.isEditor).map((m) => m.sId),
        editorIds: projectMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: space.name,
      },
      {
        title: "Successfully updated project visibility",
        description: "Project visibility was successfully updated.",
      }
    );

    if (updated) {
      await mutateSpaceInfoRegardlessOfQueryParams();
    }
  }, [
    confirm,
    doUpdate,
    isPublic,
    projectMembers,
    space,
    mutateSpaceInfoRegardlessOfQueryParams,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-8">
        <div className="flex gap-2">
          <h2 className="heading-2xl flex-1 text-foreground dark:text-foreground-night">
            Settings
          </h2>
          {isProjectEditor && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" icon={MoreIcon} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {projectMetadata?.archivedAt ? (
                  <DropdownMenuItem
                    icon={ArrowUpOnSquareIcon}
                    label="Unarchive project"
                    onClick={handleArchiveToggle}
                  />
                ) : (
                  <DropdownMenuItem
                    icon={ArchiveIcon}
                    label="Archive project"
                    variant="warning"
                    onClick={handleArchiveToggle}
                  />
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {space.archivedAt && (
          <ContentMessage variant="info" size="lg">
            This project has been archived.
          </ContentMessage>
        )}
        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Name</div>
          <div className="flex w-full min-w-0 gap-2">
            <Input
              value={projectName}
              disabled={!isProjectEditor}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setProjectName(e.target.value);
                setNameToCheck(e.target.value);
                setIsEditingName(e.target.value.trim() !== space.name.trim());
              }}
              placeholder="Enter project name"
              containerClassName="flex-1"
            />
            {isEditingName && (
              <>
                <Button
                  label="Save"
                  variant="highlight"
                  onClick={onSaveName}
                  disabled={nameNotAvailable || isCheckingName}
                />
                <Button
                  label="Cancel"
                  variant="outline"
                  onClick={() => {
                    setProjectName(space.name);
                    setNameToCheck("");
                    setIsEditingName(false);
                  }}
                />
              </>
            )}
          </div>
          {isEditingName && nameNotAvailable && (
            <div className="text-xs text-warning-500">
              A project or space with this name already exists.
            </div>
          )}
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
              disabled={isProjectMetadataLoading || !isProjectEditor}
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

        <div className="flex flex-col gap-3">
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
              <ScrollArea className="h-full" orientation="horizontal">
                <MembersTable
                  owner={owner}
                  space={space}
                  selectedMembers={projectMembers}
                  searchSelectedMembers={searchSelectedMembers}
                  isEditor={isProjectEditor}
                  mutateSpaceInfo={() =>
                    mutateSpaceInfoRegardlessOfQueryParams()
                  }
                />
              </ScrollArea>
            </>
          )}
        </div>

        {isProjectEditor && (
          <div className="flex w-full flex-col gap-3 border-t border-border pt-8 dark:border-border-night">
            <h3 className="heading-lg">Danger Zone</h3>
            <h4 className="heading-base">Archive</h4>
            {projectMetadata?.archivedAt ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground dark:text-foreground-night">
                  Archived on{" "}
                  <span className="font-medium">
                    {formatTimestampToFriendlyDate(
                      projectMetadata.archivedAt,
                      "short"
                    )}
                  </span>
                  .
                </p>
                <Button
                  icon={ArrowUpOnSquareIcon}
                  variant="outline"
                  label="Unarchive"
                  onClick={handleArchiveToggle}
                  className="w-fit"
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  This project will be removed from the sidebar. Its data stays
                  intact and can still be used as a data source.
                </p>
                <Button
                  icon={ArchiveIcon}
                  variant="warning-secondary"
                  label="Archive"
                  onClick={handleArchiveToggle}
                  className="w-fit"
                />
              </>
            )}
            <h4 className="heading-base">Delete</h4>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              This permanently removes all content—conversations, folders,
              websites, and data sources. Assistants using this project's tools
              will be impacted. This cannot be undone.
            </p>
            <DeleteSpaceDialog owner={owner} space={space} />
          </div>
        )}
      </div>
    </div>
  );
}
