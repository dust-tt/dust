import {
  ENV_VAR_NAME_SUFFIX_REGEX,
  envVarPrefixForKind,
  MAX_HTTPS_SECRET_VALUE_BYTES,
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
  usePatchWorkspaceSandboxEnvVar,
  useUpsertWorkspaceSandboxEnvVar,
  useWorkspaceSandboxEnvVars,
} from "@app/lib/swr/sandbox";
import { timeAgoFrom } from "@app/lib/utils";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import {
  WORKSPACE_SANDBOX_ENV_VAR_KINDS,
  type WorkspaceSandboxEnvVarKind,
  type WorkspaceSandboxEnvVarType,
} from "@app/types/sandbox/env_var";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
  GlobeAltIcon,
  InformationCircleIcon,
  Input,
  Label,
  LockIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  TextArea,
  TrashIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const NAME_HELPER_TEXT =
  "Uppercase letters, digits and underscores. Up to 64 characters after the prefix.";

const ALLOWED_DOMAINS_HELPER_TEXT =
  "Use exact domains such as api.github.com or wildcards such as *.github.com.";

function parseAllowedDomainsText(value: string): string[] {
  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter((domain) => domain.length > 0);
}

function getEnvVarSuffix(envVar: WorkspaceSandboxEnvVarType): string {
  const prefix = envVarPrefixForKind(envVar.kind);
  return envVar.name.startsWith(prefix)
    ? envVar.name.slice(prefix.length)
    : envVar.name;
}

function labelForKind(kind: WorkspaceSandboxEnvVarKind): string {
  switch (kind) {
    case "config":
      return "Config";
    case "https_secret":
      return "HTTPS secret";
    default:
      assertNeverAndIgnore(kind);
      return "";
  }
}

const formSchema = z
  .object({
    name: z
      .string()
      .min(1, NAME_HELPER_TEXT)
      .regex(
        ENV_VAR_NAME_SUFFIX_REGEX,
        "Suffix must start with A-Z and then use only A-Z, 0-9, or underscore, up to 64 characters."
      ),
    value: z.string().min(1, "Value is required."),
    kind: z.enum(WORKSPACE_SANDBOX_ENV_VAR_KINDS),
    allowedDomainsText: z.string(),
  })
  .superRefine((data, ctx) => {
    const valueBytes = new TextEncoder().encode(data.value).length;

    switch (data.kind) {
      case "config": {
        if (data.value.includes("\u0000")) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "Values cannot contain NUL bytes.",
          });
        }
        if (valueBytes > MAX_VALUE_BYTES) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "Values cannot exceed 32 KiB.",
          });
        }
        return;
      }

      case "https_secret": {
        if (/[\u0000-\u001F\u007F]/.test(data.value)) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "HTTPS secret values cannot contain ASCII control bytes.",
          });
        }
        if (valueBytes > MAX_HTTPS_SECRET_VALUE_BYTES) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: `HTTPS secret values cannot exceed ${
              MAX_HTTPS_SECRET_VALUE_BYTES / 1_024
            } KiB.`,
          });
        }

        const allowedDomains = parseAllowedDomainsText(data.allowedDomainsText);
        if (allowedDomains.length === 0) {
          ctx.addIssue({
            code: "custom",
            path: ["allowedDomainsText"],
            message: "HTTPS secrets require at least one allowed domain.",
          });
          return;
        }

        const normalizedDomains = normalizeEgressPolicyDomains(allowedDomains);
        if (normalizedDomains.isErr()) {
          ctx.addIssue({
            code: "custom",
            path: ["allowedDomainsText"],
            message: normalizedDomains.error.message,
          });
        }
        return;
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_FORM_VALUES: FormValues = {
  name: "",
  value: "",
  kind: "config",
  allowedDomainsText: "",
};

export function EnvironmentSection() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxAdmin =
    featureFlags.includes("sandbox_tools") &&
    featureFlags.includes("sandbox_workspace_admin");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNameLocked, setIsNameLocked] = useState(false);
  const [envVarToReplace, setEnvVarToReplace] =
    useState<WorkspaceSandboxEnvVarType | null>(null);
  const [envVarToDelete, setEnvVarToDelete] =
    useState<WorkspaceSandboxEnvVarType | null>(null);
  const [envVarToConfigureDomains, setEnvVarToConfigureDomains] =
    useState<WorkspaceSandboxEnvVarType | null>(null);
  const [domainsText, setDomainsText] = useState("");

  const {
    envVars,
    isWorkspaceSandboxEnvVarsLoading,
    isWorkspaceSandboxEnvVarsError,
  } = useWorkspaceSandboxEnvVars({
    owner,
    disabled: !hasSandboxAdmin || !isAdmin,
  });
  const { upsertWorkspaceSandboxEnvVar, isUpsertingWorkspaceSandboxEnvVar } =
    useUpsertWorkspaceSandboxEnvVar({ owner });
  const { patchWorkspaceSandboxEnvVar, isPatchingWorkspaceSandboxEnvVar } =
    usePatchWorkspaceSandboxEnvVar({ owner });
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
  const { field: kindField } = useController({ control, name: "kind" });
  const nameValue = nameField.value;
  const valueValue = useWatch({ control, name: "value" });
  const kindValue = useWatch({ control, name: "kind" });
  const allowedDomainsTextValue = useWatch({
    control,
    name: "allowedDomainsText",
  });

  const namePrefix = envVarPrefixForKind(kindValue);
  const fullName = nameValue ? `${namePrefix}${nameValue}` : "";
  const existingEnvVarForSuffix = envVars.find(
    (envVar) => getEnvVarSuffix(envVar) === nameValue
  );
  const isReplacing = existingEnvVarForSuffix?.name === fullName;
  const isNameTakenByOtherKind =
    !isNameLocked &&
    existingEnvVarForSuffix !== undefined &&
    existingEnvVarForSuffix.name !== fullName;
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
    if (isNameTakenByOtherKind) {
      return {
        message: `A variable with this suffix already exists as ${
          existingEnvVarForSuffix?.name ?? fullName
        }.`,
        isError: true,
      };
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
    const maxBytes =
      kindValue === "https_secret"
        ? MAX_HTTPS_SECRET_VALUE_BYTES
        : MAX_VALUE_BYTES;
    const suffix =
      kindValue === "https_secret"
        ? "ASCII control bytes are not allowed."
        : "Multiline values are allowed.";
    return {
      message: `${valueBytes} / ${maxBytes} bytes. ${suffix}`,
      isError: false,
    };
  })();
  const allowedDomainsMessage = (() => {
    if (kindValue !== "https_secret") {
      return null;
    }
    if (errors.allowedDomainsText) {
      return {
        message: errors.allowedDomainsText.message ?? "",
        isError: true,
      };
    }

    const allowedDomains = parseAllowedDomainsText(allowedDomainsTextValue);
    if (allowedDomains.length === 0) {
      return { message: ALLOWED_DOMAINS_HELPER_TEXT, isError: false };
    }

    const normalizedDomains = normalizeEgressPolicyDomains(allowedDomains);
    if (normalizedDomains.isErr()) {
      return { message: normalizedDomains.error.message, isError: true };
    }

    return {
      message: `Will be saved as ${normalizedDomains.value.join(", ")}.`,
      isError: false,
    };
  })();
  const canSave =
    nameValue.length > 0 &&
    valueValue.length > 0 &&
    !errors.name &&
    !errors.value &&
    !errors.allowedDomainsText &&
    !isNameTakenByOtherKind &&
    !isUpsertingWorkspaceSandboxEnvVar;

  const domainsDialogParsed = parseAllowedDomainsText(domainsText);
  const domainsDialogNormalized =
    domainsDialogParsed.length > 0
      ? normalizeEgressPolicyDomains(domainsDialogParsed)
      : null;
  const domainsDialogMessage =
    domainsDialogNormalized?.isErr() === true
      ? domainsDialogNormalized.error.message
      : domainsDialogNormalized?.isOk() === true
        ? `Will be saved as ${domainsDialogNormalized.value.join(", ")}.`
        : ALLOWED_DOMAINS_HELPER_TEXT;
  const isDomainsDialogInvalid = domainsDialogNormalized?.isErr() === true;
  const canSaveDomains =
    domainsDialogNormalized?.isOk() === true &&
    domainsDialogNormalized.value.length > 0 &&
    !isPatchingWorkspaceSandboxEnvVar;

  const closeDialog = () => {
    setIsDialogOpen(false);
    setIsNameLocked(false);
    setEnvVarToReplace(null);
    reset(DEFAULT_FORM_VALUES);
  };

  const openAddDialog = () => {
    reset(DEFAULT_FORM_VALUES);
    setEnvVarToReplace(null);
    setIsNameLocked(false);
    setIsDialogOpen(true);
  };

  const openReplaceDialog = (envVar: WorkspaceSandboxEnvVarType) => {
    reset({
      name: getEnvVarSuffix(envVar),
      value: "",
      kind: envVar.kind,
      allowedDomainsText: envVar.allowedDomains?.join(", ") ?? "",
    });
    setEnvVarToReplace(envVar);
    setIsNameLocked(true);
    setIsDialogOpen(true);
  };

  const openConfigureDomainsDialog = (envVar: WorkspaceSandboxEnvVarType) => {
    setDomainsText(envVar.allowedDomains?.join(", ") ?? "");
    setEnvVarToConfigureDomains(envVar);
  };

  const onSubmit = async (data: FormValues) => {
    const shouldCreateSecretWithDomains =
      data.kind === "https_secret" && envVarToReplace === null;
    const normalizedDomains = shouldCreateSecretWithDomains
      ? normalizeEgressPolicyDomains(
          parseAllowedDomainsText(data.allowedDomainsText)
        )
      : null;
    if (normalizedDomains?.isErr() === true) {
      return;
    }

    const success = await upsertWorkspaceSandboxEnvVar({
      name: `${envVarPrefixForKind(data.kind)}${data.name}`,
      value: data.value,
      kind: data.kind,
      allowedDomains:
        normalizedDomains?.isOk() === true
          ? normalizedDomains.value
          : undefined,
    });
    if (success) {
      closeDialog();
    }
  };

  const handleConfigureDomains = async () => {
    if (!envVarToConfigureDomains || domainsDialogNormalized?.isOk() !== true) {
      return;
    }

    const success = await patchWorkspaceSandboxEnvVar({
      envVar: envVarToConfigureDomains,
      kind:
        envVarToConfigureDomains.kind === "config" ? "https_secret" : undefined,
      allowedDomains: domainsDialogNormalized.value,
    });
    if (success) {
      setEnvVarToConfigureDomains(null);
      setDomainsText("");
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
    if (!hasSandboxAdmin) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Sandbox workspace administration is not enabled for this workspace.
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

        <ContentMessage
          variant="info"
          icon={InformationCircleIcon}
          size="lg"
          title="Changes apply to new sandboxes only"
        >
          Env vars are snapshotted at sandbox boot. Running sandboxes keep their
          original values; new sandboxes (new conversations, restarts) pick up
          the latest.
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
                    <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      {labelForKind(envVar.kind)}
                      {envVar.kind === "https_secret" &&
                      envVar.allowedDomains?.length
                        ? ` - ${envVar.allowedDomains.join(", ")}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="mini"
                      icon={envVar.kind === "config" ? LockIcon : GlobeAltIcon}
                      tooltip={
                        envVar.kind === "config"
                          ? `Promote ${envVar.name} to HTTPS secret`
                          : `Edit allowed domains for ${envVar.name}`
                      }
                      disabled={
                        isUpsertingWorkspaceSandboxEnvVar ||
                        isDeletingWorkspaceSandboxEnvVar ||
                        isPatchingWorkspaceSandboxEnvVar
                      }
                      onClick={() => openConfigureDomainsDialog(envVar)}
                    />
                    <Button
                      variant="outline"
                      size="mini"
                      icon={PencilSquareIcon}
                      tooltip={`Replace value of ${envVar.name}`}
                      disabled={
                        isUpsertingWorkspaceSandboxEnvVar ||
                        isDeletingWorkspaceSandboxEnvVar ||
                        isPatchingWorkspaceSandboxEnvVar
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
                        isUpsertingWorkspaceSandboxEnvVar ||
                        isPatchingWorkspaceSandboxEnvVar
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
              {!isNameLocked ? (
                <div className="flex flex-col gap-2">
                  <Label>Type</Label>
                  <RadioGroup
                    value={kindField.value}
                    onValueChange={(value) => {
                      switch (value) {
                        case "config":
                        case "https_secret":
                          kindField.onChange(value);
                          return;
                      }
                    }}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    <RadioGroupItem
                      id="sandbox-env-var-kind-config"
                      value="config"
                      label="Config"
                      disabled={isUpsertingWorkspaceSandboxEnvVar}
                    />
                    <RadioGroupItem
                      id="sandbox-env-var-kind-https-secret"
                      value="https_secret"
                      label="HTTPS secret"
                      disabled={isUpsertingWorkspaceSandboxEnvVar}
                    />
                  </RadioGroup>
                </div>
              ) : null}
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
                    title={`The ${namePrefix} prefix is reserved and cannot be removed.`}
                  >
                    {namePrefix}
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
              {kindValue === "https_secret" && envVarToReplace === null ? (
                <Input
                  label="Allowed domains"
                  placeholder="api.github.com, *.github.com"
                  message={allowedDomainsMessage?.message}
                  messageStatus={
                    allowedDomainsMessage?.isError ? "error" : "info"
                  }
                  disabled={isUpsertingWorkspaceSandboxEnvVar}
                  {...register("allowedDomainsText")}
                />
              ) : null}
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

      {envVarToConfigureDomains ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEnvVarToConfigureDomains(null);
              setDomainsText("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {envVarToConfigureDomains.kind === "config"
                  ? `Promote ${envVarToConfigureDomains.name}`
                  : `Allowed domains for ${envVarToConfigureDomains.name}`}
              </DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Page.Vertical align="stretch" gap="md">
                {envVarToConfigureDomains.kind === "config" ? (
                  <ContentMessage
                    variant="warning"
                    icon={InformationCircleIcon}
                    title="Promotion only takes effect on next wake"
                  >
                    Running sandboxes keep the previous {SANDBOX_ENV_VAR_PREFIX}
                    -prefixed value until they are restarted, and the
                    secrets-file substitution path is not live yet, so promoted
                    variables will not be available to new sandboxes either
                    until that ships.
                  </ContentMessage>
                ) : null}
                <Input
                  label="Allowed domains"
                  name="sandbox-env-var-allowed-domains"
                  placeholder="api.github.com, *.github.com"
                  value={domainsText}
                  message={domainsDialogMessage}
                  messageStatus={isDomainsDialogInvalid ? "error" : "info"}
                  disabled={isPatchingWorkspaceSandboxEnvVar}
                  onChange={(event) => setDomainsText(event.target.value)}
                />
              </Page.Vertical>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => {
                  setEnvVarToConfigureDomains(null);
                  setDomainsText("");
                },
              }}
              rightButtonProps={{
                label:
                  envVarToConfigureDomains.kind === "config"
                    ? "Promote"
                    : "Save",
                icon:
                  envVarToConfigureDomains.kind === "config"
                    ? LockIcon
                    : GlobeAltIcon,
                onClick: () => {
                  void handleConfigureDomains();
                },
                disabled: !canSaveDomains,
                isLoading: isPatchingWorkspaceSandboxEnvVar,
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

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
