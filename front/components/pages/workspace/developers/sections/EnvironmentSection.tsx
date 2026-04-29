import {
  ENV_VAR_NAME_REGEX,
  isReservedEnvVarName,
  MAX_VALUE_BYTES,
} from "@app/lib/api/sandbox/env_vars";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import {
  useDeleteWorkspaceSandboxEnvVar,
  useUpsertWorkspaceSandboxEnvVar,
  useWorkspaceSandboxEnvVars,
} from "@app/lib/swr/sandbox";
import { timeAgoFrom } from "@app/lib/utils";
import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Input,
  Label,
  LockIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Spinner,
  TextArea,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

const NAME_HELPER_TEXT =
  "Uppercase letters, digits and underscores. Up to 64 characters.";

function getNameMessage(name: string, isReplacing: boolean): string {
  if (name.length === 0) {
    return NAME_HELPER_TEXT;
  }

  if (!ENV_VAR_NAME_REGEX.test(name)) {
    return "Names must start with A-Z and then use only A-Z, 0-9, or underscore, up to 64 characters.";
  }

  if (isReservedEnvVarName(name)) {
    return "This name is reserved for the sandbox runtime.";
  }

  return isReplacing
    ? "A variable with this name already exists. Saving will replace its value."
    : "This name can be saved.";
}

function getValueMessage(value: string): {
  message: string;
  isError: boolean;
} {
  if (value.length === 0) {
    return {
      message: `0 / ${MAX_VALUE_BYTES} bytes. Multiline values are allowed.`,
      isError: false,
    };
  }

  if (value.includes("\u0000")) {
    return {
      message: "Values cannot contain NUL bytes.",
      isError: true,
    };
  }

  const valueBytes = new TextEncoder().encode(value).length;
  if (valueBytes > MAX_VALUE_BYTES) {
    return {
      message: "Values cannot exceed 32 KiB.",
      isError: true,
    };
  }

  return {
    message: `${valueBytes} / ${MAX_VALUE_BYTES} bytes. Multiline values are allowed.`,
    isError: false,
  };
}

export function EnvironmentSection() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxTools = featureFlags.includes("sandbox_tools");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [envVarForm, setEnvVarForm] = useState({ name: "", value: "" });
  const [isNameLocked, setIsNameLocked] = useState(false);
  const [envVarToDelete, setEnvVarToDelete] =
    useState<WorkspaceSandboxEnvVarType | null>(null);

  const {
    envVars,
    isWorkspaceSandboxEnvVarsLoading,
    isWorkspaceSandboxEnvVarsError,
  } = useWorkspaceSandboxEnvVars({
    owner,
    disabled: !hasSandboxTools || !isAdmin,
  });
  const { upsertWorkspaceSandboxEnvVar, isUpsertingWorkspaceSandboxEnvVar } =
    useUpsertWorkspaceSandboxEnvVar({ owner });
  const { deleteWorkspaceSandboxEnvVar, isDeletingWorkspaceSandboxEnvVar } =
    useDeleteWorkspaceSandboxEnvVar({ owner });

  const isReplacing = envVars.some((envVar) => envVar.name === envVarForm.name);
  const nameMessage = getNameMessage(envVarForm.name, isReplacing);
  const isNameInvalid =
    envVarForm.name.length > 0 &&
    (!ENV_VAR_NAME_REGEX.test(envVarForm.name) ||
      isReservedEnvVarName(envVarForm.name));
  const valueMessage = getValueMessage(envVarForm.value);
  const canSave =
    envVarForm.name.length > 0 &&
    !isNameInvalid &&
    envVarForm.value.length > 0 &&
    !valueMessage.isError &&
    !isUpsertingWorkspaceSandboxEnvVar;

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEnvVarForm({ name: "", value: "" });
    setIsNameLocked(false);
  };

  const openReplaceDialog = (envVar: WorkspaceSandboxEnvVarType) => {
    setEnvVarForm({ name: envVar.name, value: "" });
    setIsNameLocked(true);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    const success = await upsertWorkspaceSandboxEnvVar(envVarForm);
    if (success) {
      closeDialog();
    }
  };

  const handleDelete = async () => {
    if (!envVarToDelete) {
      return;
    }

    const success = await deleteWorkspaceSandboxEnvVar(envVarToDelete);
    if (success) {
      setEnvVarToDelete(null);
    }
  };

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Only workspace admins can manage sandbox environment variables.
        </ContentMessage>
      );
    }
    if (!hasSandboxTools) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Sandbox tools are not enabled for this workspace.
        </ContentMessage>
      );
    }
    if (isWorkspaceSandboxEnvVarsLoading) {
      return <Spinner />;
    }
    if (isWorkspaceSandboxEnvVarsError) {
      return (
        <ContentMessage
          variant="warning"
          icon={InformationCircleIcon}
          size="lg"
          title="Failed to load"
        >
          The sandbox environment variables could not be loaded.
        </ContentMessage>
      );
    }

    return (
      <Page.Vertical align="stretch" gap="lg">
        <Page.SectionHeader
          title="Environment variables"
          description="Secrets mounted as env vars on every sandbox in this workspace."
        />

        <ContentMessage
          variant="warning"
          icon={InformationCircleIcon}
          size="lg"
          title="Handle as write-only secrets"
        >
          These values are mounted on every future sandbox in this workspace.
          The agent is instructed not to print or echo them, and bash output is
          redacted on a best-effort basis. This is defense-in-depth, not a
          guarantee: encoded output, network calls from sandbox code, and short
          or dictionary-like values may still leak. Use least-privilege,
          high-entropy credentials and rotate often. Values cannot be viewed
          after saving, only overwritten or deleted.
        </ContentMessage>

        <div className="flex justify-end">
          <Button
            label="Add variable"
            icon={PlusIcon}
            onClick={() => {
              setEnvVarForm({ name: "", value: "" });
              setIsDialogOpen(true);
            }}
            disabled={isUpsertingWorkspaceSandboxEnvVar}
          />
        </div>

        {envVars.length === 0 ? (
          <ContentMessage variant="primary" size="lg">
            No environment variables yet.
          </ContentMessage>
        ) : (
          <div className="flex w-full flex-col divide-y divide-separator dark:divide-separator-night">
            {envVars.map((envVar) => {
              const updatedBy =
                envVar.lastUpdatedByName ?? envVar.createdByName ?? "Unknown";

              return (
                <div
                  key={envVar.name}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <pre
                      title={envVar.name}
                      className="min-w-0 self-start overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground dark:bg-muted-background-night dark:text-foreground-night"
                    >
                      {envVar.name}
                    </pre>
                    <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      Updated{" "}
                      {timeAgoFrom(envVar.updatedAt, { useLongFormat: true })}{" "}
                      ago by {updatedBy}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="mini"
                      icon={PencilSquareIcon}
                      tooltip={`Replace value of ${envVar.name}`}
                      disabled={
                        isUpsertingWorkspaceSandboxEnvVar ||
                        isDeletingWorkspaceSandboxEnvVar
                      }
                      onClick={() => openReplaceDialog(envVar)}
                    />
                    <Button
                      variant="warning"
                      size="mini"
                      icon={TrashIcon}
                      tooltip={`Delete ${envVar.name}`}
                      disabled={
                        isDeletingWorkspaceSandboxEnvVar ||
                        isUpsertingWorkspaceSandboxEnvVar
                      }
                      onClick={() => setEnvVarToDelete(envVar)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Page.Vertical>
    );
  };

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {isReplacing ? "Replace variable" : "Add variable"}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.Vertical align="stretch" gap="md">
              <Input
                label="Name"
                name="name"
                placeholder="API_TOKEN"
                value={envVarForm.name}
                message={nameMessage}
                messageStatus={isNameInvalid ? "error" : "info"}
                onChange={(event) =>
                  setEnvVarForm({
                    ...envVarForm,
                    name: event.target.value.toUpperCase(),
                  })
                }
                disabled={isUpsertingWorkspaceSandboxEnvVar || isNameLocked}
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="sandbox-env-var-value">Value</Label>
                <TextArea
                  id="sandbox-env-var-value"
                  name="value"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  minRows={8}
                  placeholder="Paste the secret value"
                  value={envVarForm.value}
                  error={valueMessage.isError ? valueMessage.message : null}
                  showErrorLabel={false}
                  resize="vertical"
                  onChange={(event) =>
                    setEnvVarForm({
                      ...envVarForm,
                      value: event.target.value,
                    })
                  }
                  disabled={isUpsertingWorkspaceSandboxEnvVar}
                />
                <div
                  className={
                    valueMessage.isError
                      ? "text-xs text-warning-600 dark:text-warning-600-night"
                      : "text-xs text-muted-foreground dark:text-muted-foreground-night"
                  }
                >
                  {valueMessage.message}
                </div>
              </div>
            </Page.Vertical>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: closeDialog,
            }}
            rightButtonProps={{
              label: isReplacing ? "Replace" : "Save",
              icon: LockIcon,
              onClick: () => {
                void handleSave();
              },
              disabled: !canSave,
              isLoading: isUpsertingWorkspaceSandboxEnvVar,
            }}
          />
        </DialogContent>
      </Dialog>

      {envVarToDelete ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEnvVarToDelete(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {envVarToDelete.name}</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              Are you sure you want to delete{" "}
              <strong>{envVarToDelete.name}</strong>?
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setEnvVarToDelete(null),
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                onClick: () => {
                  void handleDelete();
                },
                isLoading: isDeletingWorkspaceSandboxEnvVar,
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {renderBody()}
    </>
  );
}
