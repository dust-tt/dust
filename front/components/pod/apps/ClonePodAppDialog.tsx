import type { PodApp } from "@app/types/api/pod_apps";
import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
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
import { useMemo, useState } from "react";

interface ClonePodAppDialogProps {
  app: PodApp;
  existingPrefixes: string[];
  isOpen: boolean;
  onClose: () => void;
  /** The clone itself runs in the Apps tab, which outlives this dialog. */
  onSubmit: (name: string) => void;
}

export function ClonePodAppDialog({
  app,
  existingPrefixes,
  isOpen,
  onClose,
  onSubmit,
}: ClonePodAppDialogProps) {
  const sourceName = app.name ?? app.prefix;
  const [name, setName] = useState(`${sourceName} Copy`);

  // The prefix is what actually has to be unique: two names that normalize alike would share
  // published slugs and databases.
  const prefix = useMemo(() => normalizeAppPrefix(name.trim()), [name]);
  const nameError = useMemo(() => {
    if (!prefix) {
      return "Use at least one letter or digit.";
    }
    if (name.includes("/")) {
      return "An app name cannot contain '/'.";
    }
    if (existingPrefixes.includes(prefix)) {
      return `This Pod already has an app named '${prefix}'.`;
    }
    return null;
  }, [existingPrefixes, name, prefix]);

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
          <DialogTitle>{`Clone ${sourceName}`}</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
              New app name
            </span>
            <Input
              name="clone-app-name"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              maxLength={MAX_POD_APP_NAME_LENGTH}
              message={nameError ?? undefined}
              messageStatus={nameError ? "error" : undefined}
              containerClassName="w-full"
            />
            {!nameError && (
              <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                Functions will be published as{" "}
                <span className="font-mono">{prefix}__&lt;name&gt;</span>.
              </span>
            )}
          </div>

          <ContentMessage variant="info" title="The copy starts empty">
            Its {app.databases.length === 1 ? "database" : "databases"} are
            created from the same schema but hold no data, and its Frame is left
            unpublished so you can review it first.
          </ContentMessage>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Clone app",
            variant: "primary",
            disabled: nameError !== null,
            onClick: () => onSubmit(name.trim()),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
