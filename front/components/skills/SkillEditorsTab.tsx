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
  const [isAddingEditor, setIsAddingEditor] = useState(false);
  const [searchText, setSearchText] = useState("");
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

  const editorIds = new Set(editors.map((editor) => editor.sId));

  const onRemoveMember = async (user: SearchMemberWithWorkspaceType) => {
    if (skill.canAdministrate) {
      await updateEditors({ removeEditorIds: [user.sId], addEditorIds: [] });
    }
  };

  const onAddEditor = async (editorId: string) => {
    if (isAddingEditor || editorIds.has(editorId)) {
      return;
    }

    setIsEditorPickerOpen(false);
    setSearchText("");
    setIsAddingEditor(true);
    try {
      await updateEditors({ addEditorIds: [editorId], removeEditorIds: [] });
    } finally {
      setIsAddingEditor(false);
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
                label="Add editor"
                disabled={isEditorsLoading || isEditorsError}
                isLoading={isAddingEditor}
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
                    disabled={editorIds.has(member.sId)}
                    onClick={() => void onAddEditor(member.sId)}
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
          members: editors.map((user) => ({
            ...user,
            workspace: owner,
          })),
          isLoading: isEditorsLoading,
          totalMembersCount: editors.length,
          mutateRegardlessOfQueryParams: () => Promise.resolve(undefined),
        }}
        showColumns={skill.canAdministrate ? ["name", "remove"] : ["name"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />
    </div>
  );
}
