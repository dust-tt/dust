import {
  Avatar,
  Button,
  DataTable,
  Icon,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  UserGroupIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
} from "@tanstack/react-table";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useController } from "react-hook-form";

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

export function EditorsSheet() {
  const { owner } = useAgentBuilderContext();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [localEditors, setLocalEditors] = useState<UserType[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    field: { onChange, value: editors },
  } = useController<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  useEffect(() => {
    if (isOpen) {
      setLocalEditors([...(editors || [])]);
    }
  }, [editors, isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Small delay to wait for sheet animation to complete
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 200);
    }
  }, [isOpen]);

  const { members: workspaceMembers, isLoading: isWorkspaceMembersLoading } =
    useSearchMembers({
      workspaceId: owner.sId,
      searchTerm,
      pageIndex: 0,
      pageSize: 100,
    });

  const onRemoveEditor = useCallback((user: UserType) => {
    setLocalEditors((prev) => prev.filter((u) => u.sId !== user.sId));
  }, []);

  const onAddEditor = useCallback((user: UserType) => {
    setLocalEditors((prev) => [...prev, user]);
  }, []);

  const onSave = () => {
    onChange(localEditors);
    setIsOpen(false);
  };

  const hasUnsavedChanges = useMemo(() => {
    const currentEditorIds = new Set((editors || []).map((e) => e.sId));
    const localEditorIds = new Set(localEditors.map((e) => e.sId));

    if (currentEditorIds.size !== localEditorIds.size) {
      return true;
    }

    return Array.from(currentEditorIds).some((id) => !localEditorIds.has(id));
  }, [editors, localEditors]);

  const tableData = useMemo(() => {
    const localEditorsSet = new Set(localEditors.map((e) => e.sId));
    const allMembers = workspaceMembers || [];

    const memberMap = new Map<string, RowData>();

    localEditors.forEach((editor) => {
      memberMap.set(editor.sId, {
        sId: editor.sId,
        fullName: editor.fullName,
        email: editor.email,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        image: editor.image || "",
        isEditor: true,
        onToggleEditor: () => onRemoveEditor(editor),
      });
    });

    if (searchTerm) {
      allMembers.forEach((member) => {
        if (!memberMap.has(member.sId)) {
          memberMap.set(member.sId, {
            sId: member.sId,
            fullName: member.fullName,
            email: member.email,
            image: member.image ?? "",
            isEditor: localEditorsSet.has(member.sId),
            onToggleEditor: localEditorsSet.has(member.sId)
              ? () => onRemoveEditor(member)
              : () => onAddEditor(member),
          });
        }
      });
    }

    return Array.from(memberMap.values());
  }, [workspaceMembers, localEditors, onRemoveEditor, onAddEditor, searchTerm]);

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
                tooltip="Remove from editors list"
                onClick={info.row.original.onToggleEditor}
              />
            ) : (
              <Button
                size="xs"
                variant="outline"
                label="Add"
                tooltip="Add to editors list"
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
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={UserGroupIcon}
          label="Editors"
        />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            <div className="flex items-center gap-2">
              <Icon visual={UserGroupIcon} />
              <span>Editors</span>
            </div>
          </SheetTitle>
          <SheetDescription>
            People who can use and edit the agent.
          </SheetDescription>
        </SheetHeader>

        <SheetContainer>
          <div className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
            <div className="flex flex-col gap-3">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onChange={setSearchTerm}
                name="search-editors"
                placeholder="Search members to add as editors..."
                isLoading={isWorkspaceMembersLoading}
              />
            </div>

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
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: onSave,
            disabled: !hasUnsavedChanges,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
