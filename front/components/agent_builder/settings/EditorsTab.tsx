import { Avatar, SearchInput, DataTable, Button, Chip } from "@dust-tt/sparkle";
import { XMarkIcon } from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import React, { useCallback, useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { UserType } from "@app/types";

const DEFAULT_PAGE_SIZE = 25;

type MemberRowData = {
  sId: string;
  fullName: string;
  email: string;
  image: string;
  isEditor: boolean;
  onToggleEditor: () => void;
};

export function EditorsTab() {
  const { owner } = useAgentBuilderContext();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
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

  const onRemoveEditor = useCallback(
    (user: UserType) => {
      onChange((editors || []).filter((u) => u.sId !== user.sId));
    },
    [onChange, editors]
  );

  const onAddEditor = useCallback(
    (user: UserType) => {
      onChange([...(editors || []), user]);
    },
    [onChange, editors]
  );

  // Current editors table data
  const editorsTableData = useMemo(() => {
    return (editors || []).map(
      (editor): MemberRowData => ({
        sId: editor.sId,
        fullName: editor.fullName,
        email: editor.email,
        image: editor.image || "",
        isEditor: true,
        onToggleEditor: () => onRemoveEditor(editor),
      })
    );
  }, [editors, onRemoveEditor]);

  // Search results table data (only shown when searching)
  const searchTableData = useMemo(() => {
    if (searchTerm.length === 0) {
      return [];
    }
    return workspaceMembers.map(
      (member): MemberRowData => ({
        sId: member.sId,
        fullName: member.fullName,
        email: member.email,
        image: member.image || "",
        isEditor: (editors || []).some((e) => e.sId === member.sId),
        onToggleEditor: () => onAddEditor(member),
      })
    );
  }, [workspaceMembers, editors, searchTerm.length, onAddEditor]);

  const showSearchResults = searchTerm.length > 0;

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        accessorKey: "fullName",
        cell: (info: CellContext<MemberRowData, string>) => (
          <DataTable.CellContent>
            <div className="flex items-center gap-2">
              <Avatar size="xs" visual={info.row.original.image} />
              {info.row.original.fullName}
            </div>
          </DataTable.CellContent>
        ),
        enableSorting: false,
      },
      {
        id: "email",
        accessorKey: "email",
        header: "Email",
        cell: (info: CellContext<MemberRowData, string>) => (
          <DataTable.CellContent>
            {info.row.original.email}
          </DataTable.CellContent>
        ),
      },
      {
        id: "action",
        header: "",
        cell: (info: CellContext<MemberRowData, string>) => (
          <DataTable.CellContent>
            {showSearchResults ? (
              // In search results: show "Added" chip or "Add" button
              info.row.original.isEditor ? (
                <Chip label="Added" color="green" />
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  label="Add"
                  onClick={info.row.original.onToggleEditor}
                />
              )
            ) : (
              <Button
                size="xs"
                variant="ghost"
                icon={XMarkIcon}
                onClick={info.row.original.onToggleEditor}
              />
            )}
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-32",
        },
      },
    ],
    [showSearchResults]
  );

  const currentData = showSearchResults ? searchTableData : editorsTableData;

  return (
    <div className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        name="search-editors"
        placeholder="Search members to add as editors..."
        isLoading={isWorkspaceMembersLoading}
      />

      <div className="space-y-2">
        <div className="text-sm font-medium">
          {showSearchResults ? "Search Results" : "Current Editors"}
        </div>

        <DataTable
          data={currentData}
          columns={columns}
          pagination={pagination}
          setPagination={setPagination}
        />
      </div>
    </div>
  );
}
