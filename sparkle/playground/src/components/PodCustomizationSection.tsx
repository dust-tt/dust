import {
  ActionIcons,
  Button,
  ChevronSelectorVertical,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyCTA,
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
import { cn } from "@sparkle/lib/utils";
import { useState, type ComponentType, type DragEvent } from "react";

import {
  MAX_POD_FILE_TAB_TITLE_LENGTH,
  MAX_POD_FILE_TABS,
} from "../data/podSettings";
import type { DataSource } from "../data/types";
import { AddPodFileMenu } from "./AddPodFileMenu";

const POD_TAB_DRAG_MIME = "application/x-dust-pod-tab-value";

export type PodTabCustomizationItem = {
  value: string;
  label: string;
  icon: ComponentType;
  iconName?: string;
};

export interface PodCustomizationSectionProps {
  tabs: PodTabCustomizationItem[];
  addableFiles: DataSource[];
  onReorder: (draggedValue: string, targetValue: string) => void;
  onChangeIcon: (tabValue: string, iconName: string) => void;
  onRename: (tabValue: string, title: string) => void;
  onRemove: (tabValue: string) => void;
  onAdd: (file: DataSource) => void;
}

function isTabReorderDrag(event: DragEvent) {
  return event.dataTransfer.types.includes(POD_TAB_DRAG_MIME);
}

export function PodCustomizationSection({
  tabs,
  addableFiles,
  onReorder,
  onChangeIcon,
  onRename,
  onRemove,
  onAdd,
}: PodCustomizationSectionProps) {
  const [draggingValue, setDraggingValue] = useState<string | null>(null);
  const [dropTargetValue, setDropTargetValue] = useState<string | null>(null);
  const [iconPickerTabValue, setIconPickerTabValue] = useState<string | null>(
    null
  );
  const [editingTitleValue, setEditingTitleValue] = useState<string | null>(
    null
  );
  const [titleDraft, setTitleDraft] = useState("");
  const [tabToRemove, setTabToRemove] =
    useState<PodTabCustomizationItem | null>(null);

  const atTabLimit = tabs.length >= MAX_POD_FILE_TABS;

  const addFileTrigger = (
    <Button
      size="xs"
      variant="outline"
      icon={Plus}
      tooltip={
        atTabLimit
          ? `A Pod can have at most ${MAX_POD_FILE_TABS} custom tabs.`
          : "Add file to Tabs"
      }
      disabled={atTabLimit}
    />
  );

  const handleDragStart = (
    tabValue: string,
    event: DragEvent<HTMLDivElement>
  ) => {
    event.dataTransfer.setData(POD_TAB_DRAG_MIME, tabValue);
    event.dataTransfer.effectAllowed = "move";
    setDraggingValue(tabValue);
  };

  const handleDragEnd = () => {
    setDraggingValue(null);
    setDropTargetValue(null);
  };

  const handleDragOver = (
    tabValue: string,
    event: DragEvent<HTMLDivElement>
  ) => {
    if (!isTabReorderDrag(event) || draggingValue === tabValue) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetValue(tabValue);
  };

  const handleDrop = (tabValue: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const draggedValue = event.dataTransfer.getData(POD_TAB_DRAG_MIME);
    if (draggedValue) {
      onReorder(draggedValue, tabValue);
    }
    handleDragEnd();
  };

  const startTitleEdit = (tab: PodTabCustomizationItem) => {
    setEditingTitleValue(tab.value);
    setTitleDraft(tab.label);
  };

  const cancelTitleEdit = () => {
    setEditingTitleValue(null);
    setTitleDraft("");
  };

  const saveTitleEdit = (tab: PodTabCustomizationItem) => {
    const nextTitle = titleDraft.trim();
    if (nextTitle && nextTitle !== tab.label) {
      onRename(tab.value, nextTitle);
    }
    cancelTitleEdit();
  };

  return (
    <>
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Tabs</h3>
          {tabs.length > 0 && (
            <AddPodFileMenu
              files={addableFiles}
              onSelect={onAdd}
              trigger={addFileTrigger}
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Files pinned to this Pod's Tabs. Drag to reorder, or pick a custom
          icon.
        </p>
        {tabs.length === 0 ? (
          <EmptyCTA
            message="No files in the Tabs yet."
            action={
              <AddPodFileMenu
                files={addableFiles}
                onSelect={onAdd}
                trigger={
                  <Button variant="highlight" icon={Plus} label="Add file" />
                }
              />
            }
          />
        ) : (
          <ListGroup>
            {tabs.map((tab) => {
              const selectedIconName = tab.iconName ?? "";
              const isPickerOpen = iconPickerTabValue === tab.value;
              const isEditingTitle = editingTitleValue === tab.value;

              return (
                <div
                  key={tab.value}
                  draggable={!isEditingTitle}
                  onDragStart={(event) => {
                    if (
                      isEditingTitle ||
                      (event.target instanceof HTMLElement &&
                        event.target.closest("button, input"))
                    ) {
                      event.preventDefault();
                      return;
                    }
                    handleDragStart(tab.value, event);
                  }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOver(tab.value, event)}
                  onDrop={(event) => handleDrop(tab.value, event)}
                  className={cn(
                    !isEditingTitle && "cursor-grab active:cursor-grabbing",
                    draggingValue === tab.value && "opacity-50",
                    dropTargetValue === tab.value && "bg-highlight-50"
                  )}
                >
                  <ListItem
                    itemsAlignment="center"
                    hasSeparatorIfLast
                    ignorePressSelector="button, input"
                  >
                    <Icon
                      visual={ChevronSelectorVertical}
                      size="sm"
                      className="shrink-0 cursor-grab text-faint active:cursor-grabbing"
                    />
                    <PopoverRoot
                      modal={false}
                      open={isPickerOpen}
                      onOpenChange={(open) => {
                        setIconPickerTabValue(open ? tab.value : null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          size="xs"
                          variant="outline"
                          icon={tab.icon}
                          tooltip="Change icon"
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-fit p-0"
                        onOpenAutoFocus={(event) => event.preventDefault()}
                      >
                        <IconPicker
                          icons={ActionIcons}
                          selectedIcon={selectedIconName}
                          onIconSelect={(iconName: string) => {
                            onChangeIcon(tab.value, iconName);
                            setIconPickerTabValue(null);
                          }}
                        />
                      </PopoverContent>
                    </PopoverRoot>
                    {isEditingTitle ? (
                      <Input
                        autoFocus
                        value={titleDraft}
                        maxLength={MAX_POD_FILE_TAB_TITLE_LENGTH}
                        onChange={(
                          event: React.ChangeEvent<HTMLInputElement>
                        ) => setTitleDraft(event.target.value)}
                        onBlur={() => saveTitleEdit(tab)}
                        onKeyDown={(
                          event: React.KeyboardEvent<HTMLInputElement>
                        ) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveTitleEdit(tab);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelTitleEdit();
                          }
                        }}
                        containerClassName="min-w-0 flex-1"
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:underline"
                        onClick={() => startTitleEdit(tab)}
                      >
                        {tab.label}
                      </button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost-secondary"
                      icon={XClose}
                      tooltip="Remove from Tabs"
                      onClick={() => setTabToRemove(tab)}
                    />
                  </ListItem>
                </div>
              );
            })}
          </ListGroup>
        )}
      </div>
      <Dialog
        open={tabToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTabToRemove(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Sure you want to remove "{tabToRemove?.label}" from the Tabs?
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            This file will stay in Files. You can pin it to the Tabs again
            later.
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              onClick: () => {
                if (tabToRemove) {
                  onRemove(tabToRemove.value);
                }
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
