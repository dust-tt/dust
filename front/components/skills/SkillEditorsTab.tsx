import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import type {
  SearchMemberType,
  SearchMemberWithWorkspaceType,
} from "@app/components/members/MemberSelectionTable";
import { MembersList } from "@app/components/members/MembersList";
import {
  useSkillEditors,
  useUpdateSkillEditors,
} from "@app/lib/swr/skill_editors";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button, Users01 } from "@dust-tt/sparkle";
import { useState } from "react";

type AgentEditorsTabProps = {
  owner: WorkspaceType;
  user: UserType;
  skill: SkillWithRelationsType;
};

export function SkillEditorsTab({ owner, user, skill }: AgentEditorsTabProps) {
  const [isManageEditorsOpen, setIsManageEditorsOpen] = useState(false);
  const updateEditors = useUpdateSkillEditors({
    owner,
    skillId: skill.sId,
  });
  const { editors, isEditorsLoading, isEditorsError } = useSkillEditors({
    owner,
    skillId: skill.sId,
  });

  const isCurrentUserEditor =
    editors.findIndex((u) => u.sId === user.sId) !== -1;

  const onRemoveMember = async (user: SearchMemberWithWorkspaceType) => {
    if (isCurrentUserEditor) {
      await updateEditors({ removeEditorIds: [user.sId], addEditorIds: [] });
    }
  };

  const onEditorsChange = async (newEditors: SearchMemberType[]) => {
    const currentEditorIds = new Set(editors.map((editor) => editor.sId));
    const newEditorIds = new Set(newEditors.map((editor) => editor.sId));
    const addEditorIds = Array.from(newEditorIds).filter(
      (editorId) => !currentEditorIds.has(editorId)
    );
    const removeEditorIds = Array.from(currentEditorIds).filter(
      (editorId) => !newEditorIds.has(editorId)
    );

    if (addEditorIds.length === 0 && removeEditorIds.length === 0) {
      return;
    }

    await updateEditors({ addEditorIds, removeEditorIds });
  };

  return (
    <div className="flex flex-col gap-4">
      {skill.canAdministrate && (
        <div>
          <Button
            variant="outline"
            size="sm"
            icon={Users01}
            label="Manage editors"
            disabled={isEditorsLoading || isEditorsError}
            onClick={() => setIsManageEditorsOpen(true)}
            type="button"
          />
          <ManageUsersPanel
            isOpen={isManageEditorsOpen}
            setIsOpen={setIsManageEditorsOpen}
            owner={owner}
            mode="editors-only"
            editors={editors}
            onEditorsChange={onEditorsChange}
          />
        </div>
      )}
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
        showColumns={isCurrentUserEditor ? ["name", "remove"] : ["name"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />
    </div>
  );
}
