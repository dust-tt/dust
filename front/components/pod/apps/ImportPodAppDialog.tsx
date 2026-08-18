import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Upload01,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";

interface ImportPodAppDialogProps {
  existingPrefixes: string[];
  isOpen: boolean;
  onClose: () => void;
  /** The import itself runs in the Apps tab, which outlives this dialog. */
  onSubmit: (file: File, name: string | undefined) => void;
}

export function ImportPodAppDialog({
  existingPrefixes,
  isOpen,
  onClose,
  onSubmit,
}: ImportPodAppDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  const trimmedName = name.trim();
  const prefix = useMemo(
    () => (trimmedName ? normalizeAppPrefix(trimmedName) : null),
    [trimmedName]
  );
  const nameError = useMemo(() => {
    if (!trimmedName) {
      // Empty is fine: the server falls back to the archive's own name.
      return null;
    }
    if (!prefix) {
      return "Use at least one letter or digit.";
    }
    if (trimmedName.includes("/")) {
      return "An app name cannot contain '/'.";
    }
    if (existingPrefixes.includes(prefix)) {
      return `This Pod already has an app named '${prefix}'.`;
    }
    return null;
  }, [existingPrefixes, trimmedName, prefix]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Import an app</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
              App archive (.zip)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFile(e.target.files?.[0] ?? null)
              }
            />
            <Button
              label={file ? file.name : "Choose archive"}
              icon={Upload01}
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
              App name (optional)
            </span>
            <Input
              name="import-app-name"
              value={name}
              placeholder="Defaults to the archive's app name"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              maxLength={MAX_POD_APP_NAME_LENGTH}
              message={nameError ?? undefined}
              messageStatus={nameError ? "error" : undefined}
              containerClassName="w-full"
            />
          </div>
          <ContentMessage variant="info" title="The import starts empty">
            Databases are created from the archive's schemas but hold no data.
            Missing secrets or configuration in this workspace will surface when
            the app runs.
          </ContentMessage>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Import app",
            variant: "primary",
            disabled: file === null || nameError !== null,
            onClick: () => {
              if (file) {
                onSubmit(file, trimmedName || undefined);
              }
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
