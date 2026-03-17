import type { FilePanelCategory } from "@app/components/assistant/conversation/files_panel/types";
import {
  CATEGORY_CONFIG,
  getCategoryFromContentType,
  MIN_FILES_FOR_SEARCH,
} from "@app/components/assistant/conversation/files_panel/utils";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useDebounce } from "@app/hooks/useDebounce";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileProcessedUrl,
  getSandboxFileDownloadUrl,
} from "@app/lib/swr/files";
import type { SandboxFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/sandbox/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Card,
  CardGrid,
  Icon,
  ScrollArea,
  SearchInput,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import moment from "moment";
import { useMemo } from "react";

function getSandboxFileImageUrl(
  owner: LightWorkspaceType,
  conversationId: string,
  entry: SandboxFileEntry
): string {
  if (entry.fileId) {
    return getFileProcessedUrl(owner, entry.fileId);
  }
  return getSandboxFileDownloadUrl(owner, conversationId, entry.path);
}

interface SandboxTabProps {
  conversationId: string;
  disabled?: boolean;
  owner: LightWorkspaceType;
  onFileClick: (entry: SandboxFileEntry) => void;
}

export function SandboxTab({
  conversationId,
  disabled,
  owner,
  onFileClick,
}: SandboxTabProps) {
  const { sandboxFiles, isSandboxFilesLoading } = useConversationSandboxFiles({
    conversationId,
    owner,
    options: { disabled },
  });

  const {
    inputValue: search,
    debouncedValue: debouncedSearch,
    setValue: setSearch,
  } = useDebounce("", { delay: 200 });

  const files = useMemo(
    () =>
      sandboxFiles.filter(
        (f) =>
          !f.fileName.startsWith(".") && f.contentType !== "inode/directory"
      ),
    [sandboxFiles]
  );

  const filteredFiles = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) {
      return files;
    }
    return files.filter((f) => f.fileName.toLowerCase().includes(query));
  }, [files, debouncedSearch]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<FilePanelCategory, SandboxFileEntry[]>();
    for (const file of filteredFiles) {
      const category = getCategoryFromContentType(file.contentType);
      const existing = groups.get(category);
      if (existing) {
        existing.push(file);
      } else {
        groups.set(category, [file]);
      }
    }
    return groups;
  }, [filteredFiles]);

  if (isSandboxFilesLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
        No files in the sandbox yet.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {files.length > MIN_FILES_FOR_SEARCH && (
        <div className="shrink-0 px-4 pt-4">
          <SearchInput
            name="sandbox-search"
            placeholder="Search files..."
            value={search}
            onChange={setSearch}
          />
        </div>
      )}
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-8">
          {CATEGORY_CONFIG.map(({ value, label }) => {
            const categoryFiles = groupedByCategory.get(value);
            if (!categoryFiles || categoryFiles.length === 0) {
              return null;
            }
            return (
              <div key={value}>
                <div className="heading-sm pb-2 text-foreground dark:text-foreground-night">
                  {label}
                </div>
                <CardGrid>
                  {categoryFiles.map((entry) => {
                    if (value === "image") {
                      return (
                        <Card
                          key={entry.path}
                          size="sm"
                          variant="primary"
                          onClick={() => onFileClick(entry)}
                          containerClassName="h-24 overflow-hidden rounded-xl"
                          className="overflow-hidden"
                        >
                          <img
                            src={getSandboxFileImageUrl(
                              owner,
                              conversationId,
                              entry
                            )}
                            alt={entry.fileName}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                            <Tooltip
                              tooltipTriggerAsChild
                              label={entry.fileName}
                              trigger={
                                <div className="truncate text-sm font-medium text-white">
                                  {entry.fileName}
                                </div>
                              }
                            />
                            <div className="text-xs text-white/70">
                              {entry.lastModifiedMs
                                ? moment(entry.lastModifiedMs).fromNow()
                                : null}
                            </div>
                          </div>
                        </Card>
                      );
                    }

                    const FileIcon = getFileTypeIcon(
                      entry.contentType,
                      entry.fileName
                    );
                    return (
                      <Card
                        key={entry.path}
                        size="sm"
                        variant="primary"
                        onClick={() => onFileClick(entry)}
                      >
                        <div className="flex w-full flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <Icon
                              visual={FileIcon}
                              size="sm"
                              className="shrink-0"
                            />
                            <Tooltip
                              tooltipTriggerAsChild
                              label={entry.fileName}
                              trigger={
                                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                                  {entry.fileName}
                                </div>
                              }
                            />
                          </div>
                          <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                            {entry.lastModifiedMs
                              ? moment(entry.lastModifiedMs).fromNow()
                              : null}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </CardGrid>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
