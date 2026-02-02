import {
  ActionExternalLinkIcon,
  ActionTrashIcon,
  Button,
  ContentMessage,
  IconButton,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";

import { DeleteSpaceDialog } from "@app/components/assistant/conversation/space/about/DeleteSpaceDialog";
import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
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
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";

interface ProjectUrlsSectionProps {
  disabled?: boolean;
}

function ProjectUrlsSection({ disabled }: ProjectUrlsSectionProps) {
  const { control } = useFormContext<PatchProjectMetadataBodyType>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "urls",
  });

  const [newUrlName, setNewUrlName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const handleAddUrl = useCallback(() => {
    if (!newUrlName.trim() || !newUrl.trim()) {
      return;
    }
    append({ name: newUrlName.trim(), url: newUrl.trim() });
    setNewUrlName("");
    setNewUrl("");
  }, [newUrlName, newUrl, append]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddUrl();
      }
    },
    [handleAddUrl]
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          URLs
        </h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Add relevant links for this project
        </p>
      </div>

      {fields.length > 0 && (
        <div className="flex flex-col gap-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <BaseFormFieldSection fieldName={`urls.${index}.name`}>
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    placeholder="URL name"
                    disabled={disabled}
                    className="w-48"
                    message={errorMessage}
                    messageStatus={errorMessage ? "error" : "default"}
                    onChange={onChange}
                    {...registerProps}
                  />
                )}
              </BaseFormFieldSection>

              <BaseFormFieldSection fieldName={`urls.${index}.url`}>
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    type="url"
                    placeholder="URL"
                    disabled={disabled}
                    className="flex-1"
                    message={errorMessage}
                    messageStatus={errorMessage ? "error" : "default"}
                    onChange={onChange}
                    {...registerProps}
                  />
                )}
              </BaseFormFieldSection>

              <IconButton
                icon={ActionExternalLinkIcon}
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(field.url, "_blank", "noopener noreferrer");
                }}
                disabled={disabled ?? !field.url.trim()}
                tooltip="Open URL"
              />

              <IconButton
                icon={ActionTrashIcon}
                variant="outline"
                size="sm"
                onClick={() => remove(index)}
                disabled={disabled}
                tooltip="Remove URL"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <Input
          placeholder="URL name (e.g. Documentation)"
          value={newUrlName}
          onChange={(e) => setNewUrlName(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-48"
        />
        <Input
          placeholder="URL (e.g. example.com)"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          label="Add"
          onClick={handleAddUrl}
          disabled={!newUrlName.trim() || !newUrl.trim() || disabled}
        />
      </div>
    </div>
  );
}

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

    if (planAllowsSCIM && managementType === "group") {
      await doUpdate(space, {
        isRestricted,
        groupIds: selectedGroups.map((group) => group.sId),
        editorGroupIds: [], // todo(projects): handle editor groups in the UI
        managementMode: "group",
        name: space.name,
      });
    } else {
      await doUpdate(space, {
        isRestricted,
        memberIds: selectedMembers.map((member) => member.sId),
        editorIds: [], // todo(projects): handle editors in the UI
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
