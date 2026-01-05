import { Button, PlusIcon } from "@dust-tt/sparkle";

import { AddEditorDropdown } from "@app/components/members/AddEditorsDropdown";
import { MembersList } from "@app/components/members/MembersList";
import {
  useSkillEditors,
  useUpdateSkillEditors,
} from "@app/lib/swr/skill_editors";
import type {
  UserType,
  UserTypeWithWorkspace,
  WorkspaceType,
} from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

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
  const { editors, isEditorsLoading } = useSkillEditors({
    owner,
    skillId: skill.sId,
  });

  const isCurrentUserEditor =
    editors.findIndex((u) => u.sId === user.sId) !== -1;

  const onRemoveMember = async (user: UserTypeWithWorkspace) => {
    if (isCurrentUserEditor) {
      await updateEditors({ removeEditorIds: [user.sId], addEditorIds: [] });
    }
  };

  const onAddEditor = async (user: UserType) => {
    if (isCurrentUserEditor) {
      await updateEditors({ removeEditorIds: [], addEditorIds: [user.sId] });
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
        showColumns={isCurrentUserEditor ? ["name", "remove"] : ["name"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />

      {isCurrentUserEditor && (
        <div>
          <AddEditorDropdown
            owner={owner}
            editors={editors}
            onAddEditor={onAddEditor}
            trigger={
              <Button label="Add editors" icon={PlusIcon} onClick={() => {}} />
            }
          />
        </div>
      )}
    </div>
  );
}
