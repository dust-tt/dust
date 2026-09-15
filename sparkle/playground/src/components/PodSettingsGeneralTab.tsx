import {
  Archive,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Separator,
  TextArea,
  Trash01,
  Upload01,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  POD_NOTIFICATION_OPTIONS,
  type PodNotificationCondition,
  TAKEN_POD_NAMES,
} from "../data";
import type { Space } from "../data/types";
import { formatDate } from "./podSettingsShared";

export interface PodSettingsGeneralTabProps {
  space: Space;
  description: string;
  onDescriptionChange: (description: string) => void;
  notificationCondition: PodNotificationCondition;
  onNotificationConditionChange: (condition: PodNotificationCondition) => void;
  archivedAt: Date | null;
  onArchivedAtChange: (archivedAt: Date | null) => void;
  onUpdateSpaceName?: (spaceId: string, newName: string) => void;
}

export function PodSettingsGeneralTab({
  space,
  description,
  onDescriptionChange,
  notificationCondition,
  onNotificationConditionChange,
  archivedAt,
  onArchivedAtChange,
  onUpdateSpaceName,
}: PodSettingsGeneralTabProps) {
  const [nameDraft, setNameDraft] = useState(space.name);
  const [showNameSaveDialog, setShowNameSaveDialog] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(description);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState("");

  const isEditingName = nameDraft.trim() !== space.name.trim();
  const isEditingDescription = descriptionDraft !== description;

  const nameNotAvailable =
    nameDraft.trim().length > 0 &&
    isEditingName &&
    TAKEN_POD_NAMES.some(
      (taken) => taken.toLowerCase() === nameDraft.trim().toLowerCase()
    );

  return (
    <>
      {/* Name */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Name</div>
        <div className="flex w-full min-w-0 gap-2">
          <Input
            value={nameDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setNameDraft(e.target.value)
            }
            placeholder="Enter Pod name"
            containerClassName="flex-1"
          />
          {isEditingName && (
            <>
              <Button
                label="Save"
                variant="highlight"
                disabled={nameNotAvailable}
                onClick={() => setShowNameSaveDialog(true)}
              />
              <Button
                label="Cancel"
                variant="outline"
                onClick={() => setNameDraft(space.name)}
              />
            </>
          )}
        </div>
        {nameNotAvailable && (
          <div className="text-xs text-warning-500">
            A Pod or space with this name already exists.
          </div>
        )}
      </div>

      {/* Description */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Description</div>
        <div className="flex w-full min-w-0 flex-col gap-2">
          <TextArea
            value={descriptionDraft}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setDescriptionDraft(e.target.value)
            }
            placeholder="Describe what this Pod is about..."
            minRows={3}
            resize="vertical"
            className="flex-1"
          />
          {isEditingDescription && (
            <div className="flex gap-2">
              <Button
                label="Save"
                variant="highlight"
                onClick={() => onDescriptionChange(descriptionDraft)}
              />
              <Button
                label="Cancel"
                variant="outline"
                onClick={() => setDescriptionDraft(description)}
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Notifications */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Notifications</div>
        <p className="text-sm text-muted-foreground">
          How you get notified about activity in this Pod. Also available from
          the Pod menu.
        </p>
        <RadioGroup
          value={notificationCondition}
          onValueChange={(value: string) =>
            onNotificationConditionChange(value as PodNotificationCondition)
          }
          className="pt-1"
        >
          {POD_NOTIFICATION_OPTIONS.map((option) => (
            <RadioGroupItem
              key={option.value}
              id={`pod-notifications-${option.value}`}
              value={option.value}
              label={option.label}
            />
          ))}
        </RadioGroup>
      </div>

      {/* Archive and delete */}
      <div className="flex w-full flex-col gap-3 border-t border-border pt-8">
        <h3 className="heading-lg">Archive and delete</h3>
        <h4 className="heading-base">Archive</h4>
        {archivedAt ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">
              Archived on{" "}
              <span className="font-medium">{formatDate(archivedAt)}</span>.
            </p>
            <Button
              icon={Upload01}
              variant="outline"
              label="Unarchive"
              onClick={() => onArchivedAtChange(null)}
              className="w-fit"
            />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This Pod is removed from your sidebar. Its content stays intact
              and agents can still use it as a data source. You can restore it
              at any time.
            </p>
            <Button
              icon={Archive}
              variant="warning"
              label="Archive"
              onClick={() => onArchivedAtChange(new Date())}
              className="w-fit"
            />
          </>
        )}
        <h4 className="heading-base">Delete</h4>
        <p className="text-sm text-muted-foreground">
          Deleting removes all content in this Pod: conversations, folders,
          websites, and data sources. Agents that use its tools will stop
          working. This cannot be undone.
        </p>
        <div className="flex w-full flex-col items-start">
          <Button
            icon={Trash01}
            variant="warning"
            label="Delete Pod"
            onClick={() => setShowDeleteDialog(true)}
          />
        </div>
      </div>

      {/* Name save confirmation */}
      <Dialog
        open={showNameSaveDialog}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setShowNameSaveDialog(false);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Update Pod name?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {`The Pod name will be changed to "${nameDraft.trim()}".`}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setShowNameSaveDialog(false),
            }}
            rightButtonProps={{
              label: "Rename",
              variant: "warning",
              onClick: () => {
                onUpdateSpaceName?.(space.id, nameDraft.trim());
                setShowNameSaveDialog(false);
              },
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Pod */}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open: boolean) => {
          setShowDeleteDialog(open);
          if (!open) {
            setDeleteConfirmDraft("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{`Delete ${space.name}?`}</DialogTitle>
          </DialogHeader>
          <DialogContainer className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Type <strong>delete</strong> below to confirm. This permanently
              removes all Pod content and cannot be undone.
            </p>
            <Input
              name="delete-confirm"
              value={deleteConfirmDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDeleteConfirmDraft(e.target.value)
              }
              placeholder="Type delete to confirm"
              containerClassName="w-full"
            />
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setShowDeleteDialog(false);
                setDeleteConfirmDraft("");
              },
            }}
            rightButtonProps={{
              label: "Delete permanently",
              variant: "warning",
              disabled: deleteConfirmDraft.trim().toLowerCase() !== "delete",
              onClick: () => {
                setShowDeleteDialog(false);
                setDeleteConfirmDraft("");
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
