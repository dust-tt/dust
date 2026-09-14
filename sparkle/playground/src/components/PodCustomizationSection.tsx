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
  onRemove,
  onAdd,
}: PodCustomizationSectionProps) {
  const [draggingValue, setDraggingValue] = useState<string | null>(null);
  const [dropTargetValue, setDropTargetValue] = useState<string | null>(null);
  const [iconPickerTabValue, setIconPickerTabValue] = useState<string | null>(
    null
  );
  const [tabToRemove, setTabToRemove] =
    useState<PodTabCustomizationItem | null>(null);

  const addFileTrigger = (
    <Button
      size="xs"
      variant="outline"
      icon={Plus}
      tooltip="Add file to top bar"
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

  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <h3 className="heading-lg">Pod Customization</h3>
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <h4 className="heading-base flex-1">Pod Tabs</h4>
            {tabs.length > 0 && (
              <AddPodFileMenu
                files={addableFiles}
                onSelect={onAdd}
                trigger={addFileTrigger}
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Files pinned to this Pod's top bar. Drag to reorder, or pick a
            custom icon.
          </p>
          {tabs.length === 0 ? (
            <EmptyCTA
              message="No files in the top bar yet."
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

                return (
                  <div
                    key={tab.value}
                    draggable
                    onDragStart={(event) => {
                      if (
                        event.target instanceof HTMLElement &&
                        event.target.closest("button")
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
                      "cursor-grab active:cursor-grabbing",
                      draggingValue === tab.value && "opacity-50",
                      dropTargetValue === tab.value && "bg-highlight-50"
                    )}
                  >
                    <ListItem
                      itemsAlignment="center"
                      hasSeparatorIfLast
                      ignorePressSelector="button"
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
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {tab.label}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost-secondary"
                        icon={XClose}
                        tooltip="Remove from top bar"
                        onClick={() => setTabToRemove(tab)}
                      />
                    </ListItem>
                  </div>
                );
              })}
            </ListGroup>
          )}
        </div>
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
              Sure you want to remove "{tabToRemove?.label}" from the top bar?
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            This file will stay in Files. You can pin it to the top bar again
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
