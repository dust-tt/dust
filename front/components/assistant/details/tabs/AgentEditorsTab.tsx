import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { MembersList } from "@app/components/members/MembersList";
import { useEditors, useUpdateEditors } from "@app/lib/swr/agent_editors";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
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
  agentConfiguration: AgentConfigurationType;
};

export function AgentEditorsTab({
  owner,
  user,
  agentConfiguration,
}: AgentEditorsTabProps) {
  const [isEditorPickerOpen, setIsEditorPickerOpen] = useState(false);
  const [isAddingEditor, setIsAddingEditor] = useState(false);
  const [searchText, setSearchText] = useState("");
  const updateEditors = useUpdateEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const { editors, isEditorsLoading, isEditorsError } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const { members: workspaceMembers, isLoading: areWorkspaceMembersLoading } =
    useSearchMembers({
      workspaceId: owner.sId,
      searchTerm: searchText,
      pageIndex: 0,
      pageSize: 25,
      disabled: !isEditorPickerOpen,
    });

  const canManageEditors = agentConfiguration.canEdit || isAdmin(owner);
  const editorIds = new Set(editors.map((editor) => editor.sId));

  const onRemoveMember = async (user: SearchMemberWithWorkspaceType) => {
    if (canManageEditors) {
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
        showColumns={canManageEditors ? ["name", "remove"] : ["name"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />
      {canManageEditors && (
        <div>
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
                disabled={isEditorsLoading || isEditorsError}
                isLoading={isAddingEditor}
                type="button"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-80"
              align="start"
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
        </div>
      )}
    </div>
  );
}
