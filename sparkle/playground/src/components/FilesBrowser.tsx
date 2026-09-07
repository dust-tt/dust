import {
  ActionFrame,
  AnimatedText,
  Avatar,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CheckDone01,
  CloudArrowLeftRight,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EmptyCTA,
  File02,
  Folder,
  Icon,
  List,
  Plus,
  SearchInput,
  Table,
  Trash01,
  UploadCloud02,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { type DragEvent, useEffect, useMemo, useState } from "react";

import {
  getDataSourceChildren,
  getDataSourceIcon,
  getDataSourcesInFolderTree,
  getFolderPath,
  getItemTypeLabel,
  isDataSourceFolder,
  sortDataSourcesForDisplay,
} from "../data/dataSources";
import type { DataSource } from "../data/types";
import { getUserById } from "../data/users";
import { Breadcrumbs, type BreadcrumbsItem } from "./BreadcrumbsDnd";
import { DataTable } from "./DataTableDnd";

// Shared files browser: one toolbar row (search stretches, view selection,
// Create on the right) above the responsive files table. Used by the pod
// Files tab (folders, drag & drop, reveal) and by the conversation "Files"
// panel (flat list of the conversation's files).

/** Pod-only drag & drop integration; omit it for a static, flat browser. */
export interface FilesBrowserDnd {
  draggingFileId: string | null;
  dropHoverTargetId: string | null;
  onDragOverTarget: (targetId: string, event: DragEvent<HTMLElement>) => void;
  onDropOnTarget: (
    targetId: string,
    targetParentId: string | null,
    event: DragEvent<HTMLElement>
  ) => void;
  onFileDragStart: (
    fileId: string,
    fileName: string,
    event: DragEvent<HTMLTableRowElement>
  ) => void;
  onFileDragEnd: () => void;
}

interface FilesBrowserProps {
  dataSources: DataSource[];
  onFileOpen: (dataSource: DataSource) => void;
  onDeleteFile: (fileId: string) => void;
  /** Folder navigation + breadcrumbs; off for flat lists (conversations). */
  foldersEnabled?: boolean;
  emptyMessage?: string;
  onAddFileToTopbar?: (fileId: string) => void;
  dnd?: FilesBrowserDnd;
  /** Controlled search/folder (pod: steered by universal search + reveal). */
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
  currentFolderId?: string | null;
  onCurrentFolderIdChange?: (folderId: string | null) => void;
  /** Row to highlight (pod "reveal in files" flow). */
  revealedFileId?: string | null;
  onClearRevealedFile?: () => void;
}

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function CreateFilesMenu() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" icon={Plus} label="Create" isSelect />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={File02} label="Doc" onClick={() => {}} />
        <DropdownMenuItem icon={Table} label="Spreadsheet" onClick={() => {}} />
        <DropdownMenuItem icon={ActionFrame} label="Frame" onClick={() => {}} />
        <DropdownMenuItem icon={Folder} label="Folder" onClick={() => {}} />
        <DropdownMenuItem
          icon={UploadCloud02}
          label="Upload File"
          onClick={() => {}}
        />
        <DropdownMenuItem
          icon={CloudArrowLeftRight}
          label="From Company data"
          onClick={() => {}}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilesBrowser({
  dataSources,
  onFileOpen,
  onDeleteFile,
  foldersEnabled = true,
  emptyMessage = "No files yet.",
  onAddFileToTopbar,
  dnd,
  searchText: controlledSearchText,
  onSearchTextChange,
  currentFolderId: controlledFolderId,
  onCurrentFolderIdChange,
  revealedFileId = null,
  onClearRevealedFile,
}: FilesBrowserProps) {
  // Search and folder are controlled when the parent needs to steer them
  // (pod universal search, reveal-in-files), internal otherwise.
  const [internalSearchText, setInternalSearchText] = useState("");
  const searchText = controlledSearchText ?? internalSearchText;
  const setSearchText = onSearchTextChange ?? setInternalSearchText;

  const [internalFolderId, setInternalFolderId] = useState<string | null>(null);
  const currentFolderId = foldersEnabled
    ? (controlledFolderId ?? internalFolderId)
    : null;
  const setCurrentFolderId = onCurrentFolderIdChange ?? setInternalFolderId;

  // "grid" only swaps the selector's icon — grid rendering is not implemented
  // in this sandbox; the table renders either way.
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchScope, setSearchScope] = useState<"folder" | "all">("folder");
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);

  useEffect(() => {
    setSearchScope("folder");
  }, [currentFolderId]);

  const isSearchActive = searchText.trim().length > 0;

  const currentFolder = useMemo(
    () =>
      currentFolderId
        ? dataSources.find((item) => item.id === currentFolderId)
        : undefined,
    [currentFolderId, dataSources]
  );

  // ── Breadcrumbs (folders mode) ────────────────────────────────────────────
  const folderBreadcrumbItems = useMemo((): BreadcrumbsItem[] => {
    const path = getFolderPath(dataSources, currentFolderId);
    const isDragActive = !!dnd && dnd.draggingFileId !== null;

    const getDropProps = (
      targetId: string,
      targetParentId: string | null
    ): Pick<
      BreadcrumbsItem,
      "isPulsing" | "isDropHighlight" | "onDragOver" | "onDragLeave" | "onDrop"
    > =>
      dnd
        ? {
            isPulsing: isDragActive,
            isDropHighlight: dnd.dropHoverTargetId === targetId,
            onDragOver: (event) => dnd.onDragOverTarget(targetId, event),
            onDragLeave: (event) => {
              event.preventDefault();
            },
            onDrop: (event) =>
              dnd.onDropOnTarget(targetId, targetParentId, event),
          }
        : {};

    const items: BreadcrumbsItem[] = [
      currentFolderId === null
        ? { label: "Files", icon: Folder }
        : {
            label: "Files",
            icon: Folder,
            onClick: () => {
              setCurrentFolderId(null);
              setSearchText("");
              onClearRevealedFile?.();
            },
            ...getDropProps("root", null),
          },
    ];

    path.forEach((folder, index) => {
      const isLast = index === path.length - 1;
      if (isLast) {
        items.push({ label: folder.fileName, icon: Folder });
        return;
      }

      items.push({
        label: folder.fileName,
        icon: Folder,
        onClick: () => {
          setCurrentFolderId(folder.id);
          onClearRevealedFile?.();
        },
        ...getDropProps(folder.id, folder.id),
      });
    });

    return items;
  }, [
    currentFolderId,
    dataSources,
    dnd,
    onClearRevealedFile,
    setCurrentFolderId,
    setSearchText,
  ]);

  // ── Table rows ────────────────────────────────────────────────────────────
  const visibleItems = useMemo(
    () =>
      sortDataSourcesForDisplay(
        getDataSourceChildren(dataSources, currentFolderId)
      ),
    [dataSources, currentFolderId]
  );

  const tableItems = useMemo(() => {
    const searchLower = searchText.trim().toLowerCase();
    const searchSource =
      searchLower && searchScope === "folder" && currentFolderId
        ? getDataSourcesInFolderTree(dataSources, currentFolderId)
        : dataSources;

    const base = searchLower
      ? sortDataSourcesForDisplay(
          searchSource.filter((dataSource) =>
            dataSource.fileName.toLowerCase().includes(searchLower)
          )
        )
      : visibleItems;

    return base.map((dataSource) => {
      const item = {
        ...dataSource,
        onClick: () => {
          if (isDataSourceFolder(dataSource)) {
            setCurrentFolderId(dataSource.id);
            setSearchText("");
            onClearRevealedFile?.();
            return;
          }

          onFileOpen(dataSource);
          onClearRevealedFile?.();
        },
      };

      if (isSearchActive || !dnd) {
        return {
          ...item,
          isDropHighlight: revealedFileId === dataSource.id,
        };
      }

      if (isDataSourceFolder(dataSource)) {
        return {
          ...item,
          onDragOver: (event: DragEvent<HTMLTableRowElement>) =>
            dnd.onDragOverTarget(dataSource.id, event),
          onDragLeave: (event: DragEvent<HTMLTableRowElement>) => {
            event.preventDefault();
          },
          onDrop: (event: DragEvent<HTMLTableRowElement>) =>
            dnd.onDropOnTarget(dataSource.id, dataSource.id, event),
          isDropHighlight: dnd.dropHoverTargetId === dataSource.id,
        };
      }

      return {
        ...item,
        draggable: true,
        onDragStart: (event: DragEvent<HTMLTableRowElement>) =>
          dnd.onFileDragStart(dataSource.id, dataSource.fileName, event),
        onDragEnd: dnd.onFileDragEnd,
        isDragging: dnd.draggingFileId === dataSource.id,
        isDropHighlight:
          dnd.dropHoverTargetId === dataSource.id ||
          revealedFileId === dataSource.id,
      };
    });
  }, [
    currentFolderId,
    dataSources,
    dnd,
    isSearchActive,
    onClearRevealedFile,
    onFileOpen,
    revealedFileId,
    searchScope,
    searchText,
    setCurrentFolderId,
    setSearchText,
    visibleItems,
  ]);

  // ── Columns (responsive to the table's own width via @container/table) ────
  const columns: ColumnDef<DataSource & { onClick?: () => void }>[] = useMemo(
    () => [
      {
        accessorKey: "fileName",
        header: "File name",
        id: "fileName",
        sortingFn: (rowA, rowB) => {
          const a = rowA.original;
          const b = rowB.original;
          if (a.kind !== b.kind) {
            return a.kind === "folder" ? -1 : 1;
          }
          return a.fileName.localeCompare(b.fileName);
        },
        meta: {
          className: "w-full",
        },
        cell: (info) => {
          const icon = getDataSourceIcon(info.row.original);
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                {icon && <Icon visual={icon} size="sm" />}
                <span>{info.getValue() as string}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "source",
        header: "Source",
        id: "source",
        meta: {
          // Responsive to the table's own width (@container/table), not the
          // window: secondary columns drop as the panel gets narrower.
          className: "w-[84px] hidden @md:table-cell",
        },
        cell: (info) => {
          const source = info.getValue() as DataSource["source"];
          if (source !== "company") {
            return <DataTable.BasicCellContent label="" />;
          }

          return (
            <DataTable.CellContent>
              <Icon
                visual={CloudArrowLeftRight}
                size="sm"
                className="text-muted-foreground"
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "fileType",
        header: "Type",
        id: "fileType",
        sortingFn: (rowA, rowB) =>
          getItemTypeLabel(rowA.original).localeCompare(
            getItemTypeLabel(rowB.original)
          ),
        meta: {
          className: "w-[84px] hidden @md:table-cell",
        },
        cell: (info) => (
          <DataTable.BasicCellContent
            label={getItemTypeLabel(info.row.original)}
          />
        ),
      },
      {
        accessorKey: "createdBy",
        header: "Created by",
        id: "createdBy",
        meta: {
          className: "w-[140px] hidden @sm:table-cell",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="text-sm">{user.fullName}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Last Updated",
        id: "lastUpdated",
        meta: {
          className: "w-[100px] hidden @xs:table-cell",
        },
        cell: (info) => {
          const date = info.getValue() as Date;
          return <DataTable.BasicCellContent label={formatDate(date)} />;
        },
      },
      {
        id: "actions",
        header: "",
        meta: {
          className: "w-12",
        },
        cell: (info) => {
          const dataSource = info.row.original;
          const menuItems = [
            ...(onAddFileToTopbar && dataSource.kind === "file"
              ? [
                  {
                    kind: "item" as const,
                    label: "Add to Topbar",
                    icon: File02,
                    onClick: () => onAddFileToTopbar(dataSource.id),
                  },
                ]
              : []),
            {
              kind: "item" as const,
              label: "Delete",
              icon: Trash01,
              variant: "warning" as const,
              onClick: () => setDeleteFileId(dataSource.id),
            },
          ];

          return <DataTable.MoreButton menuItems={menuItems} />;
        },
      },
    ],
    [onAddFileToTopbar]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (dataSources.length === 0) {
    return <EmptyCTA message={emptyMessage} action={<CreateFilesMenu />} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Toolbar: search stretches, view selection, Create on the right. */}
      <div className="flex items-center gap-2">
        <SearchInput
          name="files-search"
          value={searchText}
          onChange={setSearchText}
          placeholder="Search files..."
          className="flex-1"
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              icon={viewMode === "list" ? CheckDone01 : List}
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={viewMode}
              onValueChange={(value) => {
                if (value === "list" || value === "grid") {
                  setViewMode(value);
                }
              }}
            >
              <DropdownMenuRadioItem
                value="list"
                label="List"
                icon={CheckDone01}
              />
              <DropdownMenuRadioItem value="grid" label="Grid" icon={List} />
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateFilesMenu />
      </div>

      {foldersEnabled && !isSearchActive && currentFolderId !== null && (
        <div className="flex items-center gap-2">
          {dnd && dnd.draggingFileId !== null && (
            <AnimatedText variant="muted" className="text-sm italic">
              Move to
            </AnimatedText>
          )}
          <Breadcrumbs items={folderBreadcrumbItems} size="sm" hasLighterFont />
        </div>
      )}

      {foldersEnabled && isSearchActive && currentFolderId !== null && (
        <ButtonsSwitchList
          key={currentFolderId}
          defaultValue={searchScope}
          size="xs"
          className="w-fit self-start"
          onValueChange={(value) => {
            if (value === "folder" || value === "all") {
              setSearchScope(value);
            }
          }}
        >
          <ButtonsSwitch
            value="folder"
            label={`In ${currentFolder?.fileName ?? "folder"}`}
          />
          <ButtonsSwitch value="all" label="All files" />
        </ButtonsSwitchList>
      )}

      {tableItems.length === 0 && !isSearchActive ? (
        <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border bg-muted-background p-12">
          <p className="text-center text-sm text-muted-foreground">
            This folder is empty.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={tableItems}
          sorting={[{ id: "fileName", desc: false }]}
        />
      )}

      {/* Delete file dialog */}
      <Dialog
        open={deleteFileId !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleteFileId(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {deleteFileId && (
              <div>
                Are you sure you want to delete "
                {dataSources.find((ds) => ds.id === deleteFileId)?.fileName ||
                  "this file"}
                "? This action cannot be undone.
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setDeleteFileId(null),
            }}
            rightButtonProps={{
              label: "Delete",
              variant: "warning",
              onClick: () => {
                if (deleteFileId) {
                  onDeleteFile(deleteFileId);
                }
                setDeleteFileId(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
