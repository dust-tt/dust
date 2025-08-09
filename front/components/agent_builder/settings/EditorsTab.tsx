import {
  Avatar,
  Button,
  Chip,
  DataTable,
  SearchInput,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
} from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { UserType } from "@app/types";

const DEFAULT_PAGE_SIZE = 25;

type RowData = {
  sId: string;
  fullName: string;
  email: string;
  image: string;
  isEditor: boolean;
  onToggleEditor: () => void;
  onClick?: () => void;
};

export function EditorsTab() {
  const { owner } = useAgentBuilderContext();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);

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

  const editorsTableData = useMemo(() => {
    return (editors || []).map(
      (editor): RowData => ({
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
      (member): RowData => ({
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

  // Show spinner during transition between search and editors
  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 250);
    return () => clearTimeout(timer);
  }, [showSearchResults]);

  // Show spinner if we're transitioning OR if search is loading (when searching)
  const shouldShowSpinner =
    isTransitioning || (showSearchResults && isWorkspaceMembersLoading);

  const columns: ColumnDef<RowData>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        accessorKey: "fullName",
        cell: (info: CellContext<RowData, any>) => (
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
        cell: (info: CellContext<RowData, any>) => (
          <DataTable.CellContent>
            {info.row.original.email}
          </DataTable.CellContent>
        ),
      },
      {
        id: "action",
        header: "",
        cell: (info: CellContext<RowData, any>) => (
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

        {shouldShowSpinner ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : (
          <DataTable
            key={showSearchResults ? "search" : "editors"}
            data={currentData}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
          />
        )}
      </div>
    </div>
  );
}
