import type {
  FilePanelCategory,
  FilePanelRow,
} from "@app/components/assistant/conversation/files_panel/types";
import {
  CATEGORY_CONFIG,
  MIN_FILES_FOR_SEARCH,
} from "@app/components/assistant/conversation/files_panel/utils";
import { useDebounce } from "@app/hooks/useDebounce";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { getFileProcessedUrl } from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Card,
  CardGrid,
  cn,
  Icon,
  ScrollArea,
  SearchInput,
  SpaceClosedIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import moment from "moment";
import { useMemo } from "react";

interface FilesTabProps {
  emptyContent?: React.ReactNode;
  isLoading: boolean;
  owner: LightWorkspaceType;
  rows: FilePanelRow[];
  searchInputName?: string;
}

export function FilesTab({
  emptyContent,
  isLoading,
  owner,
  rows,
  searchInputName = "file-search",
}: FilesTabProps) {
  const {
    inputValue: search,
    debouncedValue: debouncedSearch,
    setValue: setSearch,
  } = useDebounce("", { delay: 200 });

  const filteredRows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) => row.title.toLowerCase().includes(query));
  }, [rows, debouncedSearch]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<FilePanelCategory, FilePanelRow[]>();
    for (const row of filteredRows) {
      const existing = groups.get(row.category);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(row.category, [row]);
      }
    }
    return groups;
  }, [filteredRows]);

  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      emptyContent ?? (
        <div className="p-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
          Conversation attachments & generated content will appear here.
        </div>
      )
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {rows.length > MIN_FILES_FOR_SEARCH && (
        <div className="shrink-0 px-4 pt-4">
          <SearchInput
            name={searchInputName}
            placeholder="Search files..."
            value={search}
            onChange={setSearch}
          />
        </div>
      )}
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-8">
          {CATEGORY_CONFIG.map(({ value, plural }) => {
            const categoryRows = groupedByCategory.get(value);
            if (!categoryRows || categoryRows.length === 0) {
              return null;
            }
            return (
              <div key={value}>
                <SectionLabel>{plural}</SectionLabel>
                <FileCards rows={categoryRows} owner={owner} />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function FileCards({
  rows,
  owner,
}: {
  rows: FilePanelRow[];
  owner: LightWorkspaceType;
}) {
  return (
    <CardGrid>
      {rows.map((row) => {
        if (row.category === "image" && row.fileId) {
          return (
            <Card
              key={row.id ?? row.fileId}
              size="sm"
              variant="primary"
              onClick={row.onClick}
              containerClassName="h-24 overflow-hidden rounded-xl"
              className="overflow-hidden"
            >
              <img
                src={row.thumbnailUrl ?? getFileProcessedUrl(owner, row.fileId)}
                alt={row.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                <div className="flex items-center justify-between gap-2">
                  <Tooltip
                    tooltipTriggerAsChild
                    label={row.title}
                    trigger={
                      <div
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm font-medium text-white",
                          row.isHighlighted && "text-success"
                        )}
                      >
                        {row.title}
                      </div>
                    }
                  />
                  {row.action}
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <div className="text-xs ">
                    {row.subtitle ??
                      (row.date ? `${moment(row.date).fromNow()}` : null)}
                  </div>
                  <div className="flex items-center gap-3">
                    {row.isInProjectContext && (
                      <Tooltip
                        tooltipTriggerAsChild
                        label="Saved to Project"
                        trigger={
                          <span className="inline-flex">
                            <Icon visual={SpaceClosedIcon} size="md" />
                          </span>
                        }
                      />
                    )}
                    <CreatorAvatar row={row} />
                  </div>
                </div>
              </div>
            </Card>
          );
        }

        const FileIcon = getFileTypeIcon(row.contentType, row.title);
        return (
          <Card
            key={row.id ?? row.fileId ?? row.title}
            size="sm"
            variant="primary"
            onClick={row.onClick}
          >
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon visual={FileIcon} size="sm" className="shrink-0" />
                <Tooltip
                  tooltipTriggerAsChild
                  label={row.title}
                  trigger={
                    <div
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm font-medium",
                        row.isHighlighted &&
                          "text-success dark:text-success-night"
                      )}
                    >
                      {row.title}
                    </div>
                  }
                />
                {row.action}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {row.subtitle ??
                    (row.date ? `${moment(row.date).fromNow()}` : null)}
                </div>
                <div className="flex items-center gap-3">
                  {row.isInProjectContext && (
                    <Tooltip
                      tooltipTriggerAsChild
                      label="Saved to Project"
                      trigger={
                        <span className="inline-flex">
                          <Icon
                            visual={SpaceClosedIcon}
                            size="md"
                            className="text-muted-foreground dark:text-muted-foreground-night"
                          />
                        </span>
                      }
                    />
                  )}
                  <CreatorAvatar row={row} />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </CardGrid>
  );
}

function CreatorAvatar({ row }: { row: FilePanelRow }) {
  if (row.creator) {
    return (
      <Tooltip
        tooltipTriggerAsChild
        label={row.creator.name}
        trigger={
          <span className="inline-flex">
            <Avatar
              size="xs"
              visual={row.creator.pictureUrl || undefined}
              name={row.creator.name}
              isRounded={row.creator.type === "user"}
            />
          </span>
        }
      />
    );
  }

  return null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="heading-sm pb-2 text-foreground dark:text-foreground-night">
      {children}
    </div>
  );
}
