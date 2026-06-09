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
  Chip,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Edit04,
  Globe01,
  InfoCircle,
  Input,
  Label,
  ListGroup,
  ListItem,
  Lock01,
  Page,
  Plus,
  SliderToggle,
  Spinner,
  TextArea,
  Trash01,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const NAME_HELPER_TEXT =
  "Uppercase letters, digits and underscores. Up to 64 characters after the prefix.";

const ALLOWED_DOMAINS_HELPER_TEXT =
  "Use exact domains such as api.openai.com or wildcards such as *.mistral.ai.";

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
    trigger,
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
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage Computer environment variables.
        </ContentMessage>
      );
    }
    if (!hasSandboxAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Computer administration is not enabled for this workspace.
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
          icon={InfoCircle}
          size="lg"
          title="Failed to load"
        >
          The Computer environment variables could not be loaded.
        </ContentMessage>
      );
    }

    return (
      <Page.Vertical align="stretch" gap="lg">
        <Page.SectionHeader
          title="Environment variables"
          description="Secrets mounted as env vars on every Computer in this workspace."
        />

        <ContentMessage
          variant="info"
          icon={InfoCircle}
          size="lg"
          title="Choose the right kind for each value"
        >
          <div className="flex flex-col gap-2">
            <div>
              <strong>HTTPS secrets (DSEC_)</strong> — for credentials and
              anything sensitive. Stored encrypted on the host. The dsbx
              forwarder injects the value only into outbound HTTPS requests to
              the domains you whitelist; code running in the Computer never sees
              the raw value. Safe for API keys, tokens, and other secrets bound
              to a known external service.
            </div>
            <div>
              <strong>Config ({SANDBOX_ENV_VAR_PREFIX})</strong> — for
              non-sensitive configuration: feature flags, identifiers, public
              endpoints, model names. Mounted as plain env vars on every new
              Computer and read directly by the agent and the code it runs.
              Anything you put here should be safe to log; do not use for
              credentials.
            </div>
            <div>
              Values are write-only: they cannot be viewed after saving, only
              overwritten or deleted. Env vars are snapshotted when the Computer
              starts: an already-running Computer keeps its original values, and
              any new Computer (new conversation, restart) picks up the latest.
            </div>
          </div>
        </ContentMessage>

        <div className="flex justify-end">
          <Button
            label="Add variable"
            icon={Plus}
            onClick={openAddDialog}
            disabled={isUpsertingWorkspaceSandboxEnvVar}
          />
        </div>

        {envVars.length === 0 ? (
          <ContentMessage variant="primary" size="lg">
            No environment variables yet.
          </ContentMessage>
        ) : (
          <ListGroup>
            {envVars.map((envVar) => {
              const updatedBy =
                envVar.lastUpdatedByName ?? envVar.createdByName ?? "Unknown";
              const isAnyMutationPending =
                isUpsertingWorkspaceSandboxEnvVar ||
                isDeletingWorkspaceSandboxEnvVar ||
                isPatchingWorkspaceSandboxEnvVar;

              return (
                <ListItem key={envVar.name} itemsAlignment="center">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip
                        size="xs"
                        color={
                          envVar.kind === "https_secret" ? "warning" : "info"
                        }
                        label={labelForKind(envVar.kind)}
                      />
                      {envVar.kind === "https_secret" &&
                        envVar.allowedDomains?.map((domain) => (
                          <Chip
                            key={domain}
                            size="xs"
                            color="white"
                            label={domain}
                          />
                        ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="mini"
                      icon={envVar.kind === "config" ? Lock01 : Globe01}
                      tooltip={
                        envVar.kind === "config"
                          ? `Promote ${envVar.name} to HTTPS secret`
                          : `Edit allowed domains for ${envVar.name}`
                      }
                      disabled={isAnyMutationPending}
                      onClick={() => openConfigureDomainsDialog(envVar)}
                    />
                    <Button
                      variant="outline"
                      size="mini"
                      icon={Edit04}
                      tooltip={`Replace value of ${envVar.name}`}
                      disabled={isAnyMutationPending}
                      onClick={() => openReplaceDialog(envVar)}
                    />
                    <Button
                      variant="warning"
                      size="mini"
                      icon={Trash01}
                      tooltip={`Delete ${envVar.name}`}
                      disabled={isAnyMutationPending}
                      onClick={() => setEnvVarToDelete(envVar)}
                    />
                  </div>
                </ListItem>
              );
            })}
          </ListGroup>
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <Label>HTTPS secret</Label>
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        Keep the value out of the Computer environment.
                      </span>
                    </div>
                    <SliderToggle
                      size="sm"
                      selected={kindField.value === "https_secret"}
                      disabled={isUpsertingWorkspaceSandboxEnvVar}
                      onClick={() => {
                        kindField.onChange(
                          kindField.value === "https_secret"
                            ? "config"
                            : "https_secret"
                        );
                        void trigger(["value", "allowedDomainsText"]);
                      }}
                    />
                  </div>
                  <ContentMessage
                    variant={kindValue === "https_secret" ? "info" : "warning"}
                    icon={kindValue === "https_secret" ? Lock01 : Globe01}
                    size="sm"
                  >
                    {kindValue === "https_secret" ? (
                      <>
                        Stored securely. The dsbx forwarder injects it only into
                        outbound HTTPS requests to whitelisted domains; Computer
                        code never reads it.
                      </>
                    ) : (
                      <>
                        Mounted as a prefixed env var on every new Computer and
                        read directly by the agent and any code it runs. Use for
                        non-sensitive values.
                      </>
                    )}
                  </ContentMessage>
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <Label htmlFor="sandbox-env-var-name">Name</Label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-0 flex h-9 select-none items-center text-sm text-muted-foreground dark:text-muted-foreground-night"
                    aria-hidden="true"
                    title={`The ${namePrefix} prefix is reserved and cannot be removed.`}
                  >
                    {namePrefix}
                  </span>
                  <Input
                    id="sandbox-env-var-name"
                    type="text"
                    placeholder="API_TOKEN"
                    className={namePrefix === "DSEC_" ? "pl-14" : "pl-11"}
                    isError={nameMessage.isError}
                    message={nameMessage.message}
                    messageStatus={nameMessage.isError ? "error" : "info"}
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
              </div>
              {envVarToReplace === null ? (
                <div
                  className={
                    kindValue === "https_secret"
                      ? undefined
                      : "pointer-events-none opacity-40"
                  }
                  aria-disabled={kindValue !== "https_secret"}
                >
                  <Input
                    label="Allowed domains"
                    placeholder="e.g. api.openai.com, *.mistral.ai"
                    message={
                      kindValue === "https_secret"
                        ? allowedDomainsMessage?.message
                        : "Only used when HTTPS secret is on."
                    }
                    messageStatus={
                      kindValue === "https_secret" &&
                      allowedDomainsMessage?.isError
                        ? "error"
                        : "info"
                    }
                    disabled={
                      isUpsertingWorkspaceSandboxEnvVar ||
                      kindValue !== "https_secret"
                    }
                    {...register("allowedDomainsText")}
                  />
                </div>
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
              icon: Lock01,
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
                    icon={InfoCircle}
                    title="Promotion only takes effect on next wake"
                  >
                    Running Computers keep the previous {SANDBOX_ENV_VAR_PREFIX}
                    -prefixed value in their env until they are restarted. New
                    Computers will receive the promoted secret only via
                    egress-time substitution to the allowed domains.
                  </ContentMessage>
                ) : null}
                <Input
                  label="Allowed domains"
                  name="sandbox-env-var-allowed-domains"
                  placeholder="e.g. api.openai.com, *.mistral.ai"
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
                  envVarToConfigureDomains.kind === "config" ? Lock01 : Globe01,
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
