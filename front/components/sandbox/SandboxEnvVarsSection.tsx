import {
  ENV_VAR_NAME_SUFFIX_REGEX,
  envVarPrefixForKind,
  MAX_HTTPS_SECRET_VALUE_BYTES,
  MAX_VALUE_BYTES,
  normalizeHttpsSecretAllowedDomains,
  SANDBOX_ENV_VAR_PREFIX,
} from "@app/lib/api/sandbox/env_vars";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { timeAgoFrom } from "@app/lib/client/relative_time";
import {
  useDeleteSandboxEnvVar,
  usePatchSandboxEnvVar,
  useSandboxEnvVars,
  useUpsertSandboxEnvVar,
} from "@app/lib/swr/sandbox";
import type {
  SandboxEnvVarKind,
  SandboxEnvVarType,
} from "@app/types/sandbox/env_var";
import { SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

function parseAllowedDomainsText(value: string): string[] {
  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter((domain) => domain.length > 0);
}

function getEnvVarSuffix(envVar: SandboxEnvVarType): string {
  const prefix = envVarPrefixForKind(envVar.kind);
  return envVar.name.startsWith(prefix)
    ? envVar.name.slice(prefix.length)
    : envVar.name;
}

function labelForKind(kind: SandboxEnvVarKind): MessageDescriptor | null {
  switch (kind) {
    case "config":
      return msg`Config`;
    case "https_secret":
      return msg`HTTPS secret`;
    default:
      assertNeverAndIgnore(kind);
      return null;
  }
}

function getFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z
    .object({
      name: z
        .string()
        .min(
          1,
          t(
            msg`Uppercase letters, digits and underscores. Up to 64 characters after the prefix.`
          )
        )
        .regex(
          ENV_VAR_NAME_SUFFIX_REGEX,
          t(
            msg`Suffix must start with A-Z and then use only A-Z, 0-9, or underscore, up to 64 characters.`
          )
        ),
      value: z.string().min(1, t(msg`Value is required.`)),
      kind: z.enum(SANDBOX_ENV_VAR_KINDS),
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
              message: t(msg`Values cannot contain NUL bytes.`),
            });
          }
          if (valueBytes > MAX_VALUE_BYTES) {
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: t(msg`Values cannot exceed 32 KiB.`),
            });
          }
          return;
        }

        case "https_secret": {
          if (/[\u0000-\u001F\u007F]/.test(data.value)) {
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: t(
                msg`HTTPS secret values cannot contain ASCII control bytes.`
              ),
            });
          }
          if (valueBytes > MAX_HTTPS_SECRET_VALUE_BYTES) {
            const maxKiB = MAX_HTTPS_SECRET_VALUE_BYTES / 1_024;
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: t(msg`HTTPS secret values cannot exceed ${maxKiB} KiB.`),
            });
          }

          const allowedDomains = parseAllowedDomainsText(
            data.allowedDomainsText
          );
          if (allowedDomains.length === 0) {
            ctx.addIssue({
              code: "custom",
              path: ["allowedDomainsText"],
              message: t(
                msg`HTTPS secrets require at least one allowed domain.`
              ),
            });
            return;
          }

          const normalizedDomains =
            normalizeHttpsSecretAllowedDomains(allowedDomains);
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
}

type FormValues = z.infer<ReturnType<typeof getFormSchema>>;

const WORKSPACE_ENV_VARS_DESCRIPTION = msg`Secrets mounted as env vars on every Computer in this workspace.`;
const POD_ENV_VARS_DESCRIPTION = msg`Secrets mounted as env vars on every Computer in this Pod. Workspace variables are inherited — a Pod variable with the same name takes precedence. Changes apply to future Computers.`;
const POD_ENV_VARS_READ_ONLY_DESCRIPTION = msg`Secrets mounted as env vars on every Computer in this Pod. Workspace variables are inherited — a Pod variable with the same name takes precedence. Changes apply to future Computers. Workspace admins manage these variables.`;

const DEFAULT_FORM_VALUES: FormValues = {
  name: "",
  value: "",
  kind: "config",
  allowedDomainsText: "",
};

interface SandboxEnvVarsSectionProps {
  owner: LightWorkspaceType;
  // Present for pod-scoped env vars (pods are project spaces); absent for
  // workspace-scoped ones.
  spaceId?: string;
  // Tie to visibility when the section can be mounted but hidden.
  disabled?: boolean;
  // Values are write-only, so the list (names, kinds, domains) is safe to show
  // read-only; mutation affordances render only when editing is allowed.
  // Defaults to workspace-admin, matching the API's write gates.
  canEdit?: boolean;
}

export function SandboxEnvVarsSection({
  owner,
  spaceId,
  disabled = false,
  canEdit,
}: SandboxEnvVarsSectionProps) {
  const { t } = useLingui();
  const formSchema = useMemo(() => getFormSchema(t), [t]);
  const nameHelperText = t`Uppercase letters, digits and underscores. Up to 64 characters after the prefix.`;
  const allowedDomainsHelperText = t`Use exact domains such as api.openai.com or wildcards such as *.mistral.ai.`;
  const savedAsMessage = (domains: string) => t`Will be saved as ${domains}.`;
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxAdmin = isComputerFeatureEnabled(featureFlags);
  const allowEdit = canEdit ?? isAdmin;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNameLocked, setIsNameLocked] = useState(false);
  const [envVarToReplace, setEnvVarToReplace] =
    useState<SandboxEnvVarType | null>(null);
  const [envVarToDelete, setEnvVarToDelete] =
    useState<SandboxEnvVarType | null>(null);
  const [envVarToConfigureDomains, setEnvVarToConfigureDomains] =
    useState<SandboxEnvVarType | null>(null);
  const [domainsText, setDomainsText] = useState("");

  const { envVars, isSandboxEnvVarsLoading, isSandboxEnvVarsError } =
    useSandboxEnvVars({
      owner,
      spaceId,
      disabled: disabled || !hasSandboxAdmin,
    });
  const { upsertSandboxEnvVar, isUpsertingSandboxEnvVar } =
    useUpsertSandboxEnvVar({ owner, spaceId });
  const { patchSandboxEnvVar, isPatchingSandboxEnvVar } = usePatchSandboxEnvVar(
    { owner, spaceId }
  );
  const { deleteSandboxEnvVar, isDeletingSandboxEnvVar } =
    useDeleteSandboxEnvVar({ owner, spaceId });

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
        message: errors.name.message ?? nameHelperText,
        isError: true,
      };
    }
    if (nameValue.length === 0) {
      return { message: nameHelperText, isError: false };
    }
    if (isNameTakenByOtherKind) {
      const existingName = existingEnvVarForSuffix?.name ?? fullName;
      return {
        message: t`A variable with this suffix already exists as ${existingName}.`,
        isError: true,
      };
    }
    return {
      message: isReplacing
        ? t`A variable with this name already exists. Saving will replace its value.`
        : t`This name can be saved.`,
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
    return {
      message:
        kindValue === "https_secret"
          ? t`${valueBytes} / ${maxBytes} bytes. ASCII control bytes are not allowed.`
          : t`${valueBytes} / ${maxBytes} bytes. Multiline values are allowed.`,
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
      return { message: allowedDomainsHelperText, isError: false };
    }

    const normalizedDomains =
      normalizeHttpsSecretAllowedDomains(allowedDomains);
    if (normalizedDomains.isErr()) {
      return { message: normalizedDomains.error.message, isError: true };
    }

    return {
      message: savedAsMessage(normalizedDomains.value.join(", ")),
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
    !isUpsertingSandboxEnvVar;

  const domainsDialogParsed = parseAllowedDomainsText(domainsText);
  const domainsDialogNormalized =
    domainsDialogParsed.length > 0
      ? normalizeHttpsSecretAllowedDomains(domainsDialogParsed)
      : null;
  const domainsDialogSavedDomains =
    domainsDialogNormalized?.isOk() === true
      ? domainsDialogNormalized.value.join(", ")
      : null;
  const domainsDialogMessage =
    domainsDialogNormalized?.isErr() === true
      ? domainsDialogNormalized.error.message
      : domainsDialogSavedDomains !== null
        ? savedAsMessage(domainsDialogSavedDomains)
        : allowedDomainsHelperText;
  const isDomainsDialogInvalid = domainsDialogNormalized?.isErr() === true;
  const canSaveDomains =
    domainsDialogNormalized?.isOk() === true &&
    domainsDialogNormalized.value.length > 0 &&
    !isPatchingSandboxEnvVar;

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

  const openReplaceDialog = (envVar: SandboxEnvVarType) => {
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

  const openConfigureDomainsDialog = (envVar: SandboxEnvVarType) => {
    setDomainsText(envVar.allowedDomains?.join(", ") ?? "");
    setEnvVarToConfigureDomains(envVar);
  };

  const onSubmit = async (data: FormValues) => {
    const shouldCreateSecretWithDomains =
      data.kind === "https_secret" && envVarToReplace === null;
    const normalizedDomains = shouldCreateSecretWithDomains
      ? normalizeHttpsSecretAllowedDomains(
          parseAllowedDomainsText(data.allowedDomainsText)
        )
      : null;
    if (normalizedDomains?.isErr() === true) {
      return;
    }

    const success = await upsertSandboxEnvVar({
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

    const success = await patchSandboxEnvVar({
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

    const success = await deleteSandboxEnvVar(envVarToDelete);
    if (success) {
      setEnvVarToDelete(null);
    }
  };

  const configureDomainsEnvVarName = envVarToConfigureDomains?.name;
  const envVarToDeleteName = envVarToDelete?.name;

  const renderBody = () => {
    if (!hasSandboxAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          <Trans>
            Computer administration is not enabled for this workspace.
          </Trans>
        </ContentMessage>
      );
    }
    if (isSandboxEnvVarsLoading) {
      return <Spinner />;
    }
    if (isSandboxEnvVarsError) {
      return (
        <ContentMessage
          variant="warning"
          icon={InfoCircle}
          size="lg"
          title={t`Failed to load`}
        >
          <Trans>The Computer environment variables could not be loaded.</Trans>
        </ContentMessage>
      );
    }

    const podDescription = allowEdit
      ? POD_ENV_VARS_DESCRIPTION
      : POD_ENV_VARS_READ_ONLY_DESCRIPTION;
    const description = t(
      spaceId ? podDescription : WORKSPACE_ENV_VARS_DESCRIPTION
    );

    return (
      <Page.Vertical align="stretch" gap="lg">
        <Page.SectionHeader
          title={t`Environment variables`}
          description={description}
        />

        {allowEdit && (
          <ContentMessage
            variant="primary"
            icon={InfoCircle}
            size="lg"
            title={t`Choose the right kind for each value`}
          >
            <div className="flex flex-col gap-2">
              <div>
                <Trans>
                  <strong>HTTPS secrets (DSEC_)</strong> — for credentials and
                  anything sensitive. Stored encrypted on the host. The dsbx
                  forwarder injects the value only into outbound HTTPS requests
                  to the domains you whitelist; code running in the Computer
                  never sees the raw value. Safe for API keys, tokens, and other
                  secrets bound to a known external service.
                </Trans>
              </div>
              <div>
                <Trans>
                  <strong>Config ({SANDBOX_ENV_VAR_PREFIX})</strong> — for
                  non-sensitive configuration: feature flags, identifiers,
                  public endpoints, model names. Mounted as plain env vars on
                  every new Computer and read directly by the agent and the code
                  it runs. Anything you put here should be safe to log; do not
                  use for credentials.
                </Trans>
              </div>
              <div>
                <Trans>
                  Values are write-only: they cannot be viewed after saving,
                  only overwritten or deleted. Env vars are snapshotted when the
                  Computer starts: an already-running Computer keeps its
                  original values, and any new Computer (new conversation,
                  restart) picks up the latest.
                </Trans>
              </div>
            </div>
          </ContentMessage>
        )}

        {allowEdit && (
          <div className="flex justify-end">
            <Button
              label={t`Add variable`}
              icon={Plus}
              onClick={openAddDialog}
              disabled={isUpsertingSandboxEnvVar}
            />
          </div>
        )}

        {envVars.length === 0 ? (
          <ContentMessage variant="primary" size="lg">
            <Trans>No environment variables yet.</Trans>
          </ContentMessage>
        ) : (
          <ListGroup>
            {envVars.map((envVar) => {
              const envVarName = envVar.name;
              const kindLabel = labelForKind(envVar.kind);
              const updatedAgo = timeAgoFrom(envVar.updatedAt, {
                useLongFormat: true,
              });
              const updatedBy =
                envVar.lastUpdatedByName ?? envVar.createdByName ?? t`Unknown`;
              const isAnyMutationPending =
                isUpsertingSandboxEnvVar ||
                isDeletingSandboxEnvVar ||
                isPatchingSandboxEnvVar;

              return (
                <ListItem key={envVar.name} itemsAlignment="center">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <pre
                      title={envVar.name}
                      className="min-w-0 self-start overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
                    >
                      {envVar.name}
                    </pre>
                    <div className="text-xs text-muted-foreground">
                      <Trans>
                        Updated {updatedAgo} by {updatedBy}
                      </Trans>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip
                        size="xs"
                        color={
                          envVar.kind === "https_secret" ? "warning" : "info"
                        }
                        label={kindLabel ? t(kindLabel) : ""}
                      />
                      {envVar.kind === "https_secret" &&
                        envVar.allowedDomains?.map((domain) => (
                          <Chip
                            key={domain}
                            size="xs"
                            color="primary"
                            label={domain}
                          />
                        ))}
                    </div>
                  </div>
                  {allowEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="mini"
                        icon={envVar.kind === "config" ? Lock01 : Globe01}
                        tooltip={
                          envVar.kind === "config"
                            ? t`Promote ${envVarName} to HTTPS secret`
                            : t`Edit allowed domains for ${envVarName}`
                        }
                        disabled={isAnyMutationPending}
                        onClick={() => openConfigureDomainsDialog(envVar)}
                      />
                      <Button
                        variant="outline"
                        size="mini"
                        icon={Edit04}
                        tooltip={t`Replace value of ${envVarName}`}
                        disabled={isAnyMutationPending}
                        onClick={() => openReplaceDialog(envVar)}
                      />
                      <Button
                        variant="warning"
                        size="mini"
                        icon={Trash01}
                        tooltip={t`Delete ${envVarName}`}
                        disabled={isAnyMutationPending}
                        onClick={() => setEnvVarToDelete(envVar)}
                      />
                    </div>
                  )}
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
              {isReplacing ? (
                <Trans>Replace variable</Trans>
              ) : (
                <Trans>Add variable</Trans>
              )}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Page.Vertical align="stretch" gap="md">
              {!isNameLocked ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <Label>
                        <Trans>HTTPS secret</Trans>
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        <Trans>
                          Keep the value out of the Computer environment.
                        </Trans>
                      </span>
                    </div>
                    <SliderToggle
                      selected={kindField.value === "https_secret"}
                      disabled={isUpsertingSandboxEnvVar}
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
                      <Trans>
                        Stored securely. The dsbx forwarder injects it only into
                        outbound HTTPS requests to whitelisted domains; Computer
                        code never reads it.
                      </Trans>
                    ) : (
                      <Trans>
                        Mounted as a prefixed env var on every new Computer and
                        read directly by the agent and any code it runs. Use for
                        non-sensitive values.
                      </Trans>
                    )}
                  </ContentMessage>
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <Label htmlFor="sandbox-env-var-name">
                  <Trans>Name</Trans>
                </Label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-0 flex h-9 select-none items-center text-sm text-muted-foreground"
                    aria-hidden="true"
                    title={t`The ${namePrefix} prefix is reserved and cannot be removed.`}
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
                    disabled={isUpsertingSandboxEnvVar || isNameLocked}
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
                    label={t`Allowed domains`}
                    placeholder={t`e.g. api.openai.com, *.mistral.ai`}
                    message={
                      kindValue === "https_secret"
                        ? allowedDomainsMessage?.message
                        : t`Only used when HTTPS secret is on.`
                    }
                    messageStatus={
                      kindValue === "https_secret" &&
                      allowedDomainsMessage?.isError
                        ? "error"
                        : "info"
                    }
                    disabled={
                      isUpsertingSandboxEnvVar || kindValue !== "https_secret"
                    }
                    {...register("allowedDomainsText")}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <Label htmlFor="sandbox-env-var-value">
                  <Trans>Value</Trans>
                </Label>
                <TextArea
                  id="sandbox-env-var-value"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  minRows={8}
                  placeholder={t`Paste the secret value`}
                  error={valueMessage.isError ? valueMessage.message : null}
                  showErrorLabel={false}
                  resize="vertical"
                  disabled={isUpsertingSandboxEnvVar}
                  {...register("value")}
                />
                <div
                  className={
                    valueMessage.isError
                      ? "text-xs text-foreground-warning"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {valueMessage.message}
                </div>
              </div>
            </Page.Vertical>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Cancel`,
              variant: "outline",
              onClick: closeDialog,
            }}
            rightButtonProps={{
              label: isReplacing ? t`Replace` : t`Save`,
              icon: Lock01,
              onClick: () => {
                void handleSubmit(onSubmit)();
              },
              disabled: !canSave,
              isLoading: isUpsertingSandboxEnvVar,
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
                {envVarToConfigureDomains.kind === "config" ? (
                  <Trans>Promote {configureDomainsEnvVarName}</Trans>
                ) : (
                  <Trans>
                    Allowed domains for {configureDomainsEnvVarName}
                  </Trans>
                )}
              </DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Page.Vertical align="stretch" gap="md">
                {envVarToConfigureDomains.kind === "config" ? (
                  <ContentMessage
                    variant="warning"
                    icon={InfoCircle}
                    title={t`Promotion only takes effect on next wake`}
                  >
                    <Trans>
                      Running Computers keep the previous{" "}
                      {SANDBOX_ENV_VAR_PREFIX}-prefixed value in their env until
                      they are restarted. New Computers will receive the
                      promoted secret only via egress-time substitution to the
                      allowed domains.
                    </Trans>
                  </ContentMessage>
                ) : null}
                <Input
                  label={t`Allowed domains`}
                  name="sandbox-env-var-allowed-domains"
                  placeholder={t`e.g. api.openai.com, *.mistral.ai`}
                  value={domainsText}
                  message={domainsDialogMessage}
                  messageStatus={isDomainsDialogInvalid ? "error" : "info"}
                  disabled={isPatchingSandboxEnvVar}
                  onChange={(event) => setDomainsText(event.target.value)}
                />
              </Page.Vertical>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
                onClick: () => {
                  setEnvVarToConfigureDomains(null);
                  setDomainsText("");
                },
              }}
              rightButtonProps={{
                label:
                  envVarToConfigureDomains.kind === "config"
                    ? t`Promote`
                    : t`Save`,
                icon:
                  envVarToConfigureDomains.kind === "config" ? Lock01 : Globe01,
                onClick: () => {
                  void handleConfigureDomains();
                },
                disabled: !canSaveDomains,
                isLoading: isPatchingSandboxEnvVar,
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
              <DialogTitle>
                <Trans>Delete {envVarToDeleteName}</Trans>
              </DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Trans>
                Are you sure you want to delete{" "}
                <strong>{envVarToDeleteName}</strong>?
              </Trans>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
                onClick: () => setEnvVarToDelete(null),
              }}
              rightButtonProps={{
                label: t`Delete`,
                variant: "warning",
                onClick: () => {
                  void handleDelete();
                },
                isLoading: isDeletingSandboxEnvVar,
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {renderBody()}
    </>
  );
}
