import {
  MemberSelectionTable,
  type SearchMemberWithWorkspaceType,
} from "@app/components/members/MemberSelectionTable";
import { MembersList } from "@app/components/members/MembersList";
import { useEditors, useUpdateEditors } from "@app/lib/swr/agent_editors";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { Button, Users01 } from "@dust-tt/sparkle";
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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEditorIds, setSelectedEditorIds] = useState<Set<string>>(
    new Set()
  );
  const updateEditors = useUpdateEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const { editors, isEditorsLoading, isEditorsError } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  const isCurrentUserEditor =
    editors.findIndex((u) => u.sId === user.sId) !== -1;

  const currentEditorIds = new Set(editors.map((editor) => editor.sId));
  const addEditorIds = Array.from(selectedEditorIds).filter(
    (editorId) => !currentEditorIds.has(editorId)
  );
  const removeEditorIds = Array.from(currentEditorIds).filter(
    (editorId) => !selectedEditorIds.has(editorId)
  );
  const hasEditorChanges =
    addEditorIds.length > 0 || removeEditorIds.length > 0;

  const onRemoveMember = async (user: SearchMemberWithWorkspaceType) => {
    if (isCurrentUserEditor) {
      await updateEditors({ removeEditorIds: [user.sId], addEditorIds: [] });
    }
  };

  const onSaveEditors = async () => {
    if (!hasEditorChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const didUpdate = await updateEditors({ addEditorIds, removeEditorIds });
      if (didUpdate) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const canManageEditors = agentConfiguration.canEdit || isAdmin(owner);

  if (canManageEditors && isEditing) {
    return (
      <div className="flex flex-col gap-4">
        <MemberSelectionTable
          owner={owner}
          selectedMemberIds={selectedEditorIds}
          onSelectionChange={(editorIds) => {
            setSelectedEditorIds(editorIds);
          }}
          initialMembers={editors}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Cancel"
            disabled={isSaving}
            onClick={() => setIsEditing(false)}
            type="button"
          />
          <Button
            variant="highlight"
            size="sm"
            label="Save"
            disabled={!hasEditorChanges || isSaving}
            isLoading={isSaving}
            onClick={onSaveEditors}
            type="button"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canManageEditors && (
        <div>
          <Button
            variant="outline"
            size="sm"
            icon={Users01}
            label="Manage editors"
            disabled={isEditorsLoading || isEditorsError}
            onClick={() => {
              setSelectedEditorIds(
                new Set(editors.map((editor) => editor.sId))
              );
              setIsEditing(true);
            }}
            type="button"
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
