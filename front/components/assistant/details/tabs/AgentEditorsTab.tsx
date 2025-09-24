import { Button, PlusIcon } from "@dust-tt/sparkle";

import { AddEditorDropdown } from "@app/components/members/AddEditorsDropdown";
import { MembersList } from "@app/components/members/MembersList";
import { useEditors, useUpdateEditors } from "@app/lib/swr/editors";
import type {
  AgentConfigurationType,
  UserType,
  UserTypeWithWorkspace,
  WorkspaceType,
} from "@app/types";

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
  const updateEditors = useUpdateEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const { editors, isEditorsLoading } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
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
