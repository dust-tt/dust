import {
  Avatar,
  Button,
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
import React, { useCallback, useMemo, useState } from "react";
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
      pageSize: 100,
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

  const tableData = useMemo(() => {
    const editorsSet = new Set((editors || []).map((e) => e.sId));
    const allMembers = workspaceMembers || [];

    const memberMap = new Map<string, RowData>();

    (editors || []).forEach((editor) => {
      memberMap.set(editor.sId, {
        sId: editor.sId,
        fullName: editor.fullName,
        email: editor.email,
        image: editor.image || "",
        isEditor: true,
        onToggleEditor: () => onRemoveEditor(editor),
      });
    });

    allMembers.forEach((member) => {
      if (!memberMap.has(member.sId)) {
        memberMap.set(member.sId, {
          sId: member.sId,
          fullName: member.fullName,
          email: member.email,
          image: member.image || "",
          isEditor: editorsSet.has(member.sId),
          onToggleEditor: editorsSet.has(member.sId)
            ? () => onRemoveEditor(member)
            : () => onAddEditor(member),
        });
      }
    });

    return Array.from(memberMap.values());
  }, [workspaceMembers, editors, onRemoveEditor, onAddEditor]);

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
        meta: {
          sizeRatio: 20,
        },
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
        meta: {
          sizeRatio: 70,
        },
      },
      {
        id: "action",
        header: "",
        cell: (info: CellContext<RowData, any>) => (
          <DataTable.CellContent className="flex justify-end pr-1">
            {info.row.original.isEditor ? (
              <Button
                size="xs"
                variant="ghost"
                icon={XMarkIcon}
                onClick={info.row.original.onToggleEditor}
              />
            ) : (
              <Button
                size="xs"
                variant="outline"
                label="Add"
                onClick={info.row.original.onToggleEditor}
              />
            )}
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 10,
        },
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        name="search-editors"
        placeholder="Search members to add as editors..."
        isLoading={isWorkspaceMembersLoading}
      />

      {isWorkspaceMembersLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : (
        <DataTable
          data={tableData}
          columns={columns}
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
    </div>
  );
}
