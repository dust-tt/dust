import { AddEditorDropdown } from "@app/components/members/AddEditorsDropdown";
import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { MembersList } from "@app/components/members/MembersList";
import {
  useSkillEditors,
  useUpdateSkillEditors,
} from "@app/lib/swr/skill_editors";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import { editorUserSchema } from "@app/types/editors";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button, Plus } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const editorsFormSchema = z.object({
  editors: z.array(editorUserSchema),
});

type EditorsFormData = z.infer<typeof editorsFormSchema>;

type AgentEditorsTabProps = {
  owner: WorkspaceType;
  user: UserType;
  skill: SkillWithRelationsType;
};

export function SkillEditorsTab({ owner, user, skill }: AgentEditorsTabProps) {
  const updateEditors = useUpdateSkillEditors({
    owner,
    skillId: skill.sId,
  });
  const { editors, isEditorsLoading, isEditorsError } = useSkillEditors({
    owner,
    skillId: skill.sId,
  });

  const formValues = useMemo<EditorsFormData>(() => ({ editors }), [editors]);
  const form = useForm<EditorsFormData>({
    defaultValues: { editors: [] },
    values: formValues,
    resetOptions: { keepDirtyValues: true },
    resolver: zodResolver(editorsFormSchema),
  });
  const { field: editorsField } = useController({
    control: form.control,
    name: "editors",
  });
  const selectedEditors = editorsField.value;
  const persistedEditorIds = new Set(editors.map((editor) => editor.sId));
  const hasChanges =
    editors.length !== selectedEditors.length ||
    selectedEditors.some((editor) => !persistedEditorIds.has(editor.sId));

  const onRemoveMember = (user: SearchMemberWithWorkspaceType) => {
    if (!skill.canAdministrate || form.formState.isSubmitting) {
      return;
    }

    editorsField.onChange(
      selectedEditors.filter((editor) => editor.sId !== user.sId)
    );
  };

  const onAddEditor = (editor: SearchMemberWithWorkspaceType) => {
    if (
      form.formState.isSubmitting ||
      selectedEditors.some((selected) => selected.sId === editor.sId)
    ) {
      return;
    }

    editorsField.onChange([...selectedEditors, editor]);
  };

  const onSave = form.handleSubmit(async ({ editors: nextEditors }) => {
    if (!hasChanges) {
      return;
    }

    const nextEditorIds = new Set(nextEditors.map((editor) => editor.sId));
    const didUpdate = await updateEditors({
      addEditorIds: nextEditors
        .filter((editor) => !persistedEditorIds.has(editor.sId))
        .map((editor) => editor.sId),
      removeEditorIds: editors
        .filter((editor) => !nextEditorIds.has(editor.sId))
        .map((editor) => editor.sId),
    });
    if (didUpdate) {
      form.reset({ editors: nextEditors });
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Editors</h3>
        {skill.canAdministrate && (
          <AddEditorDropdown
            owner={owner}
            editors={selectedEditors}
            onAddEditor={onAddEditor}
            trigger={
              <Button
                variant="outline"
                size="sm"
                icon={Plus}
                label="Add editors"
                disabled={
                  isEditorsLoading ||
                  isEditorsError ||
                  form.formState.isSubmitting
                }
                type="button"
              />
            }
          />
        )}
      </div>
      <MembersList
        currentUser={user}
        membersData={{
          members: selectedEditors.map((user) => ({
            ...user,
            workspace: owner,
          })),
          isLoading: isEditorsLoading,
          totalMembersCount: selectedEditors.length,
          mutateRegardlessOfQueryParams: () => Promise.resolve(undefined),
        }}
        showColumns={["name", "remove"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />
      {skill.canAdministrate && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Cancel"
            disabled={!hasChanges || form.formState.isSubmitting}
            onClick={() => form.reset(formValues)}
            type="button"
          />
          <Button
            variant="highlight"
            size="sm"
            label="Save"
            disabled={!hasChanges || form.formState.isSubmitting}
            isLoading={form.formState.isSubmitting}
            onClick={onSave}
            type="button"
          />
        </div>
      )}
    </div>
  );
}
