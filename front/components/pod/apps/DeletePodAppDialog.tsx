import type { PodApp } from "@app/types/api/pod_apps";
import {
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useState } from "react";

const CONFIRM_WORD = "delete";

interface DeletePodAppDialogProps {
  app: PodApp;
  isOpen: boolean;
  onClose: () => void;
  /** The deletion itself runs in the Apps tab, which outlives this dialog. */
  onSubmit: () => void;
}

interface InventoryLineProps {
  label: string;
  items: string[];
}

/** One line per artifact kind, naming what goes rather than just counting it. */
function InventoryLine({ label, items }: InventoryLineProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <li>
      <span className="font-semibold">
        {items.length} {label}
      </span>
      <span className="text-muted-foreground dark:text-muted-foreground-night">
        {" — "}
        {items.join(", ")}
      </span>
    </li>
  );
}

export function DeletePodAppDialog({
  app,
  isOpen,
  onClose,
  onSubmit,
}: DeletePodAppDialogProps) {
  const [confirmText, setConfirmText] = useState("");

  const appName = app.name ?? app.prefix;
  const sharedFrames = app.frames.filter((frame) => frame.isPublished);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmText("");
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{`Delete ${appName}?`}</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="copy-sm">This permanently removes:</p>
            <ul className="flex flex-col gap-1 pl-4 copy-sm list-disc">
              <InventoryLine
                label={app.functions.length === 1 ? "function" : "functions"}
                items={app.functions.map((fn) => fn.name)}
              />
              <InventoryLine
                label={app.databases.length === 1 ? "database" : "databases"}
                items={app.databases.map((db) => db.name)}
              />
              <InventoryLine
                label={app.frames.length === 1 ? "Frame" : "Frames"}
                items={app.frames.map((frame) => frame.fileName)}
              />
              {app.fileCount > 0 && (
                <li>
                  <span className="font-semibold">
                    {app.fileCount} {app.fileCount === 1 ? "file" : "files"}
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground-night">
                    {" — "}
                    {app.collidingFolderNames.length > 0
                      ? app.collidingFolderNames.join(", ")
                      : appName}
                  </span>
                </li>
              )}
            </ul>
          </div>

          {app.databases.length > 0 && (
            <ContentMessage variant="warning" title="Data cannot be recovered">
              The {app.databases.length === 1 ? "database" : "databases"} above
              and everything stored in{" "}
              {app.databases.length === 1 ? "it" : "them"} are deleted for good,
              including the replicated copy.
            </ContentMessage>
          )}

          {sharedFrames.length > 0 && (
            <ContentMessage variant="warning" title="Shared links will break">
              {sharedFrames.length === 1
                ? "This app's Frame has been published, so anyone holding its link loses access."
                : "This app's Frames have been published, so anyone holding their links loses access."}
            </ContentMessage>
          )}

          <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
            Type <strong>{CONFIRM_WORD}</strong> below to confirm.
          </p>
          <Input
            name="delete-app-confirm"
            value={confirmText}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setConfirmText(e.target.value)
            }
            placeholder={`Type ${CONFIRM_WORD} to confirm`}
            containerClassName="w-full"
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Delete permanently",
            variant: "warning",
            disabled: confirmText.trim().toLowerCase() !== CONFIRM_WORD,
            onClick: onSubmit,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
