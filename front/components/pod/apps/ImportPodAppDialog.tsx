import { useImportPodApp } from "@app/lib/swr/pods";
import type { PodAppImportSummary } from "@app/types/api/pod_app_archive";
import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import type { LightWorkspaceType } from "@app/types/user";
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
  Spinner,
  Upload01,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

interface ImportPodAppDialogProps {
  owner: LightWorkspaceType;
  podId: string;
  existingPrefixes: string[];
  isOpen: boolean;
  onClose: () => void;
}

export function ImportPodAppDialog({
  owner,
  podId,
  existingPrefixes,
  isOpen,
  onClose,
}: ImportPodAppDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [report, setReport] = useState<PodAppImportSummary | null>(null);
  const doImport = useImportPodApp({ owner, podId });

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

  const onImport = useCallback(async () => {
    if (!file) {
      return;
    }
    setIsImporting(true);
    const result = await doImport(file, trimmedName || undefined);
    setIsImporting(false);
    if (result.isOk()) {
      const summary = result.value;
      if (summary.warnings.length > 0 || summary.skipped.length > 0) {
        // Keep the dialog open so the issues are read before they scroll away.
        setReport(summary);
      } else {
        onClose();
      }
    }
  }, [doImport, file, trimmedName, onClose]);

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
        {isImporting ? (
          <DialogContainer className="flex flex-col items-center gap-3 py-8">
            <Spinner variant="dark" size="md" />
            <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
              Importing. Each function is rebuilt on the Pod's Computer, so this
              can take a while.
            </p>
          </DialogContainer>
        ) : report ? (
          <>
            <DialogContainer className="flex flex-col gap-4">
              <ContentMessage
                variant="warning"
                title={`${report.name} imported with issues`}
              >
                <ul className="list-disc pl-4">
                  {[...report.warnings, ...report.skipped].map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </ContentMessage>
            </DialogContainer>
            <DialogFooter
              rightButtonProps={{
                label: "Done",
                variant: "primary",
                onClick: onClose,
              }}
            />
          </>
        ) : (
          <>
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
                Databases are created from the archive's schemas but hold no
                data. Missing secrets or configuration in this workspace will
                surface when the app runs.
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
                  void onImport();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
