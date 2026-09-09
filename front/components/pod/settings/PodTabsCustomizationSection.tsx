import { isCustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  DEFAULT_POD_FILE_TAB_ICON,
  MAX_POD_FILE_TAB_TITLE_LENGTH,
} from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionIcons,
  Button,
  ChevronSelectorVertical,
  cn,
  Icon,
  IconPicker,
  Input,
  ListGroup,
  ListItem,
  Plus,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  XClose,
} from "@dust-tt/sparkle";
import type { DragEvent } from "react";
import { useState } from "react";

const POD_TAB_DRAG_MIME = "application/x-dust-pod-tab-path";

interface PodTabsCustomizationSectionProps {
  owner: LightWorkspaceType;
  podId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
}

function isTabReorderDrag(event: DragEvent) {
  return event.dataTransfer.types.includes(POD_TAB_DRAG_MIME);
}

export function PodTabsCustomizationSection({
  owner,
  podId,
  fileTabs,
  tabsOrder,
  isEditor,
}: PodTabsCustomizationSectionProps) {
  const { orderedFileTabs, updateFileTab, removeFileTab, reorderFileTab } =
    usePodFileTabs({
      owner,
      podId,
      fileTabs,
      tabsOrder,
      isEditor,
    });

  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [iconPickerPath, setIconPickerPath] = useState<string | null>(null);
  const [editingTitlePath, setEditingTitlePath] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  const handleDragStart = (path: string, event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(POD_TAB_DRAG_MIME, path);
    event.dataTransfer.effectAllowed = "move";
    setDraggingPath(path);
  };

  const handleDragEnd = () => {
    setDraggingPath(null);
    setDropTargetPath(null);
  };

  const handleDragOver = (path: string, event: DragEvent<HTMLDivElement>) => {
    if (!isTabReorderDrag(event) || draggingPath === path) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetPath(path);
  };

  const handleDrop = (path: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const draggedPath = event.dataTransfer.getData(POD_TAB_DRAG_MIME);
    if (draggedPath) {
      void reorderFileTab(draggedPath, path);
    }
    handleDragEnd();
  };

  const startTitleEdit = (tab: PodFileTab) => {
    if (!isEditor) {
      return;
    }
    setEditingTitlePath(tab.path);
    setEditingTitleValue(tab.title);
  };

  const cancelTitleEdit = () => {
    setEditingTitlePath(null);
    setEditingTitleValue("");
  };

  const saveTitleEdit = async (tab: PodFileTab) => {
    const nextTitle = editingTitleValue.trim();
    if (!nextTitle || nextTitle === tab.title) {
      cancelTitleEdit();
      return;
    }
    // Start the mutation first so SWR's optimistic cache write lands before we
    // leave edit mode (otherwise one frame can still show the old title).
    const updatePromise = updateFileTab(tab.path, { title: nextTitle });
    cancelTitleEdit();
    await updatePromise;
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <h3 className="heading-lg">Pod Customization</h3>
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <h4 className="heading-base flex-1">Pod Tabs</h4>
          {isEditor && (
            <Button
              size="xs"
              variant="outline"
              icon={Plus}
              tooltip="Add file to top bar"
              disabled
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Files pinned to this Pod&apos;s top bar. Drag to reorder, or pick a
          custom icon.
        </p>
        {orderedFileTabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No files in the top bar yet. Add one from Files.
          </p>
        ) : (
          <ListGroup>
            {orderedFileTabs.map((tab) => {
              const selectedIcon = isCustomResourceIconType(tab.icon)
                ? tab.icon
                : DEFAULT_POD_FILE_TAB_ICON;
              const IconComponent = getIcon(selectedIcon);
              const isPickerOpen = iconPickerPath === tab.path;
              const isEditingTitle = editingTitlePath === tab.path;
              const canDrag = isEditor && !isEditingTitle;

              return (
                <div
                  key={tab.path}
                  draggable={canDrag}
                  onDragStart={(event) => {
                    if (!canDrag) {
                      event.preventDefault();
                      return;
                    }
                    if (
                      event.target instanceof HTMLElement &&
                      event.target.closest("button, input")
                    ) {
                      event.preventDefault();
                      return;
                    }
                    handleDragStart(tab.path, event);
                  }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => {
                    if (!isEditor) {
                      return;
                    }
                    handleDragOver(tab.path, event);
                  }}
                  onDrop={(event) => {
                    if (!isEditor) {
                      return;
                    }
                    handleDrop(tab.path, event);
                  }}
                  className={cn(
                    canDrag && "cursor-grab active:cursor-grabbing",
                    draggingPath === tab.path && "opacity-50",
                    dropTargetPath === tab.path && "bg-highlight-50"
                  )}
                >
                  <ListItem
                    itemsAlignment="center"
                    hasSeparatorIfLast
                    ignorePressSelector="button, input"
                  >
                    {isEditor && (
                      <Icon
                        visual={ChevronSelectorVertical}
                        size="sm"
                        className="shrink-0 cursor-grab text-faint active:cursor-grabbing"
                      />
                    )}
                    {isEditor ? (
                      <PopoverRoot
                        modal={false}
                        open={isPickerOpen}
                        onOpenChange={(open) => {
                          setIconPickerPath(open ? tab.path : null);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            size="xs"
                            variant="outline"
                            icon={IconComponent}
                            tooltip="Change icon"
                          />
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-fit p-0"
                          onOpenAutoFocus={(event) => event.preventDefault()}
                        >
                          <IconPicker
                            icons={ActionIcons}
                            selectedIcon={selectedIcon}
                            onIconSelect={(iconName: string) => {
                              if (isCustomResourceIconType(iconName)) {
                                void updateFileTab(tab.path, {
                                  icon: iconName,
                                });
                              }
                              setIconPickerPath(null);
                            }}
                          />
                        </PopoverContent>
                      </PopoverRoot>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        icon={IconComponent}
                        disabled
                      />
                    )}
                    {isEditingTitle ? (
                      <Input
                        autoFocus
                        value={editingTitleValue}
                        maxLength={MAX_POD_FILE_TAB_TITLE_LENGTH}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onBlur={() => void saveTitleEdit(tab)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveTitleEdit(tab);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTitleEdit();
                          }
                        }}
                        containerClassName="min-w-0 flex-1"
                      />
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-sm text-foreground",
                          isEditor && "hover:underline"
                        )}
                        disabled={!isEditor}
                        onClick={() => startTitleEdit(tab)}
                      >
                        {tab.title}
                      </button>
                    )}
                    {isEditor && (
                      <Button
                        size="xs"
                        variant="ghost-secondary"
                        icon={XClose}
                        tooltip="Remove from top bar"
                        onClick={() =>
                          void removeFileTab(tab.path, {
                            fileName: tab.title,
                          })
                        }
                      />
                    )}
                  </ListItem>
                </div>
              );
            })}
          </ListGroup>
        )}
      </div>
    </div>
  );
}
