import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { MembersList } from "@app/components/members/MembersList";
import { useSearchMembers } from "@app/lib/swr/memberships";
import {
  useSkillEditors,
  useUpdateSkillEditors,
} from "@app/lib/swr/skill_editors";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Plus,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

type AgentEditorsTabProps = {
  owner: WorkspaceType;
  user: UserType;
  skill: SkillWithRelationsType;
};

export function SkillEditorsTab({ owner, user, skill }: AgentEditorsTabProps) {
  const [isEditorPickerOpen, setIsEditorPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [addedEditors, setAddedEditors] = useState<
    SearchMemberWithWorkspaceType[]
  >([]);
  const [removedEditorIds, setRemovedEditorIds] = useState<Set<string>>(
    new Set()
  );
  const updateEditors = useUpdateSkillEditors({
    owner,
    skillId: skill.sId,
  });
  const { editors, isEditorsLoading, isEditorsError } = useSkillEditors({
    owner,
    skillId: skill.sId,
  });
  const { members: workspaceMembers, isLoading: areWorkspaceMembersLoading } =
    useSearchMembers({
      workspaceId: owner.sId,
      searchTerm: searchText,
      pageIndex: 0,
      pageSize: 25,
      disabled: !isEditorPickerOpen,
    });

  const persistedEditorIds = new Set(editors.map((editor) => editor.sId));
  const addedEditorIds = new Set(addedEditors.map((editor) => editor.sId));
  const visibleEditors = [
    ...editors.filter((editor) => !removedEditorIds.has(editor.sId)),
    ...addedEditors.filter((editor) => !persistedEditorIds.has(editor.sId)),
  ];
  const visibleEditorIds = new Set(visibleEditors.map((editor) => editor.sId));
  const addEditorIds = addedEditors
    .map((editor) => editor.sId)
    .filter((editorId) => !persistedEditorIds.has(editorId));
  const removeEditorIds = Array.from(removedEditorIds).filter((editorId) =>
    persistedEditorIds.has(editorId)
  );
  const hasChanges = addEditorIds.length > 0 || removeEditorIds.length > 0;

  const onRemoveMember = (user: SearchMemberWithWorkspaceType) => {
    if (!skill.canAdministrate || isSaving) {
      return;
    }

    if (addedEditorIds.has(user.sId)) {
      setAddedEditors((current) =>
        current.filter((editor) => editor.sId !== user.sId)
      );
      return;
    }

    setRemovedEditorIds((current) => new Set(current).add(user.sId));
  };

  const onAddEditor = (editor: SearchMemberWithWorkspaceType) => {
    if (isSaving || visibleEditorIds.has(editor.sId)) {
      return;
    }

    if (persistedEditorIds.has(editor.sId)) {
      setRemovedEditorIds((current) => {
        const next = new Set(current);
        next.delete(editor.sId);
        return next;
      });
      return;
    }

    setAddedEditors((current) => [...current, editor]);
  };

  const resetChanges = () => {
    setAddedEditors([]);
    setRemovedEditorIds(new Set());
  };

  const onSave = async () => {
    if (!hasChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const didUpdate = await updateEditors({
        addEditorIds,
        removeEditorIds,
      });
      if (didUpdate) {
        resetChanges();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Editors</h3>
        {skill.canAdministrate && (
          <DropdownMenu
            open={isEditorPickerOpen}
            onOpenChange={(open) => {
              setIsEditorPickerOpen(open);
              if (!open) {
                setSearchText("");
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                icon={Plus}
                label="Add editors"
                disabled={isEditorsLoading || isEditorsError || isSaving}
                type="button"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-80"
              align="end"
              dropdownHeaders={
                <>
                  <DropdownMenuSearchbar
                    name="search-editors"
                    placeholder="Search members"
                    value={searchText}
                    onChange={setSearchText}
                  />
                  <DropdownMenuSeparator />
                </>
              }
            >
              {areWorkspaceMembersLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Spinner size="sm" />
                </div>
              ) : workspaceMembers.length > 0 ? (
                workspaceMembers.map((member) => (
                  <DropdownMenuItem
                    key={member.sId}
                    label={member.fullName}
                    description={member.email}
                    icon={() => (
                      <Avatar
                        name={member.fullName}
                        visual={member.image ?? undefined}
                        size="sm"
                        isRounded
                      />
                    )}
                    truncateText
                    disabled={visibleEditorIds.has(member.sId) || isSaving}
                    onClick={() => onAddEditor(member)}
                    onSelect={(event) => event.preventDefault()}
                  />
                ))
              ) : (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  No members found
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <MembersList
        currentUser={user}
        membersData={{
          members: visibleEditors.map((user) => ({
            ...user,
            workspace: owner,
          })),
          isLoading: isEditorsLoading,
          totalMembersCount: visibleEditors.length,
          mutateRegardlessOfQueryParams: () => Promise.resolve(undefined),
        }}
        showColumns={skill.canAdministrate ? ["name", "remove"] : ["name"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />
      {skill.canAdministrate && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Cancel"
            disabled={!hasChanges || isSaving}
            onClick={resetChanges}
            type="button"
          />
          <Button
            variant="highlight"
            size="sm"
            label="Save"
            disabled={!hasChanges || isSaving}
            isLoading={isSaving}
            onClick={onSave}
            type="button"
          />
        </div>
      )}
    </div>
  );
}
