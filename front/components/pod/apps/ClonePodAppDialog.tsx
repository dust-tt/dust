import { useClonePodApp } from "@app/lib/swr/pods";
import type { PodApp } from "@app/types/api/pod_apps";
import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useCallback, useMemo, useState } from "react";

interface ClonePodAppDialogProps {
  owner: LightWorkspaceType;
  podId: string;
  app: PodApp;
  existingPrefixes: string[];
  isOpen: boolean;
  onClose: () => void;
}

export function ClonePodAppDialog({
  owner,
  podId,
  app,
  existingPrefixes,
  isOpen,
  onClose,
}: ClonePodAppDialogProps) {
  const sourceName = app.name ?? app.prefix;
  const [name, setName] = useState(`${sourceName} Copy`);
  const [isCloning, setIsCloning] = useState(false);
  const doClone = useClonePodApp({ owner, podId });

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

  const onClone = useCallback(async () => {
    setIsCloning(true);
    const result = await doClone(app, name.trim());
    setIsCloning(false);
    if (result.isOk()) {
      onClose();
    }
  }, [app, doClone, name, onClose]);

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
        {isCloning ? (
          <DialogContainer className="flex flex-col items-center gap-3 py-8">
            <Spinner variant="dark" size="md" />
            {/* Each function is a real build on the Pod's Computer, so this is not instant. */}
            <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
              Cloning {sourceName}. Each function is rebuilt on the Pod's
              Computer, so this can take a while.
            </p>
          </DialogContainer>
        ) : (
          <>
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
                created from the same schema but hold no data, and its Frame is
                left unpublished so you can review it first.
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
                onClick: () => {
                  void onClone();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
