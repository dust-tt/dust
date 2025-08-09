import { Avatar, SearchInputWithPopover } from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import React, { useCallback, useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { MembersList } from "@app/components/members/MembersList";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useUser } from "@app/lib/swr/user";
import type { UserType } from "@app/types";

const DEFAULT_PAGE_SIZE = 25;

export function EditorsTab() {
  const { owner } = useAgentBuilderContext();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState("");

  const {
    field: { onChange },
  } = useController<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  const editors = useWatch<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  const { members: workspaceMembers, isLoading: isWorkspaceMembersLoading } =
    useSearchMembers({
      workspaceId: owner.sId,
      searchTerm,
      pageIndex: 0,
      pageSize: 25,
    });

  const onRowClick = useCallback(() => {}, []);
  const onRemoveMember = useCallback(
    (user: UserType) => {
      onChange(editors.filter((u) => u.sId !== user.sId));
    },
    [onChange, editors]
  );

  const onAddEditor = useCallback(
    (user: UserType) => {
      onChange([...editors, user]);
      setSearchTerm("");
    },
    [onChange, editors]
  );

  const membersData = useMemo(
    () => ({
      members:
        editors.map((user) => ({
          ...user,
          workspace: owner,
        })) || [],
      totalMembersCount: editors.length,
      isLoading: false,
      mutateRegardlessOfQueryParams: () => {},
    }),
    [editors, owner]
  );

  const availableMembers = useMemo(
    () =>
      workspaceMembers.filter(
        (member) => !editors.some((editor) => editor.sId === member.sId)
      ),
    [workspaceMembers, editors]
  );

  return (
    <div className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
      <SearchInputWithPopover
        value={searchTerm}
        onChange={setSearchTerm}
        name="search-editors"
        placeholder="Search members to add as editors..."
        open={searchTerm.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setSearchTerm("");
          }
        }}
        isLoading={isWorkspaceMembersLoading}
        items={availableMembers}
        onItemSelect={onAddEditor}
        renderItem={(member, selected) => (
          <div className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-background dark:hover:bg-background-night">
            <Avatar size="sm" visual={member.image} />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                {member.fullName}
              </span>
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {member.email}
              </span>
            </div>
          </div>
        )}
      />

      <MembersList
        currentUser={user}
        membersData={membersData}
        onRowClick={onRowClick}
        onRemoveMemberClick={onRemoveMember}
        showColumns={["name", "email", "remove"]}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}
