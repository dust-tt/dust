import {
  ENV_VAR_NAME_SUFFIX_REGEX,
  MAX_VALUE_BYTES,
  SANDBOX_ENV_VAR_PREFIX,
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
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Label,
  LockIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Spinner,
  TextArea,
  TrashIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const NAME_HELPER_TEXT =
  "Uppercase letters, digits and underscores. Up to 60 characters after the DST_ prefix.";

const formSchema = z.object({
  name: z
    .string()
    .min(1, NAME_HELPER_TEXT)
    .regex(
      ENV_VAR_NAME_SUFFIX_REGEX,
      "Suffix must start with A-Z and then use only A-Z, 0-9, or underscore, up to 60 characters."
    ),
  value: z
    .string()
    .min(1, "Value is required.")
    .refine(
      (value) => !value.includes("\u0000"),
      "Values cannot contain NUL bytes."
    )
    .refine(
      (value) => new TextEncoder().encode(value).length <= MAX_VALUE_BYTES,
      "Values cannot exceed 32 KiB."
    ),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_FORM_VALUES: FormValues = { name: "", value: "" };

export function EnvironmentSection() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxTools = featureFlags.includes("sandbox_tools");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onChange",
  });
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = form;
  const { field: nameField } = useController({ control, name: "name" });
  const nameValue = nameField.value;
  const valueValue = useWatch({ control, name: "value" });

  const fullName = nameValue ? `${SANDBOX_ENV_VAR_PREFIX}${nameValue}` : "";
  const isReplacing = envVars.some((envVar) => envVar.name === fullName);
  const nameMessage = (() => {
    if (errors.name) {
      return {
        message: errors.name.message ?? NAME_HELPER_TEXT,
        isError: true,
      };
    }
    if (nameValue.length === 0) {
      return { message: NAME_HELPER_TEXT, isError: false };
    }
    return {
      message: isReplacing
        ? "A variable with this name already exists. Saving will replace its value."
        : "This name can be saved.",
      isError: false,
    };
  })();
  const valueMessage = (() => {
    if (errors.value) {
      return { message: errors.value.message ?? "", isError: true };
    }
    const valueBytes = new TextEncoder().encode(valueValue).length;
    return {
      message: `${valueBytes} / ${MAX_VALUE_BYTES} bytes. Multiline values are allowed.`,
      isError: false,
    };
  })();
  const canSave =
    nameValue.length > 0 &&
    valueValue.length > 0 &&
    !errors.name &&
    !errors.value &&
    !isUpsertingWorkspaceSandboxEnvVar;

  const closeDialog = () => {
    setIsDialogOpen(false);
    setIsNameLocked(false);
    reset(DEFAULT_FORM_VALUES);
  };

  const openAddDialog = () => {
    reset(DEFAULT_FORM_VALUES);
    setIsNameLocked(false);
    setIsDialogOpen(true);
  };

  const openReplaceDialog = (envVar: WorkspaceSandboxEnvVarType) => {
    const suffix = envVar.name.startsWith(SANDBOX_ENV_VAR_PREFIX)
      ? envVar.name.slice(SANDBOX_ENV_VAR_PREFIX.length)
      : envVar.name;
    reset({ name: suffix, value: "" });
    setIsNameLocked(true);
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: FormValues) => {
    const success = await upsertWorkspaceSandboxEnvVar({
      name: `${SANDBOX_ENV_VAR_PREFIX}${data.name}`,
      value: data.value,
    });
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
            onClick={openAddDialog}
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
              <div className="flex flex-col gap-1">
                <Label htmlFor="sandbox-env-var-name">Name</Label>
                <div
                  aria-disabled={
                    isUpsertingWorkspaceSandboxEnvVar || isNameLocked
                  }
                  className={cn(
                    "flex h-9 w-full items-center rounded-xl border bg-muted-background pl-3 text-sm focus-within:ring focus-within:ring-inset dark:bg-muted-background-night",
                    nameMessage.isError &&
                      "border-border-warning dark:border-border-warning-night",
                    (isUpsertingWorkspaceSandboxEnvVar || isNameLocked) &&
                      "cursor-not-allowed opacity-50"
                  )}
                >
                  <span
                    className="select-none text-muted-foreground dark:text-muted-foreground-night"
                    aria-hidden="true"
                    title="The DST_ prefix is reserved and cannot be removed."
                  >
                    {SANDBOX_ENV_VAR_PREFIX}
                  </span>
                  <input
                    id="sandbox-env-var-name"
                    type="text"
                    placeholder="API_TOKEN"
                    className="h-full w-full flex-1 border-0 bg-transparent pl-1 pr-3 text-foreground outline-none placeholder:text-muted-foreground dark:text-foreground-night dark:placeholder:text-muted-foreground-night"
                    disabled={isUpsertingWorkspaceSandboxEnvVar || isNameLocked}
                    ref={nameField.ref}
                    name={nameField.name}
                    value={nameField.value}
                    onBlur={nameField.onBlur}
                    onChange={(event) =>
                      nameField.onChange(event.target.value.toUpperCase())
                    }
                  />
                </div>
                <div
                  className={
                    nameMessage.isError
                      ? "text-xs text-foreground-warning dark:text-foreground-warning-night"
                      : "text-xs text-muted-foreground dark:text-muted-foreground-night"
                  }
                >
                  {nameMessage.message}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="sandbox-env-var-value">Value</Label>
                <TextArea
                  id="sandbox-env-var-value"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  minRows={8}
                  placeholder="Paste the secret value"
                  error={valueMessage.isError ? valueMessage.message : null}
                  showErrorLabel={false}
                  resize="vertical"
                  disabled={isUpsertingWorkspaceSandboxEnvVar}
                  {...register("value")}
                />
                <div
                  className={
                    valueMessage.isError
                      ? "text-xs text-foreground-warning dark:text-foreground-warning-night"
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
                void handleSubmit(onSubmit)();
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
